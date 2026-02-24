import { loadConfig } from "../config/env.js";
import { RedisStreamEventBus } from "../infrastructure/event-bus/redis-stream-event-bus.js";
import { createConnectedRedisClient } from "../infrastructure/redis/client.js";
import { DeterministicMitigationPlanner } from "../modules/mitigation-planning/deterministic-planner.js";
import { MitigationPlanningService } from "../modules/mitigation-planning/service.js";
import { MitigationPlanningWorker } from "../modules/mitigation-planning/worker.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const redis = await createConnectedRedisClient({
    url: config.redisUrl,
    clientName: "swarm-mitigation-planning-worker"
  });

  const eventBus = new RedisStreamEventBus(redis, {
    defaultMaxLen: config.redisStreamMaxLen
  });

  const mitigationPlanningService = new MitigationPlanningService({
    eventPublisher: eventBus,
    planner: new DeterministicMitigationPlanner()
  });

  const worker = new MitigationPlanningWorker({
    eventBus,
    redis,
    mitigationPlanningService,
    consumerGroup: config.mitigationPlanningConsumerGroup,
    batchSize: config.redisConsumerBatchSize,
    blockMs: config.redisConsumerBlockMs,
    maxDeliveries: config.redisMaxDeliveries,
    retryKeyTtlSeconds: config.redisDedupTtlSeconds,
    ...(config.mitigationPlanningConsumerName
      ? { consumerName: config.mitigationPlanningConsumerName }
      : {})
  });

  await worker.init();
  await worker.start();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
