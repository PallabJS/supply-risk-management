import { loadConfig } from "../config/env.js";
import { RedisStreamEventBus } from "../infrastructure/event-bus/redis-stream-event-bus.js";
import { createConnectedRedisClient } from "../infrastructure/redis/client.js";
import { RiskEngineService } from "../modules/risk-engine/service.js";
import { RiskEngineWorker } from "../modules/risk-engine/worker.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const redis = await createConnectedRedisClient({
    url: config.redisUrl,
    clientName: "swarm-risk-engine-worker"
  });

  const eventBus = new RedisStreamEventBus(redis, {
    defaultMaxLen: config.redisStreamMaxLen
  });

  const riskEngineService = new RiskEngineService({
    eventPublisher: eventBus,
    evaluationVersion: config.riskEngineEvaluationVersion,
    dailyRevenueBaseline: config.riskEngineDailyRevenueBaseline
  });

  const workerOptions = {
    eventBus,
    redis,
    riskEngineService,
    consumerGroup: config.riskEngineConsumerGroup,
    batchSize: config.redisConsumerBatchSize,
    blockMs: config.redisConsumerBlockMs,
    maxDeliveries: config.redisMaxDeliveries,
    retryKeyTtlSeconds: config.redisDedupTtlSeconds,
    ...(config.riskEngineConsumerName
      ? { consumerName: config.riskEngineConsumerName }
      : {})
  };

  const worker = new RiskEngineWorker(workerOptions);
  await worker.init();
  await worker.start();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
