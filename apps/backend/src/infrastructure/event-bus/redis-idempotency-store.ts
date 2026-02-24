import type { EventIdempotencyStore } from "../../modules/signal-ingestion/types.js";
import type { AppRedisClient } from "../redis/client.js";

function dedupKey(stream: string, eventId: string): string {
  return `dedup:${stream}:${eventId}`;
}

export class RedisIdempotencyStore implements EventIdempotencyStore {
  constructor(
    private readonly redis: AppRedisClient,
    private readonly ttlSeconds: number
  ) {
    if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
      throw new Error("RedisIdempotencyStore ttlSeconds must be a positive integer");
    }
  }

  async markIfFirstSeen(stream: string, eventId: string): Promise<boolean> {
    const result = await this.redis.set(dedupKey(stream, eventId), "1", {
      NX: true,
      EX: this.ttlSeconds
    });
    return result === "OK";
  }

  async clear(stream: string, eventId: string): Promise<void> {
    await this.redis.del(dedupKey(stream, eventId));
  }
}
