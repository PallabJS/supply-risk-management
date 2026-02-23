import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { RedisStreamConsumerWorker } from "../../src/infrastructure/event-bus/redis-stream-consumer-worker.js";
import { RedisStreamEventBus } from "../../src/infrastructure/event-bus/redis-stream-event-bus.js";
import { RedisIdempotencyStore } from "../../src/infrastructure/event-bus/redis-idempotency-store.js";
import {
  createConnectedRedisClient,
  type AppRedisClient
} from "../../src/infrastructure/redis/client.js";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

interface RedisBusContext {
  client: AppRedisClient;
  bus: RedisStreamEventBus;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

async function createContext(clientName: string): Promise<RedisBusContext> {
  const client = await createConnectedRedisClient({
    url: redisUrl,
    clientName
  });
  const bus = new RedisStreamEventBus(client, {
    defaultMaxLen: 1_000,
    ownsClient: true
  });
  return { client, bus };
}

async function cleanupPattern(client: AppRedisClient, pattern: string): Promise<void> {
  const keysReply = await client.sendCommand(["KEYS", pattern]);
  const keys = toStringArray(keysReply);
  if (keys.length > 0) {
    await client.sendCommand(["DEL", ...keys]);
  }
}

test("publish survives process restart", async () => {
  const stream = `it:publish:${randomUUID()}`;
  const firstContext = await createContext("it-publish-1");

  try {
    await firstContext.bus.publish(stream, {
      event_id: "evt-redis-1",
      source_type: "NEWS"
    });
  } finally {
    await firstContext.bus.close();
  }

  const secondContext = await createContext("it-publish-2");
  try {
    const recent = await secondContext.bus.readRecent<Record<string, string>>(stream, 10);
    assert.equal(recent.length, 1);
    const record = recent[0];
    assert.ok(record);
    assert.equal(record.message.event_id, "evt-redis-1");
  } finally {
    await cleanupPattern(secondContext.client, stream);
    await secondContext.bus.close();
  }
});

test("dedup blocks duplicate event ids across runs", async () => {
  const stream = `it:dedup:${randomUUID()}`;
  const firstContext = await createContext("it-dedup-1");

  try {
    const store = new RedisIdempotencyStore(firstContext.client, 60);
    const first = await store.markIfFirstSeen(stream, "evt-dedup-1");
    assert.equal(first, true);
  } finally {
    await firstContext.bus.close();
  }

  const secondContext = await createContext("it-dedup-2");
  try {
    const store = new RedisIdempotencyStore(secondContext.client, 60);
    const second = await store.markIfFirstSeen(stream, "evt-dedup-1");
    assert.equal(second, false);
  } finally {
    await cleanupPattern(secondContext.client, `dedup:${stream}:*`);
    await secondContext.bus.close();
  }
});

test("consumer group receives and acks messages", async () => {
  const stream = `it:group:${randomUUID()}`;
  const group = "group-a";
  const consumer = "consumer-a";
  const context = await createContext("it-group");

  try {
    await context.bus.ensureGroup(stream, group, "0");
    await context.bus.publish(stream, {
      event_id: "evt-group-1"
    });

    const messages = await context.bus.consumeGroup<Record<string, string>>({
      stream,
      group,
      consumer,
      count: 10,
      blockMs: 100
    });
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.message.event_id, "evt-group-1");

    await context.bus.ack(
      stream,
      group,
      messages.map((message) => message.id)
    );

    const afterAck = await context.bus.consumeGroup<Record<string, string>>({
      stream,
      group,
      consumer,
      count: 10,
      blockMs: 10
    });
    assert.equal(afterAck.length, 0);
  } finally {
    await cleanupPattern(context.client, stream);
    await context.bus.close();
  }
});

test("failing worker retries and moves message to dlq", async () => {
  const stream = `it:worker:${randomUUID()}`;
  const group = "group-worker";
  const consumer = "consumer-worker";
  const context = await createContext("it-worker");

  try {
    await context.bus.ensureGroup(stream, group, "0");
    await context.bus.publish(stream, {
      event_id: "evt-worker-1"
    });

    const worker = new RedisStreamConsumerWorker<Record<string, string>>({
      consumer: context.bus,
      redis: context.client,
      stream,
      group,
      consumerName: consumer,
      batchSize: 1,
      blockMs: 10,
      maxDeliveries: 3,
      retryKeyTtlSeconds: 3_600,
      retryBackoffMs: 1,
      handler: async () => {
        throw new Error("synthetic failure");
      }
    });

    await worker.init();
    await worker.runOnce();
    await worker.runOnce();
    await worker.runOnce();

    const dlqRecords = await context.bus.readRecent<Record<string, unknown>>(
      `${stream}.dlq`,
      10
    );
    assert.equal(dlqRecords.length, 1);

    const remaining = await context.bus.consumeGroup<Record<string, string>>({
      stream,
      group,
      consumer,
      count: 1,
      blockMs: 10
    });
    assert.equal(remaining.length, 0);
  } finally {
    await cleanupPattern(context.client, stream);
    await cleanupPattern(context.client, `${stream}.dlq`);
    await cleanupPattern(context.client, `retry:${stream}:*`);
    await context.bus.close();
  }
});
