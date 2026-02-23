export interface SignalIngestionGatewayConfig {
  host: string;
  port: number;
  maxRequestBytes: number;
  maxSignalsPerRequest: number;
  authToken: string | undefined;
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

export function loadSignalIngestionGatewayConfig(
  env: EnvSource = process.env
): SignalIngestionGatewayConfig {
  return {
    host: parseOptionalString(env.SIGNAL_INGESTION_GATEWAY_HOST) ?? "127.0.0.1",
    port: parsePositiveInt(
      env.SIGNAL_INGESTION_GATEWAY_PORT,
      8090,
      "SIGNAL_INGESTION_GATEWAY_PORT"
    ),
    maxRequestBytes: parsePositiveInt(
      env.SIGNAL_INGESTION_GATEWAY_MAX_REQUEST_BYTES,
      1_048_576,
      "SIGNAL_INGESTION_GATEWAY_MAX_REQUEST_BYTES"
    ),
    maxSignalsPerRequest: parsePositiveInt(
      env.SIGNAL_INGESTION_GATEWAY_MAX_SIGNALS_PER_REQUEST,
      500,
      "SIGNAL_INGESTION_GATEWAY_MAX_SIGNALS_PER_REQUEST"
    ),
    authToken: parseOptionalString(env.SIGNAL_INGESTION_GATEWAY_AUTH_TOKEN)
  };
}
