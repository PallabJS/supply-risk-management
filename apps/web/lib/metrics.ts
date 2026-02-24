/**
 * Utility functions for metrics aggregation and calculations
 */

import type {
  RiskEvaluation,
  ClassifiedEvent,
  ConnectorMetrics,
  MitigationPlan,
  RiskNotification,
} from "./redis";

export interface RiskSummary {
  totalRisks: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  totalExposure: number;
  averageRiskScore: number;
  severityDistribution: {
    CRITICAL: number;
    HIGH: number;
    MEDIUM: number;
    LOW: number;
  };
}

export interface EventSummary {
  totalClassified: number;
  averageConfidence: number;
  eventTypeBreakdown: Record<string, number>;
  severityBreakdown: Record<string, number>;
}

export interface ConnectorHealth {
  totalConnectors: number;
  activeConnectors: number;
  successRate: number;
  totalItemsProcessed: number;
  failedOperations: number;
  averageLatency: number;
}

export interface ActionSummary {
  openNotifications: number;
  criticalNotifications: number;
  highNotifications: number;
  mitigationPlans: number;
  avgMitigationConfidence: number;
}

export function calculateRiskSummary(risks: RiskEvaluation[]): RiskSummary {
  const summary: RiskSummary = {
    totalRisks: risks.length,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    totalExposure: 0,
    averageRiskScore: 0,
    severityDistribution: {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    },
  };

  let scoreSum = 0;

  risks.forEach((risk) => {
    scoreSum += risk.risk_score;
    summary.totalExposure += risk.estimated_revenue_exposure;

    switch (risk.risk_level) {
      case "CRITICAL":
        summary.criticalCount++;
        summary.severityDistribution.CRITICAL++;
        break;
      case "HIGH":
        summary.highCount++;
        summary.severityDistribution.HIGH++;
        break;
      case "MEDIUM":
        summary.mediumCount++;
        summary.severityDistribution.MEDIUM++;
        break;
      case "LOW":
        summary.lowCount++;
        summary.severityDistribution.LOW++;
        break;
    }
  });

  summary.averageRiskScore = risks.length > 0 ? scoreSum / risks.length : 0;

  return summary;
}

export function calculateEventSummary(events: ClassifiedEvent[]): EventSummary {
  const summary: EventSummary = {
    totalClassified: events.length,
    averageConfidence: 0,
    eventTypeBreakdown: {},
    severityBreakdown: {},
  };

  let confidenceSum = 0;

  events.forEach((event) => {
    confidenceSum += event.classification_confidence;

    // Event type breakdown
    summary.eventTypeBreakdown[event.event_type] =
      (summary.eventTypeBreakdown[event.event_type] || 0) + 1;

    // Severity breakdown
    summary.severityBreakdown[event.severity_level] =
      (summary.severityBreakdown[event.severity_level] || 0) + 1;
  });

  summary.averageConfidence =
    events.length > 0 ? confidenceSum / events.length : 0;

  return summary;
}

export function calculateConnectorHealth(
  connectors: ConnectorMetrics[],
): ConnectorHealth {
  const health: ConnectorHealth = {
    totalConnectors: connectors.length,
    activeConnectors: 0,
    successRate: 0,
    totalItemsProcessed: 0,
    failedOperations: 0,
    averageLatency: 0,
  };

  let totalLatency = 0;
  let connectorWithLatency = 0;

  connectors.forEach((connector) => {
    // Check if connector is active (has recent poll activity)
    if (connector.lastPollTime) {
      const lastPollDate = new Date(connector.lastPollTime);
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      if (lastPollDate > fiveMinutesAgo) {
        health.activeConnectors++;
      }
    }

    health.totalItemsProcessed += connector.itemsPublished;
    health.failedOperations += connector.failedPolls;

    if (connector.averageLatencyMs > 0) {
      totalLatency += connector.averageLatencyMs;
      connectorWithLatency++;
    }
  });

  // Calculate success rate
  const totalOperations = connectors.reduce((sum, c) => sum + c.totalPolls, 0);
  if (totalOperations > 0) {
    const totalSuccessful = connectors.reduce(
      (sum, c) => sum + c.successfulPolls,
      0,
    );
    health.successRate = (totalSuccessful / totalOperations) * 100;
  }

  health.averageLatency =
    connectorWithLatency > 0 ? totalLatency / connectorWithLatency : 0;

  return health;
}

export function getRiskTrendData(
  risks: RiskEvaluation[],
  intervals: number = 24,
): Array<{ time: string; count: number; avgScore: number }> {
  const trendData: Record<string, { count: number; scoreSum: number }> = {};

  const now = new Date();

  risks.forEach((risk) => {
    if (!risk.timestamp) return;

    try {
      const riskDate = new Date(risk.timestamp);
      const diffMs = now.getTime() - riskDate.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours > intervals) return;

      const hourBucket = Math.floor(diffHours);
      const label = `${hourBucket}h ago`;

      if (!trendData[label]) {
        trendData[label] = { count: 0, scoreSum: 0 };
      }

      trendData[label].count++;
      trendData[label].scoreSum += risk.risk_score;
    } catch (e) {
      // Invalid timestamp, skip
    }
  });

  return Object.entries(trendData)
    .map(([time, data]) => ({
      time,
      count: data.count,
      avgScore: data.count > 0 ? data.scoreSum / data.count : 0,
    }))
    .sort((a, b) => {
      const aHours = parseInt(a.time.split("h")[0]);
      const bHours = parseInt(b.time.split("h")[0]);
      return bHours - aHours;
    });
}

export function calculateActionSummary(
  mitigations: MitigationPlan[],
  notifications: RiskNotification[],
): ActionSummary {
  let confidenceSum = 0;
  for (const mitigation of mitigations) {
    confidenceSum += mitigation.mitigation_confidence;
  }

  const criticalNotifications = notifications.filter(
    (n) => n.status === "OPEN" && n.risk_level === "CRITICAL",
  ).length;
  const highNotifications = notifications.filter(
    (n) => n.status === "OPEN" && n.risk_level === "HIGH",
  ).length;

  return {
    openNotifications: notifications.filter((n) => n.status === "OPEN").length,
    criticalNotifications,
    highNotifications,
    mitigationPlans: mitigations.length,
    avgMitigationConfidence:
      mitigations.length > 0 ? confidenceSum / mitigations.length : 0,
  };
}
