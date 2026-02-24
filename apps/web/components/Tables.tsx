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

export function RecentSignalsTable({ signals }: RecentSignalsTableProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800">
          Recent Signals ({signals.length})
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                Event ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                Source
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                Scope
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                Confidence
              </th>
            </tr>
          </thead>
          <tbody>
            {signals.slice(0, 10).map((signal) => (
              <tr
                key={signal.event_id}
                className="border-b border-gray-200 hover:bg-gray-50"
              >
                <td className="px-6 py-4 text-sm text-gray-800 truncate font-mono">
                  {signal.event_id
                    ? signal.event_id.substring(0, 12) + "..."
                    : "N/A"}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {signal.source_type}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {signal.geographic_scope}
                </td>
                <td className="px-6 py-4 text-sm">
                  <div className="w-16 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full"
                      style={{
                        width: `${signal.signal_confidence * 100}%`,
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
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
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800">
          Recent Events ({events.length})
        </h3>
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
            {events.slice(0, 10).map((event) => (
              <tr
                key={event.classification_id}
                className="border-b border-gray-200 hover:bg-gray-50"
              >
                <td className="px-6 py-4 text-sm text-gray-800">
                  {event.event_type}
                </td>
                <td className="px-6 py-4 text-sm">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${getSeverityBadgeColor(
                      event.severity_level,
                    )}`}
                  >
                    {event.severity_level}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm">
                  {(event.classification_confidence * 100).toFixed(1)}%
                </td>
                <td className="px-6 py-4 text-xs text-gray-500">
                  {event.timestamp
                    ? new Date(event.timestamp).toLocaleTimeString()
                    : "N/A"}
                </td>
              </tr>
            ))}
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
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800">
          Recent Risks ({risks.length})
        </h3>
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
                Exposure
              </th>
            </tr>
          </thead>
          <tbody>
            {risks.slice(0, 10).map((risk) => (
              <tr
                key={risk.risk_id}
                className="border-b border-gray-200 hover:bg-gray-50"
              >
                <td className="px-6 py-4 text-sm text-gray-800 truncate font-mono">
                  {risk.risk_id ? risk.risk_id.substring(0, 12) + "..." : "N/A"}
                </td>
                <td className="px-6 py-4 text-sm">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${getRiskBadgeColor(
                      risk.risk_level,
                    )}`}
                  >
                    {risk.risk_level}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm font-semibold text-gray-800">
                  {risk.risk_score.toFixed(2)}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  ${(risk.estimated_revenue_exposure / 1000).toFixed(1)}k
                </td>
              </tr>
            ))}
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
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800">
          Connector Health ({connectors.length})
        </h3>
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
            {connectors.map((connector) => {
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
                  className="border-b border-gray-200 hover:bg-gray-50"
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
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
