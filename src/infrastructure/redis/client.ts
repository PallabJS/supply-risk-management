import { createClient } from "redis";

export interface RedisClientOptions {
  url: string;
  clientName?: string;
}

export type AppRedisClient = ReturnType<typeof createClient>;

export interface LoggerLike {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

function createNoopLogger(): LoggerLike {
  return {
    info() {},
    warn() {},
    error() {}
  };
}

export async function createConnectedRedisClient(
  options: RedisClientOptions
): Promise<AppRedisClient> {
  const clientOptions: Parameters<typeof createClient>[0] = {
    url: options.url,
    socket: {
      reconnectStrategy(retries: number) {
        return Math.min(retries * 100, 2_000);
      }
    }
  };
  if (options.clientName) {
    clientOptions.name = options.clientName;
  }

  const client = createClient(clientOptions);

  await client.connect();
  const pong = await client.ping();
  if (pong !== "PONG") {
    await client.quit();
    throw new Error("Redis ping failed during startup");
  }

  return client;
}

export function registerRedisGracefulShutdown(
  client: AppRedisClient,
  logger: LoggerLike = createNoopLogger()
): () => void {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info("received shutdown signal, closing redis client", { signal });
    try {
      await client.quit();
    } catch (error) {
      logger.warn("redis quit failed, forcing disconnect", {
        signal,
        error: error instanceof Error ? error.message : String(error)
      });
      client.disconnect();
    }
  };

  const sigintHandler = () => {
    void shutdown("SIGINT");
  };
  const sigtermHandler = () => {
    void shutdown("SIGTERM");
  };

  process.once("SIGINT", sigintHandler);
  process.once("SIGTERM", sigtermHandler);

  return () => {
    process.off("SIGINT", sigintHandler);
    process.off("SIGTERM", sigtermHandler);
  };
}
