import { NextResponse } from "next/server";
import {
  getSignalsFromStream,
  getClassifiedEventsFromStream,
  getRiskEvaluationsFromStream,
  getConnectorMetrics,
  getMitigationPlansFromStream,
  getNotificationsFromStream,
} from "@/lib/redis";
import {
  calculateRiskSummary,
  calculateEventSummary,
  calculateConnectorHealth,
  getRiskTrendData,
  calculateActionSummary,
} from "@/lib/metrics";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    // Fetch all data in parallel
    const [signals, events, risks, connectors, mitigations, notifications] = await Promise.all([
      getSignalsFromStream(100),
      getClassifiedEventsFromStream(100),
      getRiskEvaluationsFromStream(100),
      getConnectorMetrics(),
      getMitigationPlansFromStream(100),
      getNotificationsFromStream(100),
    ]);

    // Calculate summaries
    const riskSummary = calculateRiskSummary(risks);
    const eventSummary = calculateEventSummary(events);
    const connectorHealth = calculateConnectorHealth(connectors);
    const riskTrend = getRiskTrendData(risks);
    const actionSummary = calculateActionSummary(mitigations, notifications);

    return NextResponse.json(
      {
        signals,
        events,
        risks,
        connectors,
        mitigations,
        notifications,
        riskSummary,
        eventSummary,
        connectorHealth,
        actionSummary,
        riskTrend,
        lastUpdated: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("Error fetching metrics:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch metrics",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
