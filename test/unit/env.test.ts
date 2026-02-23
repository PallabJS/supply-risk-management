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
  assert.equal(config.signalIngestionConsumerGroup, "signal-ingestion-group");
  assert.equal(config.signalIngestionConsumerName, undefined);
  assert.equal(config.riskClassificationPrimaryClassifier, "RULE_BASED");
  assert.equal(config.riskClassificationConsumerGroup, "risk-classification-group");
  assert.equal(config.riskClassificationConsumerName, undefined);
  assert.equal(config.riskClassificationConfidenceThreshold, 0.65);
  assert.equal(config.riskClassificationModelVersion, "risk-classification-v1");
  assert.equal(config.riskClassificationLlmEndpoint, undefined);
  assert.equal(config.riskClassificationLlmApiKey, undefined);
  assert.equal(config.riskClassificationLlmModel, "llama3.1:8b");
  assert.equal(config.riskClassificationLlmTimeoutMs, 8_000);
  assert.equal(config.riskClassificationLlmMaxConcurrency, 8);
  assert.equal(config.riskClassificationLlmMaxQueueSize, 500);
  assert.equal(config.riskClassificationLlmMaxRetries, 2);
  assert.equal(config.riskClassificationLlmRetryBaseDelayMs, 150);
  assert.equal(config.riskEngineConsumerGroup, "risk-engine-group");
  assert.equal(config.riskEngineConsumerName, undefined);
  assert.equal(config.riskEngineEvaluationVersion, "risk-engine-v1");
  assert.equal(config.riskEngineDailyRevenueBaseline, 250_000);
});

test("loads config with custom values", () => {
  const config = loadConfig({
    REDIS_URL: "redis://localhost:6380",
    REDIS_STREAM_MAXLEN: "200000",
    REDIS_DEDUP_TTL_SECONDS: "86400",
    REDIS_CONSUMER_BLOCK_MS: "3000",
    REDIS_CONSUMER_BATCH_SIZE: "20",
    REDIS_MAX_DELIVERIES: "8",
    DEV_STREAM_PRINT_LIMIT: "10",
    SIGNAL_INGESTION_CONSUMER_GROUP: "ingestion-group-a",
    SIGNAL_INGESTION_CONSUMER_NAME: "ingestion-worker-1",
    RISK_CLASSIFICATION_PRIMARY_CLASSIFIER: "LLM",
    RISK_CLASSIFICATION_CONSUMER_GROUP: "risk-group-a",
    RISK_CLASSIFICATION_CONSUMER_NAME: "risk-worker-1",
    RISK_CLASSIFICATION_CONFIDENCE_THRESHOLD: "0.72",
    RISK_CLASSIFICATION_MODEL_VERSION: "risk-model-v2",
    RISK_CLASSIFICATION_LLM_ENDPOINT: "http://localhost:11434/classify",
    RISK_CLASSIFICATION_LLM_API_KEY: "secret-1",
    RISK_CLASSIFICATION_LLM_MODEL: "local-llm-v2",
    RISK_CLASSIFICATION_LLM_TIMEOUT_MS: "6000",
    RISK_CLASSIFICATION_LLM_MAX_CONCURRENCY: "12",
    RISK_CLASSIFICATION_LLM_MAX_QUEUE_SIZE: "800",
    RISK_CLASSIFICATION_LLM_MAX_RETRIES: "0",
    RISK_CLASSIFICATION_LLM_RETRY_BASE_DELAY_MS: "220",
    RISK_ENGINE_CONSUMER_GROUP: "risk-engine-a",
    RISK_ENGINE_CONSUMER_NAME: "engine-worker-1",
    RISK_ENGINE_EVALUATION_VERSION: "risk-engine-v2",
    RISK_ENGINE_DAILY_REVENUE_BASELINE: "750000"
  });

  assert.equal(config.redisUrl, "redis://localhost:6380");
  assert.equal(config.redisStreamMaxLen, 200_000);
  assert.equal(config.redisDedupTtlSeconds, 86_400);
  assert.equal(config.redisConsumerBlockMs, 3_000);
  assert.equal(config.redisConsumerBatchSize, 20);
  assert.equal(config.redisMaxDeliveries, 8);
  assert.equal(config.devStreamPrintLimit, 10);
  assert.equal(config.signalIngestionConsumerGroup, "ingestion-group-a");
  assert.equal(config.signalIngestionConsumerName, "ingestion-worker-1");
  assert.equal(config.riskClassificationPrimaryClassifier, "LLM");
  assert.equal(config.riskClassificationConsumerGroup, "risk-group-a");
  assert.equal(config.riskClassificationConsumerName, "risk-worker-1");
  assert.equal(config.riskClassificationConfidenceThreshold, 0.72);
  assert.equal(config.riskClassificationModelVersion, "risk-model-v2");
  assert.equal(config.riskClassificationLlmEndpoint, "http://localhost:11434/classify");
  assert.equal(config.riskClassificationLlmApiKey, "secret-1");
  assert.equal(config.riskClassificationLlmModel, "local-llm-v2");
  assert.equal(config.riskClassificationLlmTimeoutMs, 6_000);
  assert.equal(config.riskClassificationLlmMaxConcurrency, 12);
  assert.equal(config.riskClassificationLlmMaxQueueSize, 800);
  assert.equal(config.riskClassificationLlmMaxRetries, 0);
  assert.equal(config.riskClassificationLlmRetryBaseDelayMs, 220);
  assert.equal(config.riskEngineConsumerGroup, "risk-engine-a");
  assert.equal(config.riskEngineConsumerName, "engine-worker-1");
  assert.equal(config.riskEngineEvaluationVersion, "risk-engine-v2");
  assert.equal(config.riskEngineDailyRevenueBaseline, 750_000);
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

test("throws on invalid confidence threshold", () => {
  assert.throws(() => {
    loadConfig({
      REDIS_URL: "redis://localhost:6379",
      RISK_CLASSIFICATION_CONFIDENCE_THRESHOLD: "1.5"
    });
  }, /RISK_CLASSIFICATION_CONFIDENCE_THRESHOLD must be a decimal between 0 and 1/);
});

test("throws when llm mode is enabled but endpoint is missing", () => {
  assert.throws(() => {
    loadConfig({
      REDIS_URL: "redis://localhost:6379",
      RISK_CLASSIFICATION_PRIMARY_CLASSIFIER: "LLM"
    });
  }, /RISK_CLASSIFICATION_LLM_ENDPOINT is required when LLM classifier is enabled/);
});

test("throws on invalid llm primary classifier mode", () => {
  assert.throws(() => {
    loadConfig({
      REDIS_URL: "redis://localhost:6379",
      RISK_CLASSIFICATION_PRIMARY_CLASSIFIER: "RANDOM_MODE"
    });
  }, /RISK_CLASSIFICATION_PRIMARY_CLASSIFIER must be "RULE_BASED" or "LLM"/);
});

test("throws on invalid llm retries value", () => {
  assert.throws(() => {
    loadConfig({
      REDIS_URL: "redis://localhost:6379",
      RISK_CLASSIFICATION_LLM_MAX_RETRIES: "-1"
    });
  }, /RISK_CLASSIFICATION_LLM_MAX_RETRIES must be a non-negative integer/);
});

test("throws on invalid risk engine baseline", () => {
  assert.throws(() => {
    loadConfig({
      REDIS_URL: "redis://localhost:6379",
      RISK_ENGINE_DAILY_REVENUE_BASELINE: "0"
    });
  }, /RISK_ENGINE_DAILY_REVENUE_BASELINE must be a positive integer/);
});
