import { loadConfig } from "../config/env.js";
import { RedisStreamEventBus } from "../infrastructure/event-bus/redis-stream-event-bus.js";
import { createConnectedRedisClient } from "../infrastructure/redis/client.js";
import { PlanningImpactService } from "../modules/planning-impact/service.js";
import { PlanningStateStore } from "../modules/planning-impact/state-store.js";
import { PlanningImpactWorker } from "../modules/planning-impact/worker.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const redis = await createConnectedRedisClient({
    url: config.redisUrl,
    clientName: "swarm-planning-impact-worker"
  });

  const eventBus = new RedisStreamEventBus(redis, {
    defaultMaxLen: config.redisStreamMaxLen
  });

  const planningStateStore = new PlanningStateStore(redis);
  const planningImpactService = new PlanningImpactService(planningStateStore, {
    eventPublisher: eventBus
  });

  const worker = new PlanningImpactWorker({
    eventBus,
    redis,
    planningImpactService,
    consumerGroup: config.planningImpactConsumerGroup,
    batchSize: config.redisConsumerBatchSize,
    blockMs: config.redisConsumerBlockMs,
    maxDeliveries: config.redisMaxDeliveries,
    retryKeyTtlSeconds: config.redisDedupTtlSeconds,
    ...(config.planningImpactConsumerName
      ? { consumerName: config.planningImpactConsumerName }
      : {})
  });

  await worker.init();
  await worker.start();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
