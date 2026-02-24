/**
 * Registry of built-in connectors.
 * This module registers all available connector types.
 *
 * To add a new connector:
 * 1. Create src/connectors/{type-name}/index.ts with a factory function
 * 2. Import and register it here
 * 3. Add it to connectors.json or env vars
 */

import { registerConnector } from "./connector-factory.js";
import { createNoaaWeatherConnector } from "../weather-noaa/index.js";
import { createIndianWeatherConnector } from "../weather-india/index.js";

/**
 * Register all built-in connectors.
 * Call this once at application startup.
 */
export function registerBuiltInConnectors(): void {
  // Weather data
  registerConnector("NOAA_WEATHER", createNoaaWeatherConnector);
  registerConnector("INDIA_WEATHER", createIndianWeatherConnector);

  // TODO: Register other connectors as they are implemented
  // registerConnector("JIRA", createJiraConnector);
  // registerConnector("GITHUB", createGithubConnector);
  // registerConnector("DATADOG", createDatadogConnector);
  // registerConnector("SLACK", createSlackConnector);
  // ... etc
}
