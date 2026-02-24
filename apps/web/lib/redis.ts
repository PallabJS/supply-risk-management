/**
 * Redis client for fetching metrics from the backend
 * This module handles all data retrieval from Redis streams and storage
 */

import { createClient } from "redis";

type AppRedisClient = ReturnType<typeof createClient>;

let redisClient: AppRedisClient | null = null;
let redisUnavailableUntil = 0;

export async function getRedisClient(): Promise<AppRedisClient | null> {
  if (Date.now() < redisUnavailableUntil) {
    return null;
  }

  if (redisClient) {
    return redisClient;
  }

  const client = createClient({
    socket: {
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      connectTimeout: 1000,
      reconnectStrategy: () => false,
    },
    password: process.env.REDIS_PASSWORD,
  });

  client.on("error", (err) => console.error("Redis Client Error", err));

  try {
    await client.connect();
    redisClient = client;
    return client;
  } catch (error) {
    console.error("Redis connection failed:", error);
    redisUnavailableUntil = Date.now() + 5000;
    try {
      await client.quit();
    } catch {}
    return null;
  }
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
  classification_id?: string;
  event_type?: string;
  impact_region?: string;
  expected_duration_hours?: number;
  impacted_lanes?: string[];
  lane_relevance_score?: number;
  risk_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  estimated_revenue_exposure: number;
  timestamp?: string;
}

export interface MitigationAction {
  action_id: string;
  title: string;
  description: string;
  estimated_cost_inr: number;
  expected_delay_reduction_hours: number;
  priority: 1 | 2 | 3;
}

export interface MitigationPlan {
  mitigation_id: string;
  risk_id: string;
  classification_id: string;
  lane_id: string;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  predicted_delay_hours: number;
  mitigation_confidence: number;
  recommended_actions: MitigationAction[];
  created_at_utc: string;
  timestamp?: string;
}

export interface RiskNotification {
  notification_id: string;
  risk_id: string;
  mitigation_id: string;
  lane_id: string;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  message: string;
  channels: string[];
  requires_ack: boolean;
  status: "OPEN" | "ACKNOWLEDGED";
  created_at_utc: string;
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
    if (!client) {
      return [];
    }
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
    if (!client) {
      return [];
    }
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
    if (!client) {
      return [];
    }
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
        classification_id: payload.classification_id as string,
        event_type: payload.event_type as string,
        impact_region: payload.impact_region as string,
        expected_duration_hours:
          typeof payload.expected_duration_hours === "number"
            ? payload.expected_duration_hours
            : parseInt(String(payload.expected_duration_hours ?? "0")),
        impacted_lanes: Array.isArray(payload.impacted_lanes)
          ? (payload.impacted_lanes as string[])
          : undefined,
        lane_relevance_score:
          typeof payload.lane_relevance_score === "number"
            ? payload.lane_relevance_score
            : parseFloat(String(payload.lane_relevance_score ?? "0")),
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

export async function getMitigationPlansFromStream(
  limit: number = 100,
): Promise<MitigationPlan[]> {
  try {
    const client = await getRedisClient();
    if (!client) {
      return [];
    }
    const plans = await client.xRevRange("mitigation-plans", "+", "-", {
      COUNT: limit,
    });

    return plans.map((item) => {
      const { payload, publishedAt, fallbackTimestamp } =
        parseStreamPayload<Partial<MitigationPlan>>(item);

      let predictedDelay = payload.predicted_delay_hours;
      if (typeof predictedDelay !== "number") {
        predictedDelay = parseInt(String(predictedDelay ?? "0"));
      }

      let mitigationConfidence = payload.mitigation_confidence;
      if (typeof mitigationConfidence !== "number") {
        mitigationConfidence = parseFloat(String(mitigationConfidence ?? "0"));
      }

      return {
        mitigation_id: (payload.mitigation_id as string) || item.id,
        risk_id: (payload.risk_id as string) || "unknown",
        classification_id: (payload.classification_id as string) || "unknown",
        lane_id: (payload.lane_id as string) || "unknown",
        risk_level:
          (payload.risk_level as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL") ||
          "LOW",
        predicted_delay_hours: Number.isFinite(predictedDelay)
          ? predictedDelay
          : 0,
        mitigation_confidence: Number.isFinite(mitigationConfidence)
          ? mitigationConfidence
          : 0,
        recommended_actions: Array.isArray(payload.recommended_actions)
          ? (payload.recommended_actions as MitigationAction[])
          : [],
        created_at_utc:
          (payload.created_at_utc as string) ||
          publishedAt ||
          fallbackTimestamp ||
          new Date().toISOString(),
        timestamp: publishedAt || fallbackTimestamp,
      };
    });
  } catch (error) {
    console.error("Error fetching mitigation plans:", error);
    return [];
  }
}

export async function getNotificationsFromStream(
  limit: number = 100,
): Promise<RiskNotification[]> {
  try {
    const client = await getRedisClient();
    if (!client) {
      return [];
    }
    const notifications = await client.xRevRange("notifications", "+", "-", {
      COUNT: limit,
    });

    return notifications.map((item) => {
      const { payload, publishedAt, fallbackTimestamp } =
        parseStreamPayload<Partial<RiskNotification>>(item);

      return {
        notification_id: (payload.notification_id as string) || item.id,
        risk_id: (payload.risk_id as string) || "unknown",
        mitigation_id: (payload.mitigation_id as string) || "unknown",
        lane_id: (payload.lane_id as string) || "unknown",
        risk_level:
          (payload.risk_level as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL") ||
          "LOW",
        title: (payload.title as string) || "Risk alert",
        message: (payload.message as string) || "",
        channels: Array.isArray(payload.channels)
          ? (payload.channels as string[])
          : ["DASHBOARD"],
        requires_ack: Boolean(payload.requires_ack),
        status:
          (payload.status as "OPEN" | "ACKNOWLEDGED") || "OPEN",
        created_at_utc:
          (payload.created_at_utc as string) ||
          publishedAt ||
          fallbackTimestamp ||
          new Date().toISOString(),
        timestamp: publishedAt || fallbackTimestamp,
      };
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return [];
  }
}

export async function getConnectorMetrics(
  connectorName?: string,
): Promise<ConnectorMetrics[]> {
  try {
    const client = await getRedisClient();
    if (!client) {
      return [];
    }

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
    if (!client) {
      return null;
    }
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
    if (!client) {
      return null;
    }
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
