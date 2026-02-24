"use client";

/**
 * Main Dashboard Page
 */

import { useEffect, useState } from "react";
import { DashboardHeader } from "@/components/Header";
import { MetricsGrid, MetricCard } from "@/components/MetricCard";
import { OperationsRiskTable, buildOperationsRows } from "@/components/Tables";
import type {
  Signal,
  ClassifiedEvent,
  RiskEvaluation,
  MitigationPlan,
  RiskNotification,
} from "@/lib/redis";
import type {
  RiskSummary,
  EventSummary,
  ConnectorHealth,
  ActionSummary,
} from "@/lib/metrics";

interface DashboardData {
  signals: Signal[];
  events: ClassifiedEvent[];
  risks: RiskEvaluation[];
  mitigations: MitigationPlan[];
  notifications: RiskNotification[];
  riskSummary: RiskSummary;
  eventSummary: EventSummary;
  connectorHealth: ConnectorHealth;
  actionSummary: ActionSummary;
  riskTrend: Array<{ time: string; count: number; avgScore: number }>;
  lastUpdated: string;
}

function formatInr(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function safeDate(value?: string): Date | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
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
        const response = await fetch("/api/metrics", { cache: "no-store" });
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

  const lastUpdated = safeDate(data.lastUpdated);
  const attentionCount =
    data.riskSummary.criticalCount + data.riskSummary.highCount;
  const operationsRows = buildOperationsRows(
    data.risks,
    data.mitigations,
    data.notifications,
  );
  const averagePredictedDelay =
    data.mitigations.length > 0
      ? Math.round(
          data.mitigations.reduce(
            (sum, item) => sum + item.predicted_delay_hours,
            0,
          ) / data.mitigations.length,
        )
      : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader />

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Top bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <p className="text-sm text-gray-600">
              Live view •{" "}
              <span className="font-mono">
                {lastUpdated ? lastUpdated.toLocaleTimeString() : "—"}
              </span>
              {error ? (
                <span className="ml-2 text-red-600">({error})</span>
              ) : null}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-4 py-2 rounded-xl text-sm font-medium border transition shadow-sm ${
                autoRefresh
                  ? "bg-slate-900 text-white border-slate-900 hover:bg-slate-800"
                  : "bg-white text-slate-900 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
            </button>
          </div>
        </div>

        {/* At-a-glance KPIs */}
        <MetricsGrid>
          <MetricCard
            title="Open Alerts"
            value={data.actionSummary.openNotifications || attentionCount}
            icon="⚠️"
            color={data.actionSummary.openNotifications > 0 ? "red" : "green"}
            subtext={`${data.actionSummary.criticalNotifications} critical • ${data.actionSummary.highNotifications} high`}
          />
          <MetricCard
            title="Predicted Delay"
            value={`${averagePredictedDelay}h`}
            icon="⏱️"
            color="yellow"
            subtext="Average delay across active mitigations"
          />
          <MetricCard
            title="Action Plans"
            value={data.mitigations.length}
            unit=""
            icon="🛠️"
            color="blue"
            subtext={`Plan confidence ${(data.actionSummary.avgMitigationConfidence * 100).toFixed(0)}%`}
          />
          <MetricCard
            title="Exposure At Risk"
            value={formatInr(data.riskSummary.totalExposure)}
            icon="₹"
            color="red"
            subtext="Estimated revenue exposure on active lanes"
          />
        </MetricsGrid>
        <div className="bg-white border border-gray-200/70 rounded-2xl p-5 shadow-sm mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Operational Summary</h2>
          <p className="text-sm text-gray-600 mt-1">
            Prioritized risk and mitigation recommendations for active routes.
            Focus on severity, delay impact, exposure, and best next action.
          </p>
        </div>

        <div className="mb-8">
          <OperationsRiskTable rows={operationsRows} />
        </div>
      </div>
    </div>
  );
}
