import { loadConfig } from "../config/env.js";
import { RedisStreamEventBus } from "../infrastructure/event-bus/redis-stream-event-bus.js";
import { EventStreams } from "../infrastructure/event-bus/streams.js";
import { createConnectedRedisClient } from "../infrastructure/redis/client.js";
import { NoaaWeatherAlertsClient } from "../connectors/weather-noaa/client.js";
import { NoaaWeatherConnectorService } from "../connectors/weather-noaa/service.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitUntilNextPoll(delayMs: number, isRunning: () => boolean): Promise<void> {
  let remaining = delayMs;
  while (remaining > 0 && isRunning()) {
    const slice = Math.min(remaining, 500);
    await sleep(slice);
    remaining -= slice;
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const redis = await createConnectedRedisClient({
    url: config.redisUrl,
    clientName: "swarm-weather-connector-worker"
  });
  const eventBus = new RedisStreamEventBus(redis, {
    defaultMaxLen: config.redisStreamMaxLen,
    ownsClient: true
  });

  const client = new NoaaWeatherAlertsClient({
    baseUrl: config.weatherConnectorBaseUrl,
    alertsPath: config.weatherConnectorAlertsPath,
    userAgent: config.weatherConnectorUserAgent,
    requestTimeoutMs: config.weatherConnectorRequestTimeoutMs,
    ...(config.weatherConnectorArea ? { area: config.weatherConnectorArea } : {}),
    ...(config.weatherConnectorSeverity ? { severity: config.weatherConnectorSeverity } : {}),
    ...(config.weatherConnectorUrgency ? { urgency: config.weatherConnectorUrgency } : {}),
    ...(config.weatherConnectorCertainty ? { certainty: config.weatherConnectorCertainty } : {})
  });
  const connector = new NoaaWeatherConnectorService({
    alertsProvider: client,
    eventPublisher: eventBus,
    stream: EventStreams.RAW_INPUT_SIGNALS,
    maxAlertsPerPoll: config.weatherConnectorMaxAlertsPerPoll
  });

  let running = true;
  const handleSignal = (signal: NodeJS.Signals): void => {
    console.log(`[weather-connector] received ${signal}, shutting down`);
    running = false;
  };
  process.on("SIGINT", () => {
    handleSignal("SIGINT");
  });
  process.on("SIGTERM", () => {
    handleSignal("SIGTERM");
  });

  try {
    while (running) {
      const startedAt = Date.now();
      try {
        const summary = await connector.runOnce();
        if (!summary.not_modified || summary.published > 0 || summary.failed > 0) {
          console.log("[weather-connector] poll summary", summary);
        }
      } catch (error) {
        console.error("[weather-connector] poll failed", error);
      }

      const elapsedMs = Date.now() - startedAt;
      const delayMs = Math.max(0, config.weatherConnectorPollIntervalMs - elapsedMs);
      await waitUntilNextPoll(delayMs, () => running);
    }
  } finally {
    await eventBus.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
