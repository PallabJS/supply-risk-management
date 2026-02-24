import { loadConfig } from "../../config/env.js";
import { RedisStreamEventBus } from "../../infrastructure/event-bus/redis-stream-event-bus.js";
import { createConnectedRedisClient } from "../../infrastructure/redis/client.js";
import { loadSignalIngestionGatewayConfig } from "./config.js";
import { createSignalIngestionGatewayServer } from "./server.js";
import { SignalIngestionGatewayService } from "./service.js";

async function main(): Promise<void> {
  const appConfig = loadConfig();
  const gatewayConfig = loadSignalIngestionGatewayConfig();
  const redis = await createConnectedRedisClient({
    url: appConfig.redisUrl,
    clientName: "swarm-signal-ingestion-gateway"
  });

  const eventBus = new RedisStreamEventBus(redis, {
    defaultMaxLen: appConfig.redisStreamMaxLen,
    ownsClient: true
  });

  const service = new SignalIngestionGatewayService({
    eventPublisher: eventBus
  });
  const server = createSignalIngestionGatewayServer(gatewayConfig, service);

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    console.log(`[signal-gateway] received ${signal}, shutting down`);
    try {
      await server.stop();
      await eventBus.close();
      process.exitCode = 0;
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    }
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  await server.start();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
