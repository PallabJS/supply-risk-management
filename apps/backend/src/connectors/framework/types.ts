import type { Logger } from "../../modules/signal-ingestion/types.js";

/**
 * Configuration for a single connector.
 * All connectors share universal fields, plus provider-specific providerConfig.
 */
export interface ConnectorConfig {
  // Universal required fields
  name: string; // e.g., "weather-noaa", "jira-prod"
  type: string; // e.g., "NOAA_WEATHER", "JIRA"
  enabled: boolean; // Whether this connector should run
  pollIntervalMs: number; // How often to poll (ms)
  requestTimeoutMs: number; // HTTP timeout (ms)
  maxRetries: number; // Max retry attempts on failure

  // Optional fields
  outputStream?: string; // Redis stream to publish to (default: raw-input-signals)
  leaseTtlSeconds?: number; // Lease TTL for distributed coordination (default: 30s)

  // Retry/backoff configuration
  retryConfig?: {
    baseDelayMs: number; // Initial backoff delay (ms)
    maxDelayMs: number; // Maximum backoff delay (ms)
    jitterRatio: number; // Jitter factor (0-1)
  };

  // Provider-specific configuration (any fields the connector needs)
  providerConfig: Record<string, unknown>;
}

export interface ConnectorStateStore {
  load<TState extends object>(
    connectorName: string,
  ): Promise<TState | undefined>;
  save<TState extends object>(
    connectorName: string,
    state: TState,
  ): Promise<void>;
}

export interface ConnectorLease {
  release(): Promise<void>;
}

export interface ConnectorLeaseManager {
  tryAcquire(
    connectorName: string,
    ttlSeconds: number,
  ): Promise<ConnectorLease | undefined>;
}

export interface ConnectorPollSummary {
  fetched: number;
  published: number;
  skipped_unchanged: number;
  failed: number;
  [key: string]: unknown;
}

export interface PollingConnector {
  name: string;
  poll(): Promise<ConnectorPollSummary>;
}

export interface PollingConnectorRunnerOptions {
  connector: PollingConnector;
  pollIntervalMs: number;
  leaseManager?: ConnectorLeaseManager;
  leaseTtlSeconds?: number;
  failureBaseBackoffMs?: number;
  maxFailureBackoffMs?: number;
  jitterRatio?: number;
  logger?: Logger;
}
