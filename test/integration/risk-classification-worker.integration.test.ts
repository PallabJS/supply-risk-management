import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { EventStreams } from "../../src/infrastructure/event-bus/streams.js";
import { RedisStreamEventBus } from "../../src/infrastructure/event-bus/redis-stream-event-bus.js";
import {
  createConnectedRedisClient,
  type AppRedisClient
} from "../../src/infrastructure/redis/client.js";
import { RiskClassificationService } from "../../src/modules/risk-classification/service.js";
import { RiskClassificationWorker } from "../../src/modules/risk-classification/worker.js";
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

test("risk classification worker consumes external-signals and publishes classified-events", async () => {
  const streamPrefix = `it:risk-worker:${randomUUID()}`;
  const inputStream = `${streamPrefix}:${EventStreams.EXTERNAL_SIGNALS}`;
  const outputStream = `${streamPrefix}:${EventStreams.CLASSIFIED_EVENTS}`;
  const context = await createContext("it-risk-worker");

  try {
    const classificationService = new RiskClassificationService({
      eventPublisher: {
        async publish(_stream, message, options) {
          return context.bus.publish(outputStream, message, options);
        }
      }
    });

    const worker = new RiskClassificationWorker({
      eventBus: context.bus,
      redis: context.client,
      classificationService,
      inputStream,
      consumerGroup: `${streamPrefix}:group`,
      consumerName: `${streamPrefix}:consumer`,
      batchSize: 10,
      blockMs: 50,
      maxDeliveries: 3,
      retryKeyTtlSeconds: 60
    });

    await worker.init();

    const signal: ExternalSignal = {
      event_id: `${streamPrefix}:evt-1`,
      source_type: "NEWS",
      raw_content: "Supplier strike caused major port closure",
      source_reference: "manual://integration/risk-worker",
      geographic_scope: "US-CA",
      timestamp_utc: new Date().toISOString(),
      ingestion_time_utc: new Date().toISOString(),
      signal_confidence: 0.89
    };

    await context.bus.publish(inputStream, signal);
    const processed = await worker.runOnce();
    assert.equal(processed, 1);

    const classified = await context.bus.readRecent<Record<string, unknown>>(outputStream, 10);
    assert.equal(classified.length, 1);
    const first = classified[0];
    assert.ok(first);
    assert.equal(first.message.event_id, signal.event_id);
    assert.equal(typeof first.message.classification_id, "string");
    assert.equal(typeof first.message.classification_confidence, "number");
  } finally {
    await cleanupPattern(context.client, `${streamPrefix}*`);
    await context.bus.close();
  }
});
