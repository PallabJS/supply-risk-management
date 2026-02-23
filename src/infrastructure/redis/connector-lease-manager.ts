import { hostname } from "node:os";
import type { AppRedisClient } from "./client.js";
import type {
  ConnectorLease,
  ConnectorLeaseManager,
} from "../../connectors/framework/types.js";

/**
 * Redis-backed implementation of ConnectorLeaseManager.
 *
 * Ensures only one instance of a connector runs at a time in a distributed deployment.
 * Uses Redis SET with NX (not exists) and EX (expiry) for atomic lease acquisition.
 *
 * Key pattern: lease:{connectorName}
 * Value: instance ID (hostname:pid or UUID)
 * TTL: ttlSeconds (auto-expires if instance crashes)
 */
export class RedisConnectorLeaseManager implements ConnectorLeaseManager {
  private readonly instanceId: string;

  constructor(
    private readonly redis: AppRedisClient,
    instanceId?: string,
  ) {
    // Generate unique instance ID if not provided
    // Format: hostname:pid for process-level isolation
    this.instanceId =
      instanceId || `${hostname()}:${process.pid}:${Date.now()}`;
  }

  /**
   * Try to acquire a lease for a connector.
   * Only succeeds if no other instance holds the lease.
   *
   * @param connectorName - Name of the connector
   * @param ttlSeconds - How long the lease lasts (auto-renew or it expires)
   * @returns A ReleasableLease object if acquired, undefined if already held by another instance
   */
  async tryAcquire(
    connectorName: string,
    ttlSeconds: number,
  ): Promise<ConnectorLease | undefined> {
    const key = this.getLeaseKey(connectorName);

    // Attempt atomic set: only set if key doesn't exist, with TTL
    const acquired = await this.redis.set(key, this.instanceId, {
      NX: true, // Only set if not exists
      EX: ttlSeconds, // Expiry time in seconds
    });

    if (!acquired) {
      return undefined; // Another instance holds the lease
    }

    return {
      release: async () => {
        await this.releaseLease(key);
      },
    };
  }

  /**
   * Release a lease (cleanup).
   * Only released if still held by this instance.
   */
  private async releaseLease(key: string): Promise<void> {
    // Only delete if still owned by this instance
    // This prevents one instance from releasing another instance's lease
    const owner = await this.redis.get(key);
    if (owner === this.instanceId) {
      await this.redis.del(key);
    }
  }

  /**
   * Get the Redis key for a connector's lease.
   */
  private getLeaseKey(connectorName: string): string {
    if (!connectorName || connectorName.trim() === "") {
      throw new Error("Connector name must be non-empty");
    }
    return `lease:${connectorName}`;
  }
}
