export interface AppConfig {
  redisUrl: string;
  redisStreamMaxLen: number;
  redisDedupTtlSeconds: number;
  redisConsumerBlockMs: number;
  redisConsumerBatchSize: number;
  redisMaxDeliveries: number;
  devStreamPrintLimit: number;
}

type EnvSource = NodeJS.ProcessEnv | Record<string, string | undefined>;

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  variableName: string
): number {
  if (value == null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${variableName} must be a positive integer`);
  }
  return parsed;
}

export function loadConfig(env: EnvSource = process.env): AppConfig {
  const redisUrl = env.REDIS_URL;
  if (!redisUrl || redisUrl.trim() === "") {
    throw new Error("REDIS_URL is required");
  }

  return {
    redisUrl,
    redisStreamMaxLen: parsePositiveInt(
      env.REDIS_STREAM_MAXLEN,
      100_000,
      "REDIS_STREAM_MAXLEN"
    ),
    redisDedupTtlSeconds: parsePositiveInt(
      env.REDIS_DEDUP_TTL_SECONDS,
      604_800,
      "REDIS_DEDUP_TTL_SECONDS"
    ),
    redisConsumerBlockMs: parsePositiveInt(
      env.REDIS_CONSUMER_BLOCK_MS,
      5_000,
      "REDIS_CONSUMER_BLOCK_MS"
    ),
    redisConsumerBatchSize: parsePositiveInt(
      env.REDIS_CONSUMER_BATCH_SIZE,
      50,
      "REDIS_CONSUMER_BATCH_SIZE"
    ),
    redisMaxDeliveries: parsePositiveInt(
      env.REDIS_MAX_DELIVERIES,
      5,
      "REDIS_MAX_DELIVERIES"
    ),
    devStreamPrintLimit: parsePositiveInt(
      env.DEV_STREAM_PRINT_LIMIT,
      25,
      "DEV_STREAM_PRINT_LIMIT"
    )
  };
}
