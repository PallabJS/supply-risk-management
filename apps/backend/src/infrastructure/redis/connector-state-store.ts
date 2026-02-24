import type { AppRedisClient } from "./client.js";
import type { ConnectorStateStore } from "../../connectors/framework/types.js";

/**
 * Redis-backed implementation of ConnectorStateStore.
 *
 * Persists connector state (e.g., etag, lastModified, cursors) across restarts.
 * Uses Redis hash for atomicity and versioning.
 *
 * Key pattern: connector:state:{connectorName}
 * Hash fields:
 *   - latest: current state JSON
 *   - timestamp: ISO timestamp of last save
 *   - version: state schema version (for migrations)
 */
export class RedisConnectorStateStore implements ConnectorStateStore {
  constructor(private readonly redis: AppRedisClient) {}

  /**
   * Load previously saved state for a connector.
   * @param connectorName - Name of the connector (e.g., "weather-india")
   * @returns Parsed state object, or undefined if not found
   */
  async load<TState extends object>(
    connectorName: string,
  ): Promise<TState | undefined> {
    const key = this.getStateKey(connectorName);
    const stateJson = await this.redis.hGet(key, "latest");

    if (!stateJson) {
      return undefined;
    }

    try {
      return JSON.parse(stateJson) as TState;
    } catch (error) {
      throw new Error(
        `Failed to parse saved state for connector ${connectorName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Save state for a connector.
   * Overwrites previous state and updates timestamp.
   * @param connectorName - Name of the connector
   * @param state - State object to persist
   */
  async save<TState extends object>(
    connectorName: string,
    state: TState,
  ): Promise<void> {
    const key = this.getStateKey(connectorName);
    const stateJson = JSON.stringify(state);
    const timestamp = new Date().toISOString();

    await this.redis.hSet(key, {
      latest: stateJson,
      timestamp,
      version: "1", // For future migration support
    });
  }

  /**
   * Delete saved state for a connector (for cleanup/reset).
   * @param connectorName - Name of the connector
   */
  async delete(connectorName: string): Promise<void> {
    const key = this.getStateKey(connectorName);
    await this.redis.del(key);
  }

  /**
   * Get the Redis key for a connector's state.
   */
  private getStateKey(connectorName: string): string {
    if (!connectorName || connectorName.trim() === "") {
      throw new Error("Connector name must be non-empty");
    }
    return `connector:state:${connectorName}`;
  }
}
