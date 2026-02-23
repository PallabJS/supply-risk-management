import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { RedisIdempotencyStore } from "../../src/infrastructure/event-bus/redis-idempotency-store.js";
import { RedisStreamEventBus } from "../../src/infrastructure/event-bus/redis-stream-event-bus.js";
import { EventStreams } from "../../src/infrastructure/event-bus/streams.js";
import {
  createConnectedRedisClient,
  type AppRedisClient
} from "../../src/infrastructure/redis/client.js";
import { SignalIngestionService } from "../../src/modules/signal-ingestion/service.js";
import { SignalIngestionWorker } from "../../src/modules/signal-ingestion/worker.js";
import type { ExternalSignal } from "../../src/modules/signal-ingestion/types.js";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

interface RedisContext {
  client: AppRedisClient;
  bus: RedisStreamEventBus;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

async function createContext(clientName: string): Promise<RedisContext> {
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

test("signal ingestion worker consumes raw-input-signals and publishes external-signals", async () => {
  const streamPrefix = `it:signal-ingestion-worker:${randomUUID()}`;
  const inputStream = `${streamPrefix}:${EventStreams.RAW_INPUT_SIGNALS}`;
  const outputStream = `${streamPrefix}:${EventStreams.EXTERNAL_SIGNALS}`;
  const context = await createContext("it-signal-ingestion-worker");

  try {
    const ingestionService = new SignalIngestionService({
      sources: [],
      eventBus: context.bus,
      stream: outputStream,
      idempotencyStore: new RedisIdempotencyStore(context.client, 60),
      maxPublishAttempts: 2,
      retryDelayMs: 1
    });

    const worker = new SignalIngestionWorker({
      eventBus: context.bus,
      redis: context.client,
      ingestionService,
      inputStream,
      consumerGroup: `${streamPrefix}:group`,
      consumerName: `${streamPrefix}:consumer`,
      batchSize: 10,
      blockMs: 50,
      maxDeliveries: 3,
      retryKeyTtlSeconds: 60
    });

    await worker.init();

    await context.bus.publish(inputStream, {
      sourceType: "TRAFFIC",
      content: "Highway closure near supplier access road",
      sourceReference: "traffic://advisory/443",
      region: "US-OR",
      confidence: 0.69
    });

    const processed = await worker.runOnce();
    assert.equal(processed, 1);

    const records = await context.bus.readRecent<ExternalSignal>(outputStream, 10);
    assert.equal(records.length, 1);
    const first = records[0];
    assert.ok(first);
    assert.equal(first.message.source_type, "TRAFFIC");
    assert.equal(first.message.geographic_scope, "US-OR");
    assert.equal(first.message.source_reference, "traffic://advisory/443");
    assert.equal(first.message.signal_confidence, 0.69);
  } finally {
    await cleanupPattern(context.client, `${streamPrefix}*`);
    await context.bus.close();
  }
});
