import { loadConfig } from "../config/env.js";
import { RedisIdempotencyStore } from "../infrastructure/event-bus/redis-idempotency-store.js";
import { RedisStreamEventBus } from "../infrastructure/event-bus/redis-stream-event-bus.js";
import { EventStreams } from "../infrastructure/event-bus/streams.js";
import { createConnectedRedisClient } from "../infrastructure/redis/client.js";
import { SignalIngestionService } from "../modules/signal-ingestion/service.js";
import { SignalIngestionWorker } from "../modules/signal-ingestion/worker.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const redis = await createConnectedRedisClient({
    url: config.redisUrl,
    clientName: "swarm-signal-ingestion-worker"
  });

  const eventBus = new RedisStreamEventBus(redis, {
    defaultMaxLen: config.redisStreamMaxLen
  });

  const idempotencyStore = new RedisIdempotencyStore(redis, config.redisDedupTtlSeconds);
  const ingestionService = new SignalIngestionService({
    sources: [],
    eventBus,
    stream: EventStreams.EXTERNAL_SIGNALS,
    idempotencyStore
  });

  const worker = new SignalIngestionWorker({
    eventBus,
    redis,
    ingestionService,
    consumerGroup: config.signalIngestionConsumerGroup,
    batchSize: config.redisConsumerBatchSize,
    blockMs: config.redisConsumerBlockMs,
    maxDeliveries: config.redisMaxDeliveries,
    retryKeyTtlSeconds: config.redisDedupTtlSeconds,
    ...(config.signalIngestionConsumerName
      ? { consumerName: config.signalIngestionConsumerName }
      : {})
  });

  await worker.init();
  await worker.start();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
