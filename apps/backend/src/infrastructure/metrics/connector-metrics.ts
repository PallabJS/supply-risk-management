import type { AppRedisClient } from "../redis/client.js";
import type { ConnectorPollSummary } from "../../connectors/framework/types.js";

/**
 * Metrics for a single connector.
 */
export interface ConnectorMetrics {
  connectorName: string;
  lastPollTime: string; // ISO timestamp
  lastSuccessTime: string; // ISO timestamp
  totalPolls: number;
  successfulPolls: number;
  failedPolls: number;
  itemsFetched: number;
  itemsPublished: number;
  averageLatencyMs: number;
  currentBackoffMs?: number;
}

/**
 * Collect and persist metrics for connectors.
 * Uses Redis hash for storage.
 *
 * Key pattern: metrics:connector:{connectorName}
 */
export class ConnectorMetricsCollector {
  constructor(private readonly redis: AppRedisClient) {}

  /**
   * Record metrics from a completed poll.
   */
  async recordPoll(
    connectorName: string,
    summary: ConnectorPollSummary,
    latencyMs: number,
  ): Promise<void> {
    const key = this.getMetricsKey(connectorName);
    const now = new Date().toISOString();

    // Get current metrics
    const current = await this.getMetrics(connectorName);

    const totalPolls = (current?.totalPolls || 0) + 1;
    const isSuccess = !summary.failed || summary.published > 0;
    const successfulPolls =
      (current?.successfulPolls || 0) + (isSuccess ? 1 : 0);
    const failedPolls = (current?.failedPolls || 0) + (isSuccess ? 0 : 1);
    const itemsFetched = (current?.itemsFetched || 0) + (summary.fetched || 0);
    const itemsPublished =
      (current?.itemsPublished || 0) + (summary.published || 0);

    // Calculate running average latency
    const prevLatencySum = (current?.averageLatencyMs || 0) * (totalPolls - 1);
    const newLatencySum = prevLatencySum + latencyMs;
    const averageLatencyMs = Math.round(newLatencySum / totalPolls);

    // Write metrics
    await this.redis.hSet(key, {
      connectorName,
      lastPollTime: now,
      ...(isSuccess && { lastSuccessTime: now }),
      totalPolls: String(totalPolls),
      successfulPolls: String(successfulPolls),
      failedPolls: String(failedPolls),
      itemsFetched: String(itemsFetched),
      itemsPublished: String(itemsPublished),
      averageLatencyMs: String(averageLatencyMs),
    });

    // Set expiry (keep metrics for 30 days)
    await this.redis.expire(key, 30 * 24 * 60 * 60);
  }

  /**
   * Get current metrics for a connector.
   */
  async getMetrics(
    connectorName: string,
  ): Promise<ConnectorMetrics | undefined> {
    const key = this.getMetricsKey(connectorName);
    const data = await this.redis.hGetAll(key);

    if (!data || Object.keys(data).length === 0) {
      return undefined;
    }

    return {
      connectorName: data.connectorName || connectorName,
      lastPollTime: data.lastPollTime || new Date().toISOString(),
      lastSuccessTime: data.lastSuccessTime || new Date().toISOString(),
      totalPolls: parseInt(data.totalPolls || "0", 10),
      successfulPolls: parseInt(data.successfulPolls || "0", 10),
      failedPolls: parseInt(data.failedPolls || "0", 10),
      itemsFetched: parseInt(data.itemsFetched || "0", 10),
      itemsPublished: parseInt(data.itemsPublished || "0", 10),
      averageLatencyMs: parseInt(data.averageLatencyMs || "0", 10),
    };
  }

  /**
   * List all connector metrics.
   */
  async listAllMetrics(): Promise<Map<string, ConnectorMetrics>> {
    const pattern = "metrics:connector:*";
    const keys = await this.redis.keys(pattern);

    const result = new Map<string, ConnectorMetrics>();

    for (const key of keys) {
      const connectorName = key.replace("metrics:connector:", "");
      const metrics = await this.getMetrics(connectorName);
      if (metrics) {
        result.set(connectorName, metrics);
      }
    }

    return result;
  }

  /**
   * Get health status for a connector.
   * Returns true if connector is healthy (recent successful polls).
   */
  async isHealthy(
    connectorName: string,
    maxAgeSeconds: number = 300,
  ): Promise<boolean> {
    const metrics = await this.getMetrics(connectorName);
    if (!metrics) {
      return false; // No metrics = unhealthy
    }

    const lastPollAge = Date.now() - new Date(metrics.lastPollTime).getTime();
    const noRecentSuccess =
      Date.now() - new Date(metrics.lastSuccessTime).getTime() >
      maxAgeSeconds * 1000;

    return lastPollAge < maxAgeSeconds * 1000 && !noRecentSuccess;
  }

  /**
   * Get the Redis key for a connector's metrics.
   */
  private getMetricsKey(connectorName: string): string {
    if (!connectorName || connectorName.trim() === "") {
      throw new Error("Connector name must be non-empty");
    }
    return `metrics:connector:${connectorName}`;
  }
}
