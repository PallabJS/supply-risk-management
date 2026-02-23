import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { EventStreams } from "../../src/infrastructure/event-bus/streams.js";
import { RedisStreamEventBus } from "../../src/infrastructure/event-bus/redis-stream-event-bus.js";
import {
  createConnectedRedisClient,
  type AppRedisClient
} from "../../src/infrastructure/redis/client.js";
import { RiskEngineService } from "../../src/modules/risk-engine/service.js";
import { RiskEngineWorker } from "../../src/modules/risk-engine/worker.js";
import type { StructuredRisk } from "../../src/modules/risk-classification/types.js";

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

test("risk engine worker consumes classified-events and publishes risk-evaluations", async () => {
  const streamPrefix = `it:risk-engine-worker:${randomUUID()}`;
  const inputStream = `${streamPrefix}:${EventStreams.CLASSIFIED_EVENTS}`;
  const outputStream = `${streamPrefix}:${EventStreams.RISK_EVALUATIONS}`;
  const context = await createContext("it-risk-engine-worker");

  try {
    const riskEngineService = new RiskEngineService({
      eventPublisher: {
        async publish(_stream, message, options) {
          return context.bus.publish(outputStream, message, options);
        }
      }
    });

    const worker = new RiskEngineWorker({
      eventBus: context.bus,
      redis: context.client,
      riskEngineService,
      inputStream,
      consumerGroup: `${streamPrefix}:group`,
      consumerName: `${streamPrefix}:consumer`,
      batchSize: 10,
      blockMs: 50,
      maxDeliveries: 3,
      retryKeyTtlSeconds: 60
    });

    await worker.init();

    const classifiedRisk: StructuredRisk = {
      classification_id: `${streamPrefix}:cls-1`,
      event_id: `${streamPrefix}:evt-1`,
      event_type: "SUPPLY",
      severity_level: 5,
      impact_region: "US-TX",
      expected_duration_hours: 72,
      classification_confidence: 0.88,
      model_version: "risk-classification-v1",
      processed_at_utc: new Date().toISOString()
    };

    await context.bus.publish(inputStream, classifiedRisk);
    const processed = await worker.runOnce();
    assert.equal(processed, 1);

    const evaluations = await context.bus.readRecent<Record<string, unknown>>(outputStream, 10);
    assert.equal(evaluations.length, 1);
    const first = evaluations[0];
    assert.ok(first);
    assert.equal(first.message.classification_id, classifiedRisk.classification_id);
    assert.equal(typeof first.message.risk_score, "number");
    assert.equal(typeof first.message.risk_level, "string");
    assert.equal(typeof first.message.risk_id, "string");
  } finally {
    await cleanupPattern(context.client, `${streamPrefix}*`);
    await context.bus.close();
  }
});
