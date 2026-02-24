/**
 * NOAA Weather Connector - Factory integration for the universal connector framework.
 *
 * This module provides a factory function that creates a NOAA weather connector
 * that conforms to the PollingConnector interface.
 */

import { NoaaWeatherAlertsClient } from "./client.js";
import { NoaaWeatherConnectorService } from "./service.js";
import { toRawSignal, buildAlertVersion } from "./schema.js";
import { UniversalPollingConnector } from "../framework/universal-polling-connector.js";
import type { NoaaAlert } from "./types.js";
import type { RawExternalSignal } from "../../modules/signal-ingestion/types.js";
import type { ConnectorConfig, PollingConnector } from "../framework/types.js";
import type { ConnectorFactoryOptions } from "../framework/connector-factory.js";

/**
 * Create a NOAA weather connector.
 *
 * Configuration (providerConfig):
 * {
 *   "baseUrl": "https://api.weather.gov",
 *   "alertsPath": "/alerts/active",
 *   "area": "CA,OR",           (optional)
 *   "severity": "Severe,Extreme", (optional)
 *   "urgency": "Immediate,Expected", (optional)
 *   "certainty": "Observed,Likely"  (optional)
 * }
 */
export function createNoaaWeatherConnector(
  name: string,
  config: ConnectorConfig,
  options: ConnectorFactoryOptions,
): PollingConnector {
  const providerConfig = config.providerConfig as NoaaProviderConfig;

  // Validate required config
  if (!providerConfig.baseUrl || typeof providerConfig.baseUrl !== "string") {
    throw new Error(
      `NOAA connector ${name}: baseUrl is required and must be a string`,
    );
  }

  // Create NOAA client
  const client = new NoaaWeatherAlertsClient({
    baseUrl: providerConfig.baseUrl,
    alertsPath: (providerConfig.alertsPath as string) || "/alerts/active",
    userAgent:
      (providerConfig.userAgent as string) || "swarm-risk-management/0.1",
    requestTimeoutMs: config.requestTimeoutMs,
    ...(providerConfig.area && { area: String(providerConfig.area) }),
    ...(providerConfig.severity && {
      severity: String(providerConfig.severity),
    }),
    ...(providerConfig.urgency && { urgency: String(providerConfig.urgency) }),
    ...(providerConfig.certainty && {
      certainty: String(providerConfig.certainty),
    }),
  });

  // Create universal connector with NOAA-specific configuration
  return new UniversalPollingConnector<
    NoaaWeatherAlertsClient,
    NoaaAlert,
    RawExternalSignal
  >({
    name,
    config,
    provider: client,
    fetcher: async (provider) => {
      const result = await provider.fetchActiveAlerts(
        (providerConfig.maxAlertsPerPoll as number) || 200,
      );
      return { items: result.alerts || [] };
    },
    transformer: toRawSignal,
    changeDetector: buildAlertVersion,
    eventPublisher: options.eventBus,
    stateStore: options.stateStore,
    logger: options.logger,
  });
}

/**
 * Type-safe provider configuration for NOAA connector.
 */
interface NoaaProviderConfig extends Record<string, unknown> {
  baseUrl: string;
  alertsPath?: string;
  userAgent?: string;
  area?: string;
  severity?: string;
  urgency?: string;
  certainty?: string;
  maxAlertsPerPoll?: number;
}

// Export original components for backward compatibility
export { NoaaWeatherAlertsClient } from "./client.js";
export { NoaaWeatherConnectorService } from "./service.js";
export {
  buildAlertVersion,
  parseNoaaAlertsPayload,
  toRawSignal,
} from "./schema.js";
export type {
  FetchActiveAlertsResult,
  NoaaAlert,
  NoaaWeatherAlertsClientOptions,
  NoaaWeatherConnectorServiceOptions,
  WeatherAlertsProvider,
  WeatherConnectorPollSummary,
} from "./types.js";
