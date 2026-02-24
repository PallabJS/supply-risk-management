/**
 * Indian Weather Connector - Factory integration for the universal connector framework.
 *
 * This module provides a factory function that creates an Indian weather connector
 * that conforms to the PollingConnector interface.
 *
 * Monitors weather alerts and warnings across major Indian states.
 */

import { IndianWeatherAlertsClient } from "./client.js";
import { IndianWeatherConnectorService } from "./service.js";
import { toRawSignal, buildAlertVersion } from "./schema.js";
import { UniversalPollingConnector } from "../framework/universal-polling-connector.js";
import type { IndianWeatherAlert } from "./types.js";
import type { RawExternalSignal } from "../../modules/signal-ingestion/types.js";
import type { ConnectorConfig, PollingConnector } from "../framework/types.js";
import type { ConnectorFactoryOptions } from "../framework/connector-factory.js";

/**
 * Create an Indian weather connector.
 *
 * Configuration (providerConfig):
 * {
 *   "baseUrl": "https://api.weatherapi.com/v1",
 *   "apiKey": "your-api-key"  (optional)
 * }
 */
export function createIndianWeatherConnector(
  name: string,
  config: ConnectorConfig,
  options: ConnectorFactoryOptions,
): PollingConnector {
  const providerConfig = config.providerConfig as IndianProviderConfig;

  // Validate required config
  if (!providerConfig.baseUrl || typeof providerConfig.baseUrl !== "string") {
    throw new Error(
      `Indian weather connector ${name}: baseUrl is required and must be a string`,
    );
  }

  // Create Indian weather client
  const client = new IndianWeatherAlertsClient({
    baseUrl: providerConfig.baseUrl,
    requestTimeoutMs: config.requestTimeoutMs,
    userAgent:
      (providerConfig.userAgent as string) || "swarm-risk-management/0.1",
    ...((providerConfig.apiKey as string)
      ? { apiKey: providerConfig.apiKey as string }
      : {}),
  });

  // Create universal connector with Indian weather-specific configuration
  return new UniversalPollingConnector<
    IndianWeatherAlertsClient,
    IndianWeatherAlert,
    RawExternalSignal
  >({
    name,
    config,
    provider: client,
    fetcher: async (provider) => {
      const result = await provider.fetchActiveAlerts(
        (providerConfig.maxAlertsPerPoll as number) || 50,
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
 * Type-safe provider configuration for Indian weather connector.
 */
interface IndianProviderConfig extends Record<string, unknown> {
  baseUrl: string;
  apiKey?: string;
  userAgent?: string;
  maxAlertsPerPoll?: number;
}

// Export original components for backward compatibility
export { IndianWeatherAlertsClient } from "./client.js";
export { IndianWeatherConnectorService } from "./service.js";
export {
  buildAlertVersion,
  parseIndiaAlertsPayload,
  toRawSignal,
  generateMockIndianAlerts,
} from "./schema.js";
export type {
  FetchActiveAlertsResult,
  IndianWeatherAlert,
  IndianWeatherAlertsClientOptions,
  WeatherAlertsProvider,
  WeatherConnectorPollSummary,
} from "./types.js";
