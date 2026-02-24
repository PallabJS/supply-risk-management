import { loadConfig } from "../../config/env.js";
import { RedisStreamEventBus } from "../../infrastructure/event-bus/redis-stream-event-bus.js";
import { createConnectedRedisClient } from "../../infrastructure/redis/client.js";
import { PlanningStateStore } from "../../modules/planning-impact/state-store.js";
import { loadPlanningGatewayConfig } from "./config.js";
import { createPlanningGatewayServer } from "./server.js";
import { PlanningGatewayService } from "./service.js";

async function main(): Promise<void> {
  const appConfig = loadConfig();
  const gatewayConfig = loadPlanningGatewayConfig();

  const redis = await createConnectedRedisClient({
    url: appConfig.redisUrl,
    clientName: "swarm-planning-gateway"
  });

  const eventBus = new RedisStreamEventBus(redis, {
    defaultMaxLen: appConfig.redisStreamMaxLen
  });
  const planningStateStore = new PlanningStateStore(redis);
  const service = new PlanningGatewayService({
    eventPublisher: eventBus,
    planningStateStore
  });
  const server = createPlanningGatewayServer(gatewayConfig, service);

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    console.log(`[planning-gateway] received ${signal}, shutting down`);
    await server.stop();
    await eventBus.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await server.start();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
