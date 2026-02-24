/**
 * Data Tables Components
 */

import type {
  Signal,
  ClassifiedEvent,
  RiskEvaluation,
  ConnectorMetrics,
} from "@/lib/redis";

interface RecentSignalsTableProps {
  signals: Signal[];
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function extractSignalTitle(signal: Signal): string {
  const raw = signal.raw_content || "";
  const parsed = raw.trim().startsWith("{") ? safeJsonParse(raw) : undefined;
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.title === "string" && obj.title.trim() !== "") {
      return obj.title.trim();
    }
  }
  return raw.trim() !== "" ? raw.trim().split("|")[0]?.trim() || "Signal" : "Signal";
}

function extractSignalSummary(signal: Signal): string {
  const raw = signal.raw_content || "";
  const parsed = raw.trim().startsWith("{") ? safeJsonParse(raw) : undefined;
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.description === "string" && obj.description.trim() !== "") {
      return obj.description.trim();
    }
  }
  const trimmed = raw.trim();
  if (!trimmed) return "No details available";
  return trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed;
}

function formatTime(iso?: string): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function RecentSignalsTable({ signals }: RecentSignalsTableProps) {
  return (
    <div className="bg-white border border-gray-200/70 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200/70 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">
          Signals
        </h3>
        <span className="text-xs text-gray-500">{signals.length} total</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Signal</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Region</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Confidence</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Time</th>
            </tr>
          </thead>
          <tbody>
            {signals.length === 0 ? (
              <tr>
                <td className="px-6 py-10 text-sm text-gray-500" colSpan={4}>
                  No signals yet. Once connectors publish, you’ll see India-specific alerts here.
                </td>
              </tr>
            ) : (
              signals.slice(0, 10).map((signal) => (
                <tr
                  key={signal.event_id}
                  className="border-b border-gray-200/70 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">
                      {extractSignalTitle(signal)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {extractSignalSummary(signal)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {signal.geographic_scope || "—"}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-20 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-[width] duration-500"
                          style={{ width: `${Math.round(signal.signal_confidence * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-gray-600">
                        {(signal.signal_confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-500">
                    {formatTime(signal.timestamp)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface RecentEventsTableProps {
  events: ClassifiedEvent[];
}

export function RecentEventsTable({ events }: RecentEventsTableProps) {
  function getSeverityBadgeColor(
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  ) {
    switch (severity) {
      case "CRITICAL":
        return "bg-red-100 text-red-800";
      case "HIGH":
        return "bg-orange-100 text-orange-800";
      case "MEDIUM":
        return "bg-yellow-100 text-yellow-800";
      case "LOW":
        return "bg-green-100 text-green-800";
    }
  }

  return (
    <div className="bg-white border border-gray-200/70 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200/70 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">Classified Events</h3>
        <span className="text-xs text-gray-500">{events.length} total</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                Severity
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                Confidence
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                Time
              </th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td className="px-6 py-10 text-sm text-gray-500" colSpan={4}>
                  No classified events yet. They appear after signals are processed by the classifier.
                </td>
              </tr>
            ) : (
              events.slice(0, 10).map((event) => (
                <tr
                  key={event.classification_id}
                  className="border-b border-gray-200/70 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {event.event_type}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border border-transparent ${getSeverityBadgeColor(
                        event.severity_level,
                      )}`}
                    >
                      {event.severity_level}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700 tabular-nums">
                    {(event.classification_confidence * 100).toFixed(0)}%
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-500">
                    {formatTime(event.timestamp)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface RecentRisksTableProps {
  risks: RiskEvaluation[];
}

export function RecentRisksTable({ risks }: RecentRisksTableProps) {
  function getRiskBadgeColor(level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL") {
    switch (level) {
      case "CRITICAL":
        return "bg-red-100 text-red-800";
      case "HIGH":
        return "bg-orange-100 text-orange-800";
      case "MEDIUM":
        return "bg-yellow-100 text-yellow-800";
      case "LOW":
        return "bg-green-100 text-green-800";
    }
  }

  return (
    <div className="bg-white border border-gray-200/70 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200/70 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">Risk Evaluations</h3>
        <span className="text-xs text-gray-500">{risks.length} total</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                Risk ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                Level
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                Score
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                Exposure (INR)
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                Time
              </th>
            </tr>
          </thead>
          <tbody>
            {risks.length === 0 ? (
              <tr>
                <td className="px-6 py-10 text-sm text-gray-500" colSpan={5}>
                  No risk evaluations yet. They appear after events are classified and evaluated.
                </td>
              </tr>
            ) : (
              risks.slice(0, 10).map((risk) => (
                <tr
                  key={risk.risk_id}
                  className="border-b border-gray-200/70 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4 text-sm text-gray-800 truncate font-mono">
                    {risk.risk_id ? risk.risk_id.substring(0, 12) + "…" : "N/A"}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ${getRiskBadgeColor(
                        risk.risk_level,
                      )}`}
                    >
                      {risk.risk_level}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold text-gray-900 tabular-nums">
                    {(risk.risk_score * 100).toFixed(0)}%
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700 tabular-nums">
                    {new Intl.NumberFormat("en-IN", {
                      style: "currency",
                      currency: "INR",
                      maximumFractionDigits: 0,
                    }).format(risk.estimated_revenue_exposure)}
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-500">
                    {formatTime(risk.timestamp)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface ConnectorMetricsTableProps {
  connectors: ConnectorMetrics[];
}

export function ConnectorMetricsTable({
  connectors,
}: ConnectorMetricsTableProps) {
  return (
    <div className="bg-white border border-gray-200/70 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200/70 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">Connectors</h3>
        <span className="text-xs text-gray-500">{connectors.length} total</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                Connector
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                Success Rate
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                Items
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                Latency
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                Last Poll
              </th>
            </tr>
          </thead>
          <tbody>
            {connectors.length === 0 ? (
              <tr>
                <td className="px-6 py-10 text-sm text-gray-500" colSpan={5}>
                  No connector metrics yet.
                </td>
              </tr>
            ) : (
              connectors.map((connector) => {
              const successRate =
                connector.totalPolls > 0
                  ? (
                      (connector.successfulPolls / connector.totalPolls) *
                      100
                    ).toFixed(1)
                  : "N/A";

              return (
                <tr
                  key={connector.connectorName}
                  className="border-b border-gray-200/70 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4 font-medium text-gray-800">
                    {connector.connectorName}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        Number(successRate) >= 95
                          ? "bg-green-100 text-green-800"
                          : Number(successRate) >= 80
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                      }`}
                    >
                      {successRate}%
                    </span>
                  </td>
                  <td className="px-6 py-4">{connector.itemsPublished}</td>
                  <td className="px-6 py-4">
                    {connector.averageLatencyMs.toFixed(0)}ms
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {connector.lastPollTime
                      ? new Date(connector.lastPollTime).toLocaleTimeString()
                      : "Never"}
                  </td>
                </tr>
              );
            })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
