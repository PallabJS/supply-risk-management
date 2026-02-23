export interface RiskClassificationLlmAdapterConfig {
  host: string;
  port: number;
  upstreamBaseUrl: string;
  upstreamApiKey: string | undefined;
  defaultModel: string;
  requestTimeoutMs: number;
  maxConcurrency: number;
  maxQueueSize: number;
  maxRequestBytes: number;
}

type EnvSource = NodeJS.ProcessEnv | Record<string, string | undefined>;

function parseOptionalString(value: string | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

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

export function loadRiskClassificationLlmAdapterConfig(
  env: EnvSource = process.env
): RiskClassificationLlmAdapterConfig {
  const upstreamBaseUrl =
    parseOptionalString(env.LLM_ADAPTER_UPSTREAM_BASE_URL) ?? "http://localhost:11434";
  const defaultModel =
    parseOptionalString(env.LLM_ADAPTER_DEFAULT_MODEL) ?? "llama3.1:8b";

  return {
    host: parseOptionalString(env.LLM_ADAPTER_HOST) ?? "127.0.0.1",
    port: parsePositiveInt(env.LLM_ADAPTER_PORT, 8088, "LLM_ADAPTER_PORT"),
    upstreamBaseUrl,
    upstreamApiKey: parseOptionalString(env.LLM_ADAPTER_UPSTREAM_API_KEY),
    defaultModel,
    requestTimeoutMs: parsePositiveInt(
      env.LLM_ADAPTER_REQUEST_TIMEOUT_MS,
      15_000,
      "LLM_ADAPTER_REQUEST_TIMEOUT_MS"
    ),
    maxConcurrency: parsePositiveInt(
      env.LLM_ADAPTER_MAX_CONCURRENCY,
      8,
      "LLM_ADAPTER_MAX_CONCURRENCY"
    ),
    maxQueueSize: parsePositiveInt(
      env.LLM_ADAPTER_MAX_QUEUE_SIZE,
      500,
      "LLM_ADAPTER_MAX_QUEUE_SIZE"
    ),
    maxRequestBytes: parsePositiveInt(
      env.LLM_ADAPTER_MAX_REQUEST_BYTES,
      262_144,
      "LLM_ADAPTER_MAX_REQUEST_BYTES"
    )
  };
}
