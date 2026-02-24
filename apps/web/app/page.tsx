"use client";

/**
 * Main Dashboard Page
 */

import { useEffect, useState } from "react";
import { DashboardHeader } from "@/components/Header";
import { MetricsGrid, MetricCard } from "@/components/MetricCard";
import {
  RiskDistributionChart,
  EventTypeChart,
  ConnectorLatencyChart,
  RiskTrendChart,
} from "@/components/Charts";
import {
  RecentSignalsTable,
  RecentEventsTable,
  RecentRisksTable,
  ConnectorMetricsTable,
} from "@/components/Tables";
import type {
  Signal,
  ClassifiedEvent,
  RiskEvaluation,
  ConnectorMetrics,
} from "@/lib/redis";
import {
  calculateRiskSummary,
  calculateEventSummary,
  calculateConnectorHealth,
  getRiskTrendData,
  type RiskSummary,
  type EventSummary,
  type ConnectorHealth,
} from "@/lib/metrics";

interface DashboardData {
  signals: Signal[];
  events: ClassifiedEvent[];
  risks: RiskEvaluation[];
  connectors: ConnectorMetrics[];
  riskSummary: RiskSummary;
  eventSummary: EventSummary;
  connectorHealth: ConnectorHealth;
  riskTrend: Array<{ time: string; count: number; avgScore: number }>;
  lastUpdated: string;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/metrics");
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        const dashboardData = await response.json();
        setData(dashboardData);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch data");
        console.error("Error fetching dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    if (autoRefresh) {
      const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  if (loading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow text-center max-w-md">
          <h2 className="text-xl font-bold text-red-600 mb-2">
            Unable to Load Dashboard
          </h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <p className="text-sm text-gray-500">
            Make sure Redis is running and the backend services are available.
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600">No data available</p>
        </div>
      </div>
    );
  }

  const connectorLatencyData = data.connectors.map((c) => ({
    name: c.connectorName,
    latency: c.averageLatencyMs,
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader />

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Last Updated Info */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <p className="text-sm text-gray-600">
              Last updated:{" "}
              <span className="font-mono">
                {new Date(data.lastUpdated).toLocaleTimeString()}
              </span>
            </p>
          </div>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-4 py-2 rounded text-sm font-medium transition ${
              autoRefresh
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-gray-200 text-gray-800 hover:bg-gray-300"
            }`}
          >
            {autoRefresh ? "Auto-refresh: ON" : "Auto-refresh: OFF"}
          </button>
        </div>

        {/* Main Metrics */}
        <MetricsGrid>
          <MetricCard
            title="Total Risks"
            value={data.riskSummary.totalRisks}
            icon="⚠️"
            color="blue"
            subtext={`Exposure: $${(data.riskSummary.totalExposure / 1000).toFixed(1)}k`}
          />
          <MetricCard
            title="Critical Risks"
            value={data.riskSummary.criticalCount}
            icon="🔴"
            color="red"
            subtext="Immediate action required"
          />
          <MetricCard
            title="Signal Ingestion"
            value={data.signals.length}
            unit="signals"
            icon="📡"
            color="green"
            subtext={`Avg confidence: ${(data.eventSummary.averageConfidence * 100).toFixed(1)}%`}
          />
          <MetricCard
            title="Active Connectors"
            value={data.connectorHealth.activeConnectors}
            unit={`/${data.connectorHealth.totalConnectors}`}
            icon="🔌"
            color="green"
            subtext={`Success rate: ${data.connectorHealth.successRate.toFixed(1)}%`}
          />
        </MetricsGrid>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <RiskDistributionChart data={data.riskSummary.severityDistribution} />
          <RiskTrendChart data={data.riskTrend} />
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <EventTypeChart data={data.eventSummary.eventTypeBreakdown} />
          {connectorLatencyData.length > 0 && (
            <ConnectorLatencyChart data={connectorLatencyData} />
          )}
        </div>

        {/* Tables */}
        <div className="space-y-6 mb-8">
          <ConnectorMetricsTable connectors={data.connectors} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RecentSignalsTable signals={data.signals} />
            <RecentEventsTable events={data.events} />
          </div>
          <RecentRisksTable risks={data.risks} />
        </div>
      </div>
    </div>
  );
}
