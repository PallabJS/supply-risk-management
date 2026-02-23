export interface AppConfig {
  redisUrl: string;
  redisStreamMaxLen: number;
  redisDedupTtlSeconds: number;
  redisConsumerBlockMs: number;
  redisConsumerBatchSize: number;
  redisMaxDeliveries: number;
  devStreamPrintLimit: number;
  riskClassificationPrimaryClassifier: "RULE_BASED" | "LLM";
  riskClassificationConsumerGroup: string;
  riskClassificationConsumerName: string | undefined;
  riskClassificationConfidenceThreshold: number;
  riskClassificationModelVersion: string;
  riskClassificationLlmEndpoint: string | undefined;
  riskClassificationLlmApiKey: string | undefined;
  riskClassificationLlmModel: string;
  riskClassificationLlmTimeoutMs: number;
  riskClassificationLlmMaxConcurrency: number;
  riskClassificationLlmMaxQueueSize: number;
  riskClassificationLlmMaxRetries: number;
  riskClassificationLlmRetryBaseDelayMs: number;
  riskEngineConsumerGroup: string;
  riskEngineConsumerName: string | undefined;
  riskEngineEvaluationVersion: string;
  riskEngineDailyRevenueBaseline: number;
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

function parseNonNegativeInt(
  value: string | undefined,
  fallback: number,
  variableName: string
): number {
  if (value == null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${variableName} must be a non-negative integer`);
  }
  return parsed;
}

function parseConfidence(
  value: string | undefined,
  fallback: number,
  variableName: string
): number {
  if (value == null || value === "") {
    return fallback;
  }
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${variableName} must be a decimal between 0 and 1`);
  }
  return parsed;
}

function parseOptionalString(value: string | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function parseClassifierMode(value: string | undefined): "RULE_BASED" | "LLM" {
  const normalized = parseOptionalString(value)?.toUpperCase() ?? "RULE_BASED";
  if (normalized === "RULE_BASED" || normalized === "LLM") {
    return normalized;
  }
  throw new Error('RISK_CLASSIFICATION_PRIMARY_CLASSIFIER must be "RULE_BASED" or "LLM"');
}

export function loadConfig(env: EnvSource = process.env): AppConfig {
  const redisUrl = env.REDIS_URL;
  if (!redisUrl || redisUrl.trim() === "") {
    throw new Error("REDIS_URL is required");
  }

  const riskClassificationPrimaryClassifier = parseClassifierMode(
    env.RISK_CLASSIFICATION_PRIMARY_CLASSIFIER
  );
  const riskClassificationLlmEndpoint = parseOptionalString(
    env.RISK_CLASSIFICATION_LLM_ENDPOINT
  );
  if (riskClassificationPrimaryClassifier === "LLM" && !riskClassificationLlmEndpoint) {
    throw new Error("RISK_CLASSIFICATION_LLM_ENDPOINT is required when LLM classifier is enabled");
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
    ),
    riskClassificationPrimaryClassifier,
    riskClassificationConsumerGroup:
      parseOptionalString(env.RISK_CLASSIFICATION_CONSUMER_GROUP) ??
      "risk-classification-group",
    riskClassificationConsumerName: parseOptionalString(
      env.RISK_CLASSIFICATION_CONSUMER_NAME
    ),
    riskClassificationConfidenceThreshold: parseConfidence(
      env.RISK_CLASSIFICATION_CONFIDENCE_THRESHOLD,
      0.65,
      "RISK_CLASSIFICATION_CONFIDENCE_THRESHOLD"
    ),
    riskClassificationModelVersion:
      parseOptionalString(env.RISK_CLASSIFICATION_MODEL_VERSION) ??
      "risk-classification-v1",
    riskClassificationLlmEndpoint,
    riskClassificationLlmApiKey: parseOptionalString(
      env.RISK_CLASSIFICATION_LLM_API_KEY
    ),
    riskClassificationLlmModel:
      parseOptionalString(env.RISK_CLASSIFICATION_LLM_MODEL) ??
      "local-risk-llm-v1",
    riskClassificationLlmTimeoutMs: parsePositiveInt(
      env.RISK_CLASSIFICATION_LLM_TIMEOUT_MS,
      8_000,
      "RISK_CLASSIFICATION_LLM_TIMEOUT_MS"
    ),
    riskClassificationLlmMaxConcurrency: parsePositiveInt(
      env.RISK_CLASSIFICATION_LLM_MAX_CONCURRENCY,
      8,
      "RISK_CLASSIFICATION_LLM_MAX_CONCURRENCY"
    ),
    riskClassificationLlmMaxQueueSize: parsePositiveInt(
      env.RISK_CLASSIFICATION_LLM_MAX_QUEUE_SIZE,
      500,
      "RISK_CLASSIFICATION_LLM_MAX_QUEUE_SIZE"
    ),
    riskClassificationLlmMaxRetries: parseNonNegativeInt(
      env.RISK_CLASSIFICATION_LLM_MAX_RETRIES,
      2,
      "RISK_CLASSIFICATION_LLM_MAX_RETRIES"
    ),
    riskClassificationLlmRetryBaseDelayMs: parsePositiveInt(
      env.RISK_CLASSIFICATION_LLM_RETRY_BASE_DELAY_MS,
      150,
      "RISK_CLASSIFICATION_LLM_RETRY_BASE_DELAY_MS"
    ),
    riskEngineConsumerGroup:
      parseOptionalString(env.RISK_ENGINE_CONSUMER_GROUP) ?? "risk-engine-group",
    riskEngineConsumerName: parseOptionalString(env.RISK_ENGINE_CONSUMER_NAME),
    riskEngineEvaluationVersion:
      parseOptionalString(env.RISK_ENGINE_EVALUATION_VERSION) ?? "risk-engine-v1",
    riskEngineDailyRevenueBaseline: parsePositiveInt(
      env.RISK_ENGINE_DAILY_REVENUE_BASELINE,
      250_000,
      "RISK_ENGINE_DAILY_REVENUE_BASELINE"
    )
  };
}
