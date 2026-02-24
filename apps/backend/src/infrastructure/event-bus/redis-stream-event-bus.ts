import { decodeEventMessage, encodeEventMessage } from "./codec.js";
import type { AppRedisClient } from "../redis/client.js";
import type {
  ConsumeGroupParams,
  ConsumerMessage,
  EventBus,
  EventRecord,
  MoveToDlqParams,
  PublishOptions
} from "./types.js";

interface RedisStreamEventBusOptions {
  defaultMaxLen: number;
  ownsClient?: boolean;
}

interface ParsedStreamEntry {
  id: string;
  fields: Record<string, string>;
}

function fieldsArrayToObject(fields: unknown): Record<string, string> {
  if (!Array.isArray(fields)) {
    return {};
  }

  const output: Record<string, string> = {};
  for (let index = 0; index < fields.length; index += 2) {
    const key = fields[index];
    const value = fields[index + 1];
    if (typeof key === "string" && typeof value === "string") {
      output[key] = value;
    }
  }
  return output;
}

function parseXRangeReply(reply: unknown): ParsedStreamEntry[] {
  if (!Array.isArray(reply)) {
    return [];
  }

  const parsed: ParsedStreamEntry[] = [];
  for (const item of reply) {
    if (!Array.isArray(item) || item.length < 2) {
      continue;
    }
    const id = item[0];
    const rawFields = item[1];
    if (typeof id !== "string") {
      continue;
    }
    parsed.push({
      id,
      fields: fieldsArrayToObject(rawFields)
    });
  }
  return parsed;
}

function parseXReadGroupReply(reply: unknown): ParsedStreamEntry[] {
  if (!Array.isArray(reply) || reply.length === 0) {
    return [];
  }

  const parsed: ParsedStreamEntry[] = [];
  for (const streamChunk of reply) {
    if (!Array.isArray(streamChunk) || streamChunk.length < 2) {
      continue;
    }
    const messages = streamChunk[1];
    if (!Array.isArray(messages)) {
      continue;
    }

    for (const messageChunk of messages) {
      if (!Array.isArray(messageChunk) || messageChunk.length < 2) {
        continue;
      }
      const id = messageChunk[0];
      const fields = messageChunk[1];
      if (typeof id !== "string") {
        continue;
      }
      parsed.push({
        id,
        fields: fieldsArrayToObject(fields)
      });
    }
  }
  return parsed;
}

export class RedisStreamEventBus implements EventBus {
  private readonly defaultMaxLen: number;
  private readonly ownsClient: boolean;

  constructor(
    private readonly redis: AppRedisClient,
    options: RedisStreamEventBusOptions
  ) {
    this.defaultMaxLen = options.defaultMaxLen;
    this.ownsClient = options.ownsClient ?? false;
  }

  async publish<TMessage>(
    stream: string,
    message: TMessage,
    options?: PublishOptions
  ): Promise<EventRecord<TMessage>> {
    const encoded = encodeEventMessage(message);
    const maxLen = options?.maxLen ?? this.defaultMaxLen;
    const id = await this.redis.sendCommand([
      "XADD",
      stream,
      "MAXLEN",
      "~",
      String(maxLen),
      "*",
      "payload",
      encoded.payload,
      "published_at_utc",
      encoded.published_at_utc
    ]);

    if (typeof id !== "string") {
      throw new Error(`Unexpected Redis XADD response for stream "${stream}"`);
    }

    return {
      id,
      stream,
      message,
      published_at_utc: encoded.published_at_utc
    };
  }

  async readRecent<TMessage>(stream: string, limit: number): Promise<EventRecord<TMessage>[]> {
    const safeLimit = Math.max(0, Math.trunc(limit));
    if (safeLimit === 0) {
      return [];
    }

    const reply = await this.redis.sendCommand([
      "XREVRANGE",
      stream,
      "+",
      "-",
      "COUNT",
      String(safeLimit)
    ]);

    const parsedEntries = parseXRangeReply(reply);
    const decodedRecords: EventRecord<TMessage>[] = [];
    for (const entry of parsedEntries.reverse()) {
      const decoded = decodeEventMessage<TMessage>(stream, entry.id, entry.fields);
      if (!decoded.ok) {
        continue;
      }
      decodedRecords.push(decoded.record);
    }
    return decodedRecords;
  }

  async ensureGroup(stream: string, group: string, startId = "$"): Promise<void> {
    try {
      await this.redis.sendCommand([
        "XGROUP",
        "CREATE",
        stream,
        group,
        startId,
        "MKSTREAM"
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("BUSYGROUP")) {
        throw error;
      }
    }
  }

  private async readGroupEntries(
    params: ConsumeGroupParams,
    streamId: string,
    blockMs: number
  ): Promise<ConsumerMessage<unknown>[]> {
    const command = [
      "XREADGROUP",
      "GROUP",
      params.group,
      params.consumer,
      "COUNT",
      String(params.count)
    ];

    if (blockMs > 0) {
      command.push("BLOCK", String(blockMs));
    }

    command.push("STREAMS", params.stream, streamId);

    const reply = await this.redis.sendCommand(command);
    const parsedEntries = parseXReadGroupReply(reply);

    const decodedMessages: ConsumerMessage<unknown>[] = [];
    for (const entry of parsedEntries) {
      const decoded = decodeEventMessage<unknown>(params.stream, entry.id, entry.fields);
      if (!decoded.ok) {
        await this.moveToDlq({
          sourceStream: params.stream,
          sourceMessageId: entry.id,
          reason: "MALFORMED_PAYLOAD",
          payload: {
            raw_fields: decoded.rawFields
          },
          metadata: {
            decode_error: decoded.error,
            group: params.group,
            consumer: params.consumer
          }
        });
        await this.ack(params.stream, params.group, [entry.id]);
        continue;
      }

      decodedMessages.push({
        ...decoded.record,
        deliveryCount: 1
      });
    }

    return decodedMessages;
  }

  async consumeGroup<TMessage>(
    params: ConsumeGroupParams
  ): Promise<ConsumerMessage<TMessage>[]> {
    const pendingMessages = await this.readGroupEntries(params, "0", 0);
    if (pendingMessages.length > 0) {
      return pendingMessages as ConsumerMessage<TMessage>[];
    }

    const newMessages = await this.readGroupEntries(params, ">", params.blockMs);
    return newMessages as ConsumerMessage<TMessage>[];
  }

  async ack(stream: string, group: string, ids: string[]): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }

    const result = await this.redis.sendCommand(["XACK", stream, group, ...ids]);
    if (typeof result === "number") {
      return result;
    }
    if (typeof result === "string") {
      const parsed = Number.parseInt(result, 10);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  async moveToDlq(params: MoveToDlqParams): Promise<string> {
    const dlqStream = `${params.sourceStream}.dlq`;
    const dlqRecord = await this.publish(
      dlqStream,
      {
        source_stream: params.sourceStream,
        source_message_id: params.sourceMessageId,
        reason: params.reason,
        payload: params.payload,
        metadata: params.metadata ?? {}
      },
      {
        maxLen: this.defaultMaxLen
      }
    );
    return dlqRecord.id;
  }

  async close(): Promise<void> {
    if (!this.ownsClient) {
      return;
    }

    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}
