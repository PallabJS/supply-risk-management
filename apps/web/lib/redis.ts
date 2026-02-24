/**
 * Redis client for fetching metrics from the backend
 * This module handles all data retrieval from Redis streams and storage
 */

import { createClient } from "redis";

type AppRedisClient = ReturnType<typeof createClient>;

let redisClient: AppRedisClient | null = null;

export async function getRedisClient(): Promise<AppRedisClient> {
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

function parseStreamPayload<T extends Record<string, unknown>>(
  item: { id: string; message: Record<string, string> },
): { payload: T; publishedAt?: string; fallbackTimestamp?: string } {
  const rawPayload = item.message.payload;
  const publishedAt = item.message.published_at_utc;

  let payload: T = {} as T;
  if (rawPayload) {
    try {
      payload = JSON.parse(rawPayload) as T;
    } catch (e) {
      console.error("Failed to parse stream payload JSON", {
        id: item.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  let fallbackTimestamp: string | undefined;
  const [ms] = item.id.split("-");
  const msNumber = Number(ms);
  if (Number.isFinite(msNumber) && msNumber > 0) {
    fallbackTimestamp = new Date(msNumber).toISOString();
  }

  return {
    payload,
    publishedAt,
    fallbackTimestamp,
  };
}

function normalizeSeverityLevel(
  value: unknown,
): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (typeof value === "number" && Number.isFinite(value)) {
    const rounded = Math.round(value);
    if (rounded >= 5) return "CRITICAL";
    if (rounded === 4) return "HIGH";
    if (rounded === 3) return "MEDIUM";
    return "LOW";
  }

  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();
    if (normalized === "CRITICAL") return "CRITICAL";
    if (normalized === "HIGH") return "HIGH";
    if (normalized === "MEDIUM") return "MEDIUM";
    if (normalized === "LOW") return "LOW";
  }

  return "LOW";
}

export async function getSignalsFromStream(
  limit: number = 100,
): Promise<Signal[]> {
  try {
    const client = await getRedisClient();
    const signals = await client.xRevRange("external-signals", "+", "-", {
      COUNT: limit,
    });

    return signals.map((item) => {
      const { payload, publishedAt, fallbackTimestamp } =
        parseStreamPayload<Partial<Signal> & { signal_confidence?: number }>(
          item,
        );

      let confidence = payload.signal_confidence;
      if (typeof confidence !== "number") {
        confidence = parseFloat(String(confidence ?? "0"));
      }

      return {
        event_id: (payload.event_id as string) || item.id,
        source_type: (payload.source_type as string) || "unknown",
        raw_content: (payload.raw_content as string) || "",
        geographic_scope: (payload.geographic_scope as string) || "unknown",
        signal_confidence: Number.isFinite(confidence) ? confidence : 0,
        timestamp: publishedAt || fallbackTimestamp,
      };
    });
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

    return events.map((item) => {
      const { payload, publishedAt, fallbackTimestamp } =
        parseStreamPayload<
          Partial<ClassifiedEvent> & { classification_confidence?: number }
        >(item);

      let confidence = payload.classification_confidence;
      if (typeof confidence !== "number") {
        confidence = parseFloat(String(confidence ?? "0"));
      }

      const severity = normalizeSeverityLevel(payload.severity_level);

      return {
        classification_id:
          (payload.classification_id as string) || item.id,
        event_id: (payload.event_id as string) || item.id,
        event_type: (payload.event_type as string) || "unknown",
        severity_level: severity,
        classification_confidence: Number.isFinite(confidence) ? confidence : 0,
        timestamp: publishedAt || fallbackTimestamp,
      };
    });
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

    return evaluations.map((item) => {
      const { payload, publishedAt, fallbackTimestamp } =
        parseStreamPayload<
          Partial<RiskEvaluation> & {
            risk_score?: number;
            estimated_revenue_exposure?: number;
          }
        >(item);

      let riskScore = payload.risk_score;
      if (typeof riskScore !== "number") {
        riskScore = parseFloat(String(riskScore ?? "0"));
      }

      let exposure = payload.estimated_revenue_exposure;
      if (typeof exposure !== "number") {
        exposure = parseFloat(String(exposure ?? "0"));
      }

      const riskLevel =
        (payload.risk_level as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL") ||
        "LOW";

      return {
        risk_id: (payload.risk_id as string) || item.id,
        risk_score: Number.isFinite(riskScore) ? riskScore : 0,
        risk_level: riskLevel,
        estimated_revenue_exposure: Number.isFinite(exposure) ? exposure : 0,
        timestamp: publishedAt || fallbackTimestamp,
      };
    });
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
    const info = await client.sendCommand([
      "XINFO",
      "STREAM",
      streamName,
    ]);
    return info as unknown;
  } catch (error) {
    console.error(`Error fetching stream stats for ${streamName}:`, error);
    return null;
  }
}
