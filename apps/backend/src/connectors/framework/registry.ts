/**
 * Connector registry for managing multiple connectors.
 */

import type { ConnectorConfig } from "./types.js";

// Re-export ConnectorConfig so it'savailable from this module
export type { ConnectorConfig };

/**
 * A registry of all available connectors.
 * Can be queried by name or list enabled connectors.
 */
export interface ConnectorRegistry {
  /**
   * Get a specific connector configuration by name.
   */
  getConnector(name: string): ConnectorConfig | undefined;

  /**
   * List all enabled connectors.
   */
  listEnabled(): ConnectorConfig[];

  /**
   * List all connectors (enabled and disabled).
   */
  listAll(): ConnectorConfig[];

  /**
   * Register a new connector configuration.
   */
  registerConnector(config: ConnectorConfig): void;

  /**
   * Validate a connector configuration.
   * Throws if invalid.
   */
  validate(config: ConnectorConfig): void;
}

/**
 * In-memory implementation of ConnectorRegistry.
 */
export class InMemoryConnectorRegistry implements ConnectorRegistry {
  private readonly connectors = new Map<string, ConnectorConfig>();

  /**
   * Load from an array of configurations.
   */
  static fromConfigs(configs: ConnectorConfig[]): InMemoryConnectorRegistry {
    const registry = new InMemoryConnectorRegistry();
    for (const config of configs) {
      registry.registerConnector(config);
    }
    return registry;
  }

  getConnector(name: string): ConnectorConfig | undefined {
    return this.connectors.get(name);
  }

  listEnabled(): ConnectorConfig[] {
    return Array.from(this.connectors.values()).filter((c) => c.enabled);
  }

  listAll(): ConnectorConfig[] {
    return Array.from(this.connectors.values());
  }

  registerConnector(config: ConnectorConfig): void {
    this.validate(config);
    this.connectors.set(config.name, config);
  }

  validate(config: ConnectorConfig): void {
    if (!config.name || config.name.trim() === "") {
      throw new Error("Connector.name is required and must be non-empty");
    }
    if (!config.type || config.type.trim() === "") {
      throw new Error(
        `Connector ${config.name}: type is required and must be non-empty`,
      );
    }
    if (
      !Number.isInteger(config.pollIntervalMs) ||
      config.pollIntervalMs <= 0
    ) {
      throw new Error(
        `Connector ${config.name}: pollIntervalMs must be a positive integer`,
      );
    }
    if (
      !Number.isInteger(config.requestTimeoutMs) ||
      config.requestTimeoutMs <= 0
    ) {
      throw new Error(
        `Connector ${config.name}: requestTimeoutMs must be a positive integer`,
      );
    }
    if (!Number.isInteger(config.maxRetries) || config.maxRetries < 0) {
      throw new Error(
        `Connector ${config.name}: maxRetries must be a non-negative integer`,
      );
    }
    if (!config.providerConfig || typeof config.providerConfig !== "object") {
      throw new Error(
        `Connector ${config.name}: providerConfig is required and must be an object`,
      );
    }
  }
}
