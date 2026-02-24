import type { EventConsumer } from "./types.js";
import type { AppRedisClient } from "../redis/client.js";

export interface RedisStreamConsumerWorkerOptions<TMessage> {
  consumer: EventConsumer;
  redis: AppRedisClient;
  stream: string;
  group: string;
  consumerName: string;
  batchSize: number;
  blockMs: number;
  maxDeliveries: number;
  retryKeyTtlSeconds: number;
  handler: (message: TMessage) => Promise<void>;
  retryBackoffMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function retryKey(stream: string, messageId: string): string {
  return `retry:${stream}:${messageId}`;
}

export class RedisStreamConsumerWorker<TMessage> {
  private running = false;
  private readonly retryBackoffMs: number;

  constructor(private readonly options: RedisStreamConsumerWorkerOptions<TMessage>) {
    this.retryBackoffMs = options.retryBackoffMs ?? 250;
  }

  async init(): Promise<void> {
    await this.options.consumer.ensureGroup(this.options.stream, this.options.group);
  }

  async runOnce(): Promise<number> {
    const messages = await this.options.consumer.consumeGroup<TMessage>({
      stream: this.options.stream,
      group: this.options.group,
      consumer: this.options.consumerName,
      count: this.options.batchSize,
      blockMs: this.options.blockMs
    });

    if (messages.length === 0) {
      return 0;
    }

    for (const message of messages) {
      const key = retryKey(this.options.stream, message.id);
      try {
        await this.options.handler(message.message);
        await this.options.consumer.ack(this.options.stream, this.options.group, [message.id]);
        await this.options.redis.del(key);
      } catch (error) {
        const retries = await this.options.redis.incr(key);
        if (retries === 1) {
          await this.options.redis.expire(key, this.options.retryKeyTtlSeconds);
        }

        if (retries >= this.options.maxDeliveries) {
          await this.options.consumer.moveToDlq({
            sourceStream: this.options.stream,
            sourceMessageId: message.id,
            reason: "MAX_DELIVERIES_EXCEEDED",
            payload: message.message,
            metadata: {
              retries,
              consumer: this.options.consumerName,
              error: error instanceof Error ? error.message : String(error)
            }
          });
          await this.options.consumer.ack(this.options.stream, this.options.group, [message.id]);
          await this.options.redis.del(key);
          continue;
        }

        await sleep(this.retryBackoffMs);
      }
    }

    return messages.length;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    while (this.running) {
      await this.runOnce();
    }
  }

  stop(): void {
    this.running = false;
  }
}
