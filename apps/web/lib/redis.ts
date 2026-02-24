/**
 * Redis client for fetching metrics from the backend
 * This module handles all data retrieval from Redis streams and storage
 */

import { createClient, RedisClientType } from "redis";

let redisClient: RedisClientType | null = null;

export async function getRedisClient(): Promise<RedisClientType> {
  if (redisClient) {
    return redisClient;
  }

  const client = createClient({
    socket: {
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
    },
    password: process.env.REDIS_PASSWORD,
  });

  client.on("error", (err) => console.error("Redis Client Error", err));

  await client.connect();
  redisClient = client;
  return client;
}

export interface Signal {
  event_id: string;
  source_type: string;
  raw_content: string;
  geographic_scope: string;
  signal_confidence: number;
  timestamp?: string;
}

export interface ClassifiedEvent {
  classification_id: string;
  event_id: string;
  event_type: string;
  severity_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  classification_confidence: number;
  timestamp?: string;
}

export interface RiskEvaluation {
  risk_id: string;
  risk_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  estimated_revenue_exposure: number;
  timestamp?: string;
}

export interface ConnectorMetrics {
  connectorName: string;
  lastPollTime: string;
  lastSuccessTime: string;
  totalPolls: number;
  successfulPolls: number;
  failedPolls: number;
  itemsFetched: number;
  itemsPublished: number;
  averageLatencyMs: number;
  currentBackoffMs?: number;
}

export interface GatewayMetrics {
  requests_total: number;
  requests_failed: number;
  signals_received: number;
  signals_published: number;
}

export async function getSignalsFromStream(
  limit: number = 100,
): Promise<Signal[]> {
  try {
    const client = await getRedisClient();
    const signals = await client.xRevRange("external-signals", "+", "-", {
      COUNT: limit,
    });

    return signals.map((item) => ({
      event_id: (item.message.event_id as string) || item.id,
      source_type: (item.message.source_type as string) || "unknown",
      raw_content: (item.message.raw_content as string) || "",
      geographic_scope: (item.message.geographic_scope as string) || "unknown",
      signal_confidence: parseFloat(
        (item.message.signal_confidence as string) || "0",
      ),
      timestamp: item.id,
    }));
  } catch (error) {
    console.error("Error fetching signals:", error);
    return [];
  }
}

export async function getClassifiedEventsFromStream(
  limit: number = 100,
): Promise<ClassifiedEvent[]> {
  try {
    const client = await getRedisClient();
    const events = await client.xRevRange("classified-events", "+", "-", {
      COUNT: limit,
    });

    return events.map((item) => ({
      classification_id: (item.message.classification_id as string) || item.id,
      event_id: (item.message.event_id as string) || item.id,
      event_type: (item.message.event_type as string) || "unknown",
      severity_level:
        (item.message.severity_level as
          | "LOW"
          | "MEDIUM"
          | "HIGH"
          | "CRITICAL") || "LOW",
      classification_confidence: parseFloat(
        (item.message.classification_confidence as string) || "0",
      ),
      timestamp: item.id,
    }));
  } catch (error) {
    console.error("Error fetching classified events:", error);
    return [];
  }
}

export async function getRiskEvaluationsFromStream(
  limit: number = 100,
): Promise<RiskEvaluation[]> {
  try {
    const client = await getRedisClient();
    const evaluations = await client.xRevRange("risk-evaluations", "+", "-", {
      COUNT: limit,
    });

    return evaluations.map((item) => ({
      risk_id: (item.message.risk_id as string) || item.id,
      risk_score: parseFloat((item.message.risk_score as string) || "0"),
      risk_level:
        (item.message.risk_level as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL") ||
        "LOW",
      estimated_revenue_exposure: parseFloat(
        (item.message.estimated_revenue_exposure as string) || "0",
      ),
      timestamp: item.id,
    }));
  } catch (error) {
    console.error("Error fetching risk evaluations:", error);
    return [];
  }
}

export async function getConnectorMetrics(
  connectorName?: string,
): Promise<ConnectorMetrics[]> {
  try {
    const client = await getRedisClient();

    if (connectorName) {
      const metricsKey = `metrics:connector:${connectorName}`;
      const data = await client.hGetAll(metricsKey);

      if (Object.keys(data).length === 0) {
        return [];
      }

      return [
        {
          connectorName: connectorName,
          lastPollTime: data.lastPollTime || "",
          lastSuccessTime: data.lastSuccessTime || "",
          totalPolls: parseInt(data.totalPolls || "0"),
          successfulPolls: parseInt(data.successfulPolls || "0"),
          failedPolls: parseInt(data.failedPolls || "0"),
          itemsFetched: parseInt(data.itemsFetched || "0"),
          itemsPublished: parseInt(data.itemsPublished || "0"),
          averageLatencyMs: parseFloat(data.averageLatencyMs || "0"),
          currentBackoffMs: data.currentBackoffMs
            ? parseFloat(data.currentBackoffMs)
            : undefined,
        },
      ];
    } else {
      // Get all connector metrics
      const keys = await client.keys("metrics:connector:*");
      const allMetrics: ConnectorMetrics[] = [];

      for (const key of keys) {
        const connName = key.replace("metrics:connector:", "");
        const data = await client.hGetAll(key);

        allMetrics.push({
          connectorName: connName,
          lastPollTime: data.lastPollTime || "",
          lastSuccessTime: data.lastSuccessTime || "",
          totalPolls: parseInt(data.totalPolls || "0"),
          successfulPolls: parseInt(data.successfulPolls || "0"),
          failedPolls: parseInt(data.failedPolls || "0"),
          itemsFetched: parseInt(data.itemsFetched || "0"),
          itemsPublished: parseInt(data.itemsPublished || "0"),
          averageLatencyMs: parseFloat(data.averageLatencyMs || "0"),
          currentBackoffMs: data.currentBackoffMs
            ? parseFloat(data.currentBackoffMs)
            : undefined,
        });
      }

      return allMetrics;
    }
  } catch (error) {
    console.error("Error fetching connector metrics:", error);
    return [];
  }
}

export async function getGatewayMetrics(): Promise<GatewayMetrics | null> {
  try {
    const client = await getRedisClient();
    const data = await client.hGetAll("metrics:gateway:signal-ingestion");

    if (Object.keys(data).length === 0) {
      return null;
    }

    return {
      requests_total: parseInt(data.requests_total || "0"),
      requests_failed: parseInt(data.requests_failed || "0"),
      signals_received: parseInt(data.signals_received || "0"),
      signals_published: parseInt(data.signals_published || "0"),
    };
  } catch (error) {
    console.error("Error fetching gateway metrics:", error);
    return null;
  }
}

export async function getStreamStats(streamName: string): Promise<any> {
  try {
    const client = await getRedisClient();
    const info = await client.xInfo("STREAM", streamName);
    return info;
  } catch (error) {
    console.error(`Error fetching stream stats for ${streamName}:`, error);
    return null;
  }
}
