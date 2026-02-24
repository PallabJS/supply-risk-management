import type { EventPublisher } from "../../infrastructure/event-bus/types.js";
import type { ConnectorStateStore } from "./types.js";
import type { ConnectorLeaseManager } from "./types.js";
import type { Logger } from "../../modules/signal-ingestion/types.js";
import type { ConnectorConfig, PollingConnector } from "./types.js";

/**
 * Options provided to connector factories.
 */
export interface ConnectorFactoryOptions {
  eventBus: EventPublisher;
  stateStore: ConnectorStateStore;
  leaseManager?: ConnectorLeaseManager;
  logger: Logger;
}

/**
 * Function signature for connector constructors.
 * All registered connectors must follow this pattern.
 */
export type ConnectorConstructor = (
  connectorName: string,
  config: ConnectorConfig,
  options: ConnectorFactoryOptions,
) => PollingConnector;

/**
 * Global registry of connector factories.
 * New connector types are registered here.
 */
const connectorRegistry = new Map<string, ConnectorConstructor>();

/**
 * Register a connector type.
 * @param type - Connector type identifier (e.g., "INDIA_WEATHER", "JIRA", "GITHUB")
 * @param factory - Function that creates a connector instance
 */
export function registerConnector(
  type: string,
  factory: ConnectorConstructor,
): void {
  if (connectorRegistry.has(type)) {
    throw new Error(`Connector type '${type}' is already registered`);
  }
  connectorRegistry.set(type, factory);
}

/**
 * Get a registered connector factory.
 */
export function getConnectorFactory(
  type: string,
): ConnectorConstructor | undefined {
  return connectorRegistry.get(type);
}

/**
 * List all registered connector types.
 */
export function listRegisteredTypes(): string[] {
  return Array.from(connectorRegistry.keys());
}

/**
 * Create a connector instance by type.
 * @throws Error if the type is not registered
 */
export function createConnectorByType(
  connectorName: string,
  config: ConnectorConfig,
  options: ConnectorFactoryOptions,
): PollingConnector {
  const factory = connectorRegistry.get(config.type);
  if (!factory) {
    throw new Error(
      `Unknown connector type: ${config.type}. Registered types: ${
        Array.from(connectorRegistry.keys()).join(", ") || "none"
      }`,
    );
  }
  return factory(connectorName, config, options);
}

/**
 * Reset registry (for testing).
 */
export function clearConnectorRegistry(): void {
  connectorRegistry.clear();
}
