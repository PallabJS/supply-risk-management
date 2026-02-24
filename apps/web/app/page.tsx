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
import type { RiskSummary, EventSummary, ConnectorHealth } from "@/lib/metrics";

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

type DashboardTab = "overview" | "risks" | "signals" | "events" | "connectors";

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
  const [tab, setTab] = useState<DashboardTab>("overview");

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

  const topRegions = (() => {
    const counts = new Map<string, number>();
    for (const s of data.signals) {
      const key = (s.geographic_scope || "").trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  })();

  const connectorLatencyData = data.connectors.map((c) => ({
    name: c.connectorName,
    latency: c.averageLatencyMs,
  }));

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
            title="Risks (total)"
            value={data.riskSummary.totalRisks}
            icon="⚠️"
            color="blue"
            subtext={`Avg score: ${(data.riskSummary.averageRiskScore * 100).toFixed(0)}%`}
            trend={{ label: "Live", direction: "flat" }}
          />
          <MetricCard
            title="Needs attention"
            value={attentionCount}
            icon="🔎"
            color={attentionCount > 0 ? "red" : "green"}
            subtext={
              attentionCount > 0
                ? `${data.riskSummary.criticalCount} critical • ${data.riskSummary.highCount} high`
                : "No high/critical risks right now"
            }
          />
          <MetricCard
            title="Signals ingested"
            value={data.signals.length}
            unit=""
            icon="📡"
            color="green"
            subtext={`Classifier avg confidence: ${(data.eventSummary.averageConfidence * 100).toFixed(0)}%`}
          />
          <MetricCard
            title="Exposure estimate"
            value={formatInr(data.riskSummary.totalExposure)}
            icon="₹"
            color="yellow"
            subtext="Total estimated revenue exposure"
          />
        </MetricsGrid>

        {/* Tabs */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {(
            [
              ["overview", "Overview"],
              ["risks", "Risks"],
              ["signals", "Signals"],
              ["events", "Events"],
              ["connectors", "Connectors"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-xl text-sm font-medium border transition shadow-sm ${
                tab === key
                  ? "bg-white border-slate-900/15 ring-1 ring-slate-900/10 text-slate-900"
                  : "bg-white/70 border-gray-200 hover:bg-white"
              }`}
            >
              {label}
            </button>
          ))}
          {topRegions.length > 0 && (
            <div className="ml-auto text-xs text-gray-600 hidden md:block">
              Top regions:{" "}
              <span className="font-medium text-gray-900">
                {topRegions.map(([name, count]) => `${name} (${count})`).join(", ")}
              </span>
            </div>
          )}
        </div>

        {tab === "overview" && (
          <div className="space-y-6 mb-8">
            {/* What needs attention */}
            <div className="bg-white border border-gray-200/70 rounded-2xl p-6 shadow-sm animate-fade-in-up">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    What’s going on
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    You’re looking at India-only signals, classified events, and risk evaluations.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-sm text-gray-700">
                    <span className="font-semibold text-gray-900">
                      {attentionCount}
                    </span>{" "}
                    items need attention
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                <div className="rounded-xl border border-gray-200/70 bg-gray-50 p-4">
                  <div className="text-xs text-gray-500">Critical</div>
                  <div className="text-2xl font-semibold text-gray-900 mt-1">
                    {data.riskSummary.criticalCount}
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200/70 bg-gray-50 p-4">
                  <div className="text-xs text-gray-500">High</div>
                  <div className="text-2xl font-semibold text-gray-900 mt-1">
                    {data.riskSummary.highCount}
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200/70 bg-gray-50 p-4">
                  <div className="text-xs text-gray-500">Signals processed</div>
                  <div className="text-2xl font-semibold text-gray-900 mt-1">
                    {data.signals.length}
                  </div>
                </div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <RiskDistributionChart data={data.riskSummary.severityDistribution} />
              <RiskTrendChart data={data.riskTrend} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <EventTypeChart data={data.eventSummary.eventTypeBreakdown} />
              {connectorLatencyData.length > 0 ? (
                <ConnectorLatencyChart data={connectorLatencyData} />
              ) : (
                <div className="bg-white border border-gray-200/70 rounded-2xl p-6 shadow-sm">
                  <h3 className="text-base font-semibold text-gray-900 mb-1">
                    Connector latency
                  </h3>
                  <p className="text-xs text-gray-500 mb-4">
                    No connector latency metrics available yet.
                  </p>
                  <div className="text-sm text-gray-600">
                    Once connector metrics are published, this chart will populate.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Details */}
        <div className="space-y-6 mb-8">
          {tab === "risks" && <RecentRisksTable risks={data.risks} />}
          {tab === "signals" && <RecentSignalsTable signals={data.signals} />}
          {tab === "events" && <RecentEventsTable events={data.events} />}
          {tab === "connectors" && (
            <ConnectorMetricsTable connectors={data.connectors} />
          )}

          {/* Helpful default: show a compact stack on overview */}
          {tab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <RecentRisksTable risks={data.risks} />
              <RecentSignalsTable signals={data.signals} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
