import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "../../src/config/env.js";

test("loads config with defaults", () => {
  const config = loadConfig({
    REDIS_URL: "redis://localhost:6379"
  });

  assert.equal(config.redisUrl, "redis://localhost:6379");
  assert.equal(config.redisStreamMaxLen, 100_000);
  assert.equal(config.redisDedupTtlSeconds, 604_800);
  assert.equal(config.redisConsumerBlockMs, 5_000);
  assert.equal(config.redisConsumerBatchSize, 50);
  assert.equal(config.redisMaxDeliveries, 5);
  assert.equal(config.devStreamPrintLimit, 25);
});

test("loads config with custom values", () => {
  const config = loadConfig({
    REDIS_URL: "redis://localhost:6380",
    REDIS_STREAM_MAXLEN: "200000",
    REDIS_DEDUP_TTL_SECONDS: "86400",
    REDIS_CONSUMER_BLOCK_MS: "3000",
    REDIS_CONSUMER_BATCH_SIZE: "20",
    REDIS_MAX_DELIVERIES: "8",
    DEV_STREAM_PRINT_LIMIT: "10"
  });

  assert.equal(config.redisUrl, "redis://localhost:6380");
  assert.equal(config.redisStreamMaxLen, 200_000);
  assert.equal(config.redisDedupTtlSeconds, 86_400);
  assert.equal(config.redisConsumerBlockMs, 3_000);
  assert.equal(config.redisConsumerBatchSize, 20);
  assert.equal(config.redisMaxDeliveries, 8);
  assert.equal(config.devStreamPrintLimit, 10);
});

test("throws when REDIS_URL is missing", () => {
  assert.throws(() => {
    loadConfig({});
  }, /REDIS_URL is required/);
});

test("throws on invalid numeric env values", () => {
  assert.throws(() => {
    loadConfig({
      REDIS_URL: "redis://localhost:6379",
      REDIS_STREAM_MAXLEN: "0"
    });
  }, /REDIS_STREAM_MAXLEN must be a positive integer/);
});
