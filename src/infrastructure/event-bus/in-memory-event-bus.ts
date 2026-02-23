import type {
  ConsumeGroupParams,
  ConsumerMessage,
  EventBus,
  EventRecord,
  MoveToDlqParams,
  PublishOptions
} from "./types.js";

type AnyEventRecord = EventRecord<unknown>;

function nowIso(): string {
  return new Date().toISOString();
}

export class InMemoryEventBus implements EventBus {
  private readonly streams = new Map<string, AnyEventRecord[]>();
  private readonly publishFailureBudget = new Map<string, number>();
  private sequence = 0;

  setPublishFailureBudget(stream: string, count: number): void {
    const safeCount = Number.isInteger(count) && count > 0 ? count : 0;
    this.publishFailureBudget.set(stream, safeCount);
  }

  async publish<TMessage>(
    stream: string,
    message: TMessage,
    options?: PublishOptions
  ): Promise<EventRecord<TMessage>> {
    const remainingFailures = this.publishFailureBudget.get(stream) ?? 0;
    if (remainingFailures > 0) {
      this.publishFailureBudget.set(stream, remainingFailures - 1);
      throw new Error(`Simulated publish failure for stream "${stream}"`);
    }

    this.sequence += 1;
    const record: EventRecord<TMessage> = {
      id: `${Date.now()}-${this.sequence}`,
      stream,
      message,
      published_at_utc: nowIso()
    };

    const records = this.streams.get(stream) ?? [];
    records.push(record as AnyEventRecord);

    if (options?.maxLen && options.maxLen > 0 && records.length > options.maxLen) {
      const trimCount = records.length - options.maxLen;
      records.splice(0, trimCount);
    }

    this.streams.set(stream, records);
    return record;
  }

  async readRecent<TMessage>(stream: string, limit: number): Promise<EventRecord<TMessage>[]> {
    const records = this.streams.get(stream) ?? [];
    const safeLimit = Math.max(0, Math.trunc(limit));
    if (safeLimit === 0) {
      return [];
    }
    return records.slice(-safeLimit) as EventRecord<TMessage>[];
  }

  async ensureGroup(): Promise<void> {
    return;
  }

  async consumeGroup<TMessage>(
    params: ConsumeGroupParams
  ): Promise<ConsumerMessage<TMessage>[]> {
    const records = await this.readRecent<TMessage>(params.stream, params.count);
    return records.map((record) => ({
      ...record,
      deliveryCount: 1
    }));
  }

  async ack(_stream: string, _group: string, ids: string[]): Promise<number> {
    return ids.length;
  }

  async moveToDlq(params: MoveToDlqParams): Promise<string> {
    const record = await this.publish(`${params.sourceStream}.dlq`, {
      source_stream: params.sourceStream,
      source_message_id: params.sourceMessageId,
      reason: params.reason,
      payload: params.payload,
      metadata: params.metadata ?? {}
    });
    return record.id;
  }

  async close(): Promise<void> {
    return;
  }

  readStream<TMessage = unknown>(stream: string): EventRecord<TMessage>[] {
    return [...(this.streams.get(stream) ?? [])] as EventRecord<TMessage>[];
  }
}
