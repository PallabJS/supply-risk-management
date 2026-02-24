import { loadConfig } from "../config/env.js";
import { RedisStreamEventBus } from "../infrastructure/event-bus/redis-stream-event-bus.js";
import { createConnectedRedisClient } from "../infrastructure/redis/client.js";
import { NotificationService } from "../modules/notification/service.js";
import { NotificationWorker } from "../modules/notification/worker.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const redis = await createConnectedRedisClient({
    url: config.redisUrl,
    clientName: "swarm-notification-worker"
  });

  const eventBus = new RedisStreamEventBus(redis, {
    defaultMaxLen: config.redisStreamMaxLen
  });

  const notificationService = new NotificationService({
    eventPublisher: eventBus,
    policy: {
      minRiskScore: config.notificationMinRiskScore,
      minLaneRelevanceScore: config.notificationMinLaneRelevanceScore
    }
  });

  const worker = new NotificationWorker({
    eventBus,
    redis,
    notificationService,
    consumerGroup: config.notificationConsumerGroup,
    batchSize: config.redisConsumerBatchSize,
    blockMs: config.redisConsumerBlockMs,
    maxDeliveries: config.redisMaxDeliveries,
    retryKeyTtlSeconds: config.redisDedupTtlSeconds,
    ...(config.notificationConsumerName
      ? { consumerName: config.notificationConsumerName }
      : {})
  });

  await worker.init();
  await worker.start();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
