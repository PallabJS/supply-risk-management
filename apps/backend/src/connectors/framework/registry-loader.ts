import { readFile } from "node:fs/promises";
import {
  InMemoryConnectorRegistry,
  type ConnectorConfig,
  type ConnectorRegistry,
} from "./registry.js";

/**
 * Loads connector registry from configuration sources.
 * Supports multiple strategies:
 * 1. JSON file (CONNECTORS_CONFIG_PATH env var)
 * 2. Environment variables (ENABLED_CONNECTORS, CONNECTOR_* prefixes)
 */

/**
 * Load connector registry from environment configuration.
 * Detects the appropriate strategy and loads accordingly.
 */
export async function loadConnectorRegistry(
  env: NodeJS.ProcessEnv,
): Promise<ConnectorRegistry> {
  const configPath = env.CONNECTORS_CONFIG_PATH?.trim();

  if (configPath) {
    // Strategy: Load from JSON file
    return loadFromJsonFile(configPath, env);
  }

  // Strategy: Load from environment variables
  return loadFromEnvironment(env);
}

/**
 * Load from a JSON configuration file.
 * File format:
 * {
 *   "connectors": [
 *     {
 *       "name": "weather-india",
 *       "type": "INDIA_WEATHER",
 *       "enabled": true,
 *       "pollIntervalMs": 60000,
 *       "providerConfig": { ... }
 *     }
 *   ]
 * }
 */
async function loadFromJsonFile(
  filePath: string,
  env: NodeJS.ProcessEnv,
): Promise<ConnectorRegistry> {
  try {
    const content = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(content) as unknown;

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Root must be an object");
    }

    const root = parsed as Record<string, unknown>;
    const connectorsArray = root.connectors;

    if (!Array.isArray(connectorsArray)) {
      throw new Error('Root must contain "connectors" array');
    }

    // Substitute environment variables in all connector configs
    const configs = connectorsArray.map((item) => {
      const config = item as ConnectorConfig;
      return substituteEnvVars(config, env);
    });

    return InMemoryConnectorRegistry.fromConfigs(configs);
  } catch (error) {
    throw new Error(
      `Failed to load connector registry from ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Load from environment variables.
 * Format:
 *   ENABLED_CONNECTORS=weather-india,jira-prod,github-security
 *   CONNECTOR_WEATHER_INDIA_TYPE=INDIA_WEATHER
 *   CONNECTOR_WEATHER_INDIA_POLL_INTERVAL_MS=60000
 *   CONNECTOR_WEATHER_INDIA_REQUEST_TIMEOUT_MS=10000
 *   CONNECTOR_WEATHER_INDIA_MAX_RETRIES=2
 *   CONNECTOR_WEATHER_INDIA_BASE_URL=https://api.weatherapi.com/v1
 *   ...
 */
function loadFromEnvironment(env: NodeJS.ProcessEnv): ConnectorRegistry {
  const enabledConnectorsStr = env.ENABLED_CONNECTORS?.trim();
  if (!enabledConnectorsStr) {
    throw new Error(
      "Either CONNECTORS_CONFIG_PATH or ENABLED_CONNECTORS env var must be set",
    );
  }

  const connectorNames = enabledConnectorsStr
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");

  const configs: ConnectorConfig[] = [];
  for (const name of connectorNames) {
    const config = loadConnectorFromEnv(name, env);
    configs.push(config);
  }

  return InMemoryConnectorRegistry.fromConfigs(configs);
}

/**
 * Parse a single connector from environment variables.
 * Name format: "weather-india" becomes "CONNECTOR_WEATHER_INDIA_*" env vars
 */
function loadConnectorFromEnv(
  connectorName: string,
  env: NodeJS.ProcessEnv,
): ConnectorConfig {
  const prefix = `CONNECTOR_${connectorName.toUpperCase().replace(/-/g, "_")}_`;

  const getRequired = (suffix: string): string => {
    const value = env[`${prefix}${suffix}`]?.trim();
    if (!value) {
      throw new Error(
        `Required environment variable ${prefix}${suffix} not set for connector ${connectorName}`,
      );
    }
    return value;
  };

  const getOptional = (suffix: string): string | undefined => {
    return env[`${prefix}${suffix}`]?.trim() || undefined;
  };

  const getInt = (suffix: string, required: boolean = true): number => {
    const value = required ? getRequired(suffix) : getOptional(suffix);
    if (!value) {
      throw new Error(
        `Invalid environment variable ${prefix}${suffix}: must be an integer`,
      );
    }
    const parsed = parseInt(value, 10);
    if (!Number.isInteger(parsed)) {
      throw new Error(
        `Invalid environment variable ${prefix}${suffix}: must be an integer, got ${value}`,
      );
    }
    return parsed;
  };

  const type = getRequired("TYPE");
  const enabled = getOptional("ENABLED") !== "false";
  const pollIntervalMs = getInt("POLL_INTERVAL_MS");
  const requestTimeoutMs = getInt("REQUEST_TIMEOUT_MS");
  const maxRetries = getInt("MAX_RETRIES", false) || 2;

  // Gather provider-specific config from remaining env vars
  const providerConfig: Record<string, unknown> = {};
  const prefixLen = prefix.length;

  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith(prefix)) {
      const suffix = key.slice(prefixLen);
      // Skip universal fields
      if (
        ![
          "TYPE",
          "ENABLED",
          "POLL_INTERVAL_MS",
          "REQUEST_TIMEOUT_MS",
          "MAX_RETRIES",
        ].includes(suffix)
      ) {
        // Convert snake_case keys to camelCase for provider config
        const camelKey = suffix
          .toLowerCase()
          .replace(/_./g, (m) => (m[1] || "").toUpperCase());
        providerConfig[camelKey] = value;
      }
    }
  }

  return {
    name: connectorName,
    type,
    enabled,
    pollIntervalMs,
    requestTimeoutMs,
    maxRetries,
    providerConfig,
  };
}

/**
 * Substitute environment variables in connector config.
 * Looks for ${VAR_NAME} patterns in string values.
 */
function substituteEnvVars(
  config: ConnectorConfig,
  env: NodeJS.ProcessEnv,
): ConnectorConfig {
  const substituteValue = (value: unknown): unknown => {
    if (typeof value === "string") {
      return value.replace(/\$\{([^}]+)\}/g, (_match, varName: string) => {
        const resolved = env[varName];
        if (!resolved) {
          throw new Error(
            `Environment variable ${varName} referenced in connector ${config.name} but not set`,
          );
        }
        return resolved;
      });
    }
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(obj)) {
        result[key] = substituteValue(val);
      }
      return result;
    }
    if (Array.isArray(value)) {
      return value.map((item) => substituteValue(item));
    }
    return value;
  };

  return {
    ...config,
    providerConfig: substituteValue(config.providerConfig) as Record<
      string,
      unknown
    >,
  };
}
