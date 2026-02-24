import { loadConfig } from "../config/env.js";
import { RedisStreamEventBus } from "../infrastructure/event-bus/redis-stream-event-bus.js";
import { createConnectedRedisClient } from "../infrastructure/redis/client.js";
import { RedisConnectorStateStore } from "../infrastructure/redis/connector-state-store.js";
import { RedisConnectorLeaseManager } from "../infrastructure/redis/connector-lease-manager.js";
import { loadConnectorRegistry } from "../connectors/framework/registry-loader.js";
import { createConnectorByType } from "../connectors/framework/connector-factory.js";
import { registerBuiltInConnectors } from "../connectors/framework/built-in-connectors.js";
import { ConnectorMetricsCollector } from "../infrastructure/metrics/connector-metrics.js";
import type { Logger } from "../modules/signal-ingestion/types.js";

/**
 * Create a basic logger for the connector worker.
 */
function createLogger(connectorName: string): Logger {
  const prefix = `[${connectorName}]`;
  return {
    info(message: string, context?: Record<string, unknown>) {
      console.log(prefix, message, context ? JSON.stringify(context) : "");
    },
    warn(message: string, context?: Record<string, unknown>) {
      console.warn(prefix, message, context ? JSON.stringify(context) : "");
    },
    error(message: string, context?: Record<string, unknown>) {
      console.error(prefix, message, context ? JSON.stringify(context) : "");
    },
  };
}

/**
 * Sleep for a specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Wait until next poll, respecting shutdown signal.
 */
async function waitUntilNextPoll(
  delayMs: number,
  isRunning: () => boolean,
): Promise<void> {
  let remaining = delayMs;
  while (remaining > 0 && isRunning()) {
    const slice = Math.min(remaining, 500);
    await sleep(slice);
    remaining -= slice;
  }
}

/**
 * Main entry point for universal connector worker.
 *
 * Usage:
 *   npm run connector:run -- weather-india
 *   CONNECTOR_NAME=jira-prod npm run connector:run
 *
 * Environment:
 *   REDIS_URL: Redis connection string
 *   CONNECTORS_CONFIG_PATH: Path to connectors.json
 *   - OR -
 *   ENABLED_CONNECTORS: Comma-separated connector names
 *   CONNECTOR_*: Connector-specific env vars
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger("universal-connector-worker");

  // Register all built-in connector types
  registerBuiltInConnectors();

  // Get connector name from command-line arg or env var
  const connectorName = process.argv[2] || process.env.CONNECTOR_NAME;

  if (!connectorName) {
    console.error(
      "Error: Connector name required. Provide as:\n" +
        "  npm run connector:run -- <connector-name>\n" +
        "  or set CONNECTOR_NAME environment variable",
    );
    process.exitCode = 1;
    return;
  }

  try {
    logger.info("Starting universal connector worker");

    // Load connector registry
    const registry = await loadConnectorRegistry(process.env);
    const connectorConfig = registry.getConnector(connectorName);

    if (!connectorConfig) {
      console.error(
        `Error: Connector '${connectorName}' not found in registry`,
      );
      process.exitCode = 1;
      return;
    }

    if (!connectorConfig.enabled) {
      console.error(`Error: Connector '${connectorName}' is disabled`);
      process.exitCode = 1;
      return;
    }

    logger.info("Loaded connector configuration", {
      name: connectorName,
      type: connectorConfig.type,
      pollIntervalMs: connectorConfig.pollIntervalMs,
    });

    // Initialize infrastructure
    const redis = await createConnectedRedisClient({
      url: config.redisUrl,
      clientName: `swarm-connector-${connectorName}`,
    });

    const eventBus = new RedisStreamEventBus(redis, {
      defaultMaxLen: config.redisStreamMaxLen,
      ownsClient: true,
    });

    const stateStore = new RedisConnectorStateStore(redis);
    const leaseManager = new RedisConnectorLeaseManager(redis);
    const metricsCollector = new ConnectorMetricsCollector(redis);

    // Create connector instance
    const connectorLogger = createLogger(connectorName);
    const connector = createConnectorByType(connectorName, connectorConfig, {
      eventBus,
      stateStore,
      leaseManager,
      logger: connectorLogger,
    });

    // Run polling loop
    let running = true;
    const leaseTtlSeconds = connectorConfig.leaseTtlSeconds || 30;

    const handleSignal = (signal: NodeJS.Signals): void => {
      connectorLogger.info(`Received ${signal}, initiating graceful shutdown`);
      running = false;
    };

    process.on("SIGINT", () => {
      handleSignal("SIGINT");
    });
    process.on("SIGTERM", () => {
      handleSignal("SIGTERM");
    });

    // Hot-reload handler (SIGHUP)
    process.on("SIGHUP", async () => {
      connectorLogger.info("Received SIGHUP, reloading configuration");
      try {
        const newRegistry = await loadConnectorRegistry(process.env);
        const newConfig = newRegistry.getConnector(connectorName);

        if (!newConfig || !newConfig.enabled) {
          connectorLogger.info(
            `Connector no longer enabled, initiating shutdown`,
          );
          running = false;
          return;
        }

        connectorLogger.info("Configuration reloaded successfully");
        // Note: Full restart of poll loop would be needed for config changes to take effect
        // For now, this just acknowledges the reload
      } catch (error) {
        connectorLogger.error("Failed to reload configuration", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    logger.info("Entering polling loop");

    // Main polling loop
    while (running) {
      const startedAt = Date.now();

      try {
        // Try to acquire lease (distributed coordination)
        const lease = await leaseManager.tryAcquire(
          connectorName,
          leaseTtlSeconds,
        );

        if (!lease) {
          connectorLogger.warn(
            "Failed to acquire lease, another instance may be running",
          );
          await waitUntilNextPoll(
            connectorConfig.pollIntervalMs,
            () => running,
          );
          continue;
        }

        try {
          // Run one poll cycle
          const summary = await connector.poll();
          const pollLatencyMs = Date.now() - startedAt;
          try {
            await metricsCollector.recordPoll(
              connectorName,
              summary,
              pollLatencyMs,
            );
          } catch (metricsError) {
            connectorLogger.warn("failed to record connector metrics", {
              error:
                metricsError instanceof Error
                  ? metricsError.message
                  : String(metricsError),
            });
          }

          // Log summary if anything happened
          if (
            !summary.not_modified ||
            summary.published > 0 ||
            summary.failed > 0 ||
            (summary as unknown as Record<string, unknown>)["fetched"] !==
              undefined
          ) {
            connectorLogger.info("Poll summary", summary);
          }
        } finally {
          // Release lease
          await lease.release();
        }
      } catch (error) {
        connectorLogger.error("Poll cycle failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue polling even on error
      }

      // Wait before next poll
      const elapsedMs = Date.now() - startedAt;
      const delayMs = Math.max(0, connectorConfig.pollIntervalMs - elapsedMs);
      await waitUntilNextPoll(delayMs, () => running);
    }

    logger.info("Shutting down");
    await eventBus.close();
    logger.info("Connector worker stopped");
  } catch (error) {
    console.error("Fatal error in connector worker:", error);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exitCode = 1;
});
