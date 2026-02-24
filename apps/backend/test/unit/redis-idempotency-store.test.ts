import assert from "node:assert/strict";
import test from "node:test";

import { RedisIdempotencyStore } from "../../src/infrastructure/event-bus/redis-idempotency-store.js";
import type { AppRedisClient } from "../../src/infrastructure/redis/client.js";

class FakeRedisClient {
  private readonly keys = new Set<string>();

  async set(
    key: string,
    _value: string,
    options: { NX?: boolean; EX?: number } = {}
  ): Promise<"OK" | null> {
    if (options.NX && this.keys.has(key)) {
      return null;
    }
    this.keys.add(key);
    return "OK";
  }

  async del(key: string): Promise<number> {
    const existed = this.keys.delete(key);
    return existed ? 1 : 0;
  }
}

test("markIfFirstSeen returns true once and false for duplicates", async () => {
  const fakeRedis = new FakeRedisClient() as unknown as AppRedisClient;
  const store = new RedisIdempotencyStore(fakeRedis, 60);

  const first = await store.markIfFirstSeen("external-signals", "evt-1");
  const second = await store.markIfFirstSeen("external-signals", "evt-1");

  assert.equal(first, true);
  assert.equal(second, false);
});

test("clear removes dedup key", async () => {
  const fakeRedis = new FakeRedisClient() as unknown as AppRedisClient;
  const store = new RedisIdempotencyStore(fakeRedis, 60);

  await store.markIfFirstSeen("external-signals", "evt-2");
  await store.clear("external-signals", "evt-2");
  const afterClear = await store.markIfFirstSeen("external-signals", "evt-2");

  assert.equal(afterClear, true);
});
