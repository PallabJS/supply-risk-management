import { loadConfig } from "../config/env.js";
import { RedisStreamEventBus } from "../infrastructure/event-bus/redis-stream-event-bus.js";
import type { RiskClassifier } from "../modules/risk-classification/types.js";
import { createConnectedRedisClient } from "../infrastructure/redis/client.js";
import { LocalLlmRiskClassifier } from "../modules/risk-classification/local-llm-classifier.js";
import { RiskClassificationService } from "../modules/risk-classification/service.js";
import { RiskClassificationWorker } from "../modules/risk-classification/worker.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const redis = await createConnectedRedisClient({
    url: config.redisUrl,
    clientName: "swarm-risk-classification-worker"
  });

  const eventBus = new RedisStreamEventBus(redis, {
    defaultMaxLen: config.redisStreamMaxLen
  });

  let primaryClassifier: RiskClassifier | undefined;
  if (config.riskClassificationPrimaryClassifier === "LLM") {
    const endpoint = config.riskClassificationLlmEndpoint;
    if (!endpoint) {
      throw new Error(
        "RISK_CLASSIFICATION_LLM_ENDPOINT is required when LLM classifier is enabled"
      );
    }

    const llmClassifierOptions = {
      endpoint,
      model: config.riskClassificationLlmModel,
      timeoutMs: config.riskClassificationLlmTimeoutMs,
      maxConcurrency: config.riskClassificationLlmMaxConcurrency,
      maxQueueSize: config.riskClassificationLlmMaxQueueSize,
      maxRetries: config.riskClassificationLlmMaxRetries,
      retryBaseDelayMs: config.riskClassificationLlmRetryBaseDelayMs,
      name: config.riskClassificationModelVersion,
      ...(config.riskClassificationLlmApiKey
        ? { apiKey: config.riskClassificationLlmApiKey }
        : {})
    };
    primaryClassifier = new LocalLlmRiskClassifier(llmClassifierOptions);
  }

  const classificationService = new RiskClassificationService({
    eventPublisher: eventBus,
    ...(primaryClassifier ? { primaryClassifier } : {}),
    confidenceThreshold: config.riskClassificationConfidenceThreshold,
    modelVersion: config.riskClassificationModelVersion
  });

  const workerOptions = {
    eventBus,
    redis,
    classificationService,
    consumerGroup: config.riskClassificationConsumerGroup,
    batchSize: config.redisConsumerBatchSize,
    blockMs: config.redisConsumerBlockMs,
    maxDeliveries: config.redisMaxDeliveries,
    retryKeyTtlSeconds: config.redisDedupTtlSeconds,
    ...(config.riskClassificationConsumerName
      ? { consumerName: config.riskClassificationConsumerName }
      : {})
  };
  const worker = new RiskClassificationWorker(workerOptions);

  await worker.init();
  await worker.start();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
