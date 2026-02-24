import { Fragment, useState } from "react";
import type {
  AtRiskShipment,
  ClassifiedEvent,
  InventoryExposure,
  MitigationPlan,
  RiskEvaluation,
  RiskNotification,
  Signal
} from "@/lib/redis";

interface OperationsRowDetails {
  signal?: Signal;
  classification?: ClassifiedEvent;
  risk?: RiskEvaluation;
  mitigation?: MitigationPlan;
  notification?: RiskNotification;
}

export interface OperationsRow {
  riskId: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  route: string;
  trigger: string;
  predictedDelayHours: number;
  stockoutDateUtc: string;
  daysOfCover: number | null;
  stockoutProbability: number;
  estimatedExposureInr: number;
  actionTitle: string;
  actionDescription: string;
  timestamp?: string;
  details: OperationsRowDetails;
}

function severityClass(severity: OperationsRow["severity"]): string {
  switch (severity) {
    case "CRITICAL":
      return "bg-red-100 text-red-800 border-red-200";
    case "HIGH":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "MEDIUM":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "LOW":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
  }
}

function severityAccentClass(severity: OperationsRow["severity"]): string {
  switch (severity) {
    case "CRITICAL":
      return "border-l-red-500";
    case "HIGH":
      return "border-l-orange-500";
    case "MEDIUM":
      return "border-l-yellow-500";
    case "LOW":
      return "border-l-emerald-500";
  }
}

function formatInr(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatUtc(iso?: string): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function routeLabel(laneId?: string, fallbackRegion?: string): string {
  if (laneId === "mumbai-bangalore") {
    return "Mumbai -> Bangalore";
  }
  if (laneId && laneId.trim() !== "" && laneId !== "general-india") {
    return laneId;
  }
  if (fallbackRegion && fallbackRegion.trim() !== "") {
    return fallbackRegion;
  }
  return "India corridor";
}

function minutesAgo(iso?: string): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  const diffMin = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const hours = Math.floor(diffMin / 60);
  return `${hours}h ${diffMin % 60}m ago`;
}

function toTimestamp(iso?: string): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function shortRiskId(value: string): string {
  return value.slice(0, 8);
}

function parseSignalRawContent(rawContent?: string): Record<string, unknown> {
  if (!rawContent) return {};
  try {
    const parsed = JSON.parse(rawContent) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function cleanDisplayText(value?: string): string | undefined {
  if (!value) return undefined;
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildOperationsRows(
  signals: Signal[],
  events: ClassifiedEvent[],
  risks: RiskEvaluation[],
  mitigations: MitigationPlan[],
  notifications: RiskNotification[],
  atRiskShipments: AtRiskShipment[],
  inventoryExposures: InventoryExposure[],
): OperationsRow[] {
  const signalByEventId = new Map<string, Signal>();
  for (const signal of signals) {
    if (!signalByEventId.has(signal.event_id)) {
      signalByEventId.set(signal.event_id, signal);
    }
  }

  const classificationById = new Map<string, ClassifiedEvent>();
  const classificationByEventId = new Map<string, ClassifiedEvent>();
  for (const event of events) {
    if (!classificationById.has(event.classification_id)) {
      classificationById.set(event.classification_id, event);
    }
    if (!classificationByEventId.has(event.event_id)) {
      classificationByEventId.set(event.event_id, event);
    }
  }

  const riskByRiskId = new Map<string, RiskEvaluation>();
  const riskByClassificationId = new Map<string, RiskEvaluation>();
  for (const risk of risks) {
    riskByRiskId.set(risk.risk_id, risk);
    if (risk.classification_id && !riskByClassificationId.has(risk.classification_id)) {
      riskByClassificationId.set(risk.classification_id, risk);
    }
  }

  const exposureByCompositeKey = new Map<string, InventoryExposure>();
  for (const exposure of inventoryExposures) {
    const key = `${exposure.risk_id}:${exposure.sku}:${exposure.warehouse_id}`;
    if (!exposureByCompositeKey.has(key)) {
      exposureByCompositeKey.set(key, exposure);
    }
  }

  if (atRiskShipments.length > 0) {
    return atRiskShipments
      .map((item) => {
        const risk = riskByRiskId.get(item.risk_id);
        const mitigation = mitigations.find((entry) => entry.risk_id === item.risk_id);
        const notification = notifications.find((entry) => entry.risk_id === item.risk_id);
        const classification = risk?.classification_id
          ? classificationById.get(risk.classification_id)
          : undefined;
        const signal = classification
          ? signalByEventId.get(classification.event_id)
          : undefined;
        const exposure = exposureByCompositeKey.get(
          `${item.risk_id}:${item.sku}:${item.warehouse_id}`
        );
        return {
          riskId: item.risk_id,
          severity: item.risk_level,
          route: routeLabel(item.lane_id),
          trigger: `Shipment ${item.shipment_id} ETA slipped by ${Math.round(item.delay_hours)}h`,
          predictedDelayHours: item.delay_hours,
          stockoutDateUtc: item.stockout_date_utc,
          daysOfCover: exposure?.days_of_cover ?? null,
          stockoutProbability:
            exposure?.stockout_probability ?? item.stockout_probability,
          estimatedExposureInr: Math.max(
            item.revenue_at_risk_inr,
            exposure?.revenue_at_risk_inr ?? 0
          ),
          actionTitle: item.required_action,
          actionDescription: item.action_description,
          timestamp: item.timestamp,
          details: {
            signal,
            classification,
            risk,
            mitigation,
            notification,
          }
        };
      })
      .sort((a, b) => toTimestamp(b.timestamp) - toTimestamp(a.timestamp));
  }

  const mitigationByRiskId = new Map<string, MitigationPlan>();
  for (const mitigation of mitigations) {
    if (!mitigationByRiskId.has(mitigation.risk_id)) {
      mitigationByRiskId.set(mitigation.risk_id, mitigation);
    }
  }

  const notificationByRiskId = new Map<string, RiskNotification>();
  for (const notification of notifications) {
    if (notification.status !== "OPEN") continue;
    if (!notificationByRiskId.has(notification.risk_id)) {
      notificationByRiskId.set(notification.risk_id, notification);
    }
  }

  const rows: OperationsRow[] = [];
  for (const risk of risks) {
    if (risk.risk_level === "LOW") continue;

    const mitigation = mitigationByRiskId.get(risk.risk_id);
    if (!mitigation) continue;

    const notification = notificationByRiskId.get(risk.risk_id);
    const topAction = mitigation.recommended_actions[0];
    if (!topAction) continue;

    rows.push({
      riskId: risk.risk_id,
      severity: risk.risk_level,
      route: routeLabel(mitigation.lane_id, risk.impact_region),
      trigger: notification?.message || notification?.title || "Operational disruption detected",
      predictedDelayHours: mitigation.predicted_delay_hours,
      stockoutDateUtc: "",
      daysOfCover:
        risk.inventory_coverage_days != null &&
        Number.isFinite(risk.inventory_coverage_days)
          ? risk.inventory_coverage_days
          : null,
      stockoutProbability: risk.risk_score,
      estimatedExposureInr: risk.estimated_revenue_exposure,
      actionTitle: topAction.title,
      actionDescription: `${topAction.description} (can reduce ~${topAction.expected_delay_reduction_hours}h, est. cost ${formatInr(topAction.estimated_cost_inr)})`,
      timestamp: notification?.timestamp || mitigation.timestamp || risk.timestamp,
      details: {
        signal: risk.classification_id
          ? signalByEventId.get(
              classificationById.get(risk.classification_id)?.event_id || ""
            )
          : undefined,
        classification: risk.classification_id
          ? classificationById.get(risk.classification_id)
          : undefined,
        risk,
        mitigation,
        notification,
      },
    });
  }

  return rows.sort((a, b) => toTimestamp(b.timestamp) - toTimestamp(a.timestamp));
}

interface OperationsRiskTableProps {
  rows: OperationsRow[];
}

export function OperationsRiskTable({ rows }: OperationsRiskTableProps) {
  const [expandedRiskId, setExpandedRiskId] = useState<string | null>(null);

  const toggleRow = (riskId: string): void => {
    setExpandedRiskId((current) => (current === riskId ? null : riskId));
  };

  return (
    <div className="bg-white border border-gray-200/70 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200/70 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">Risk Action Board</h3>
        <span className="text-xs text-gray-500">{rows.length} actionable rows</span>
      </div>
      <div className="overflow-x-hidden">
        <table className="w-full table-fixed">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase w-[8%]">Severity</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase w-[14%]">Route</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase w-[26%]">Risk Trigger</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase w-[22%]">Impact</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase w-[21%]">Best Action</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase w-[9%]">Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-6 py-10 text-sm text-gray-500" colSpan={6}>
                  No actionable risks yet. Once disruptions are detected, this board will show route-level actions.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isExpanded = expandedRiskId === row.riskId;
                const raw = parseSignalRawContent(row.details.signal?.raw_content);
                const rawTitle = cleanDisplayText(typeof raw.title === "string" ? raw.title : undefined);
                const rawDescription = cleanDisplayText(
                  typeof raw.description === "string" ? raw.description : undefined
                );
                const rawSource = typeof raw.source === "string" ? raw.source : undefined;
                const rawLink = typeof raw.link === "string" ? raw.link : undefined;

                return (
                  <Fragment key={row.riskId}>
                    <tr
                      className={`border-b border-gray-200/70 transition-all align-top cursor-pointer ${
                        isExpanded
                          ? "bg-slate-100/80 ring-1 ring-inset ring-slate-300 shadow-[inset_0_-1px_0_rgba(148,163,184,0.25)]"
                          : "hover:bg-gray-50"
                      }`}
                      onClick={() => toggleRow(row.riskId)}
                      aria-expanded={isExpanded}
                    >
                      <td className="px-3 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${severityClass(row.severity)}`}>
                          {row.severity}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm font-medium text-gray-900 whitespace-normal break-words">{row.route}</td>
                      <td className="px-3 py-3 text-sm text-gray-700 whitespace-normal break-words">
                        {row.trigger}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-900 whitespace-normal break-words">
                        <div className="font-semibold">{row.predictedDelayHours}h</div>
                        <div className="text-xs text-gray-600 mt-1">
                          Stockout: {formatUtc(row.stockoutDateUtc)}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {row.daysOfCover != null
                            ? `${row.daysOfCover.toFixed(1)} days cover`
                            : "Days cover unavailable"}
                        </div>
                        <div className="text-xs mt-1 font-medium text-orange-700">
                          {(row.stockoutProbability * 100).toFixed(0)}% stockout probability
                        </div>
                        {formatInr(row.estimatedExposureInr)}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-900 whitespace-normal break-words">
                        <div className="font-medium">{row.actionTitle}</div>
                        <div className="text-xs text-gray-600 mt-1">{row.actionDescription}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                        <div>{minutesAgo(row.timestamp)}</div>
                        <div className={`text-[10px] mt-1 font-semibold ${isExpanded ? "text-slate-700" : "text-blue-700"}`}>
                          {isExpanded ? "▲ Details open" : "▼ View details"}
                        </div>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="border-b border-gray-200/70 bg-gradient-to-r from-slate-100 via-white to-blue-50/50">
                        <td className="px-4 py-4" colSpan={6}>
                          <div className={`rounded-2xl border border-slate-200 border-l-4 ${severityAccentClass(row.severity)} bg-white/90 p-4`}>
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                              <span className={`px-2 py-1 rounded-full text-[10px] font-semibold border ${severityClass(row.severity)}`}>
                                {row.severity}
                              </span>
                              <span className="text-xs font-semibold text-slate-800">
                                Details for {row.route}
                              </span>
                              <span className="text-xs text-slate-500">
                                Risk #{shortRiskId(row.riskId)}
                              </span>
                            </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                              <h4 className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">Root Signal</h4>
                              <div className="text-sm font-semibold text-slate-900">
                                {rawTitle || "Source title unavailable"}
                              </div>
                              <div className="text-sm text-slate-700 mt-2 whitespace-normal break-words">
                                {rawDescription || "Source description unavailable"}
                              </div>
                              <div className="text-xs text-slate-600 mt-3">
                                Source Type: {row.details.signal?.source_type || "—"} | Scope: {row.details.signal?.geographic_scope || "—"}
                              </div>
                              <div className="text-xs text-slate-600 mt-1">
                                Signal Confidence: {row.details.signal ? `${Math.round(row.details.signal.signal_confidence * 100)}%` : "—"}
                              </div>
                              {rawSource ? <div className="text-xs text-slate-600 mt-1">Publisher: {rawSource}</div> : null}
                              {rawLink ? (
                                <a
                                  href={rawLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-block mt-2 text-xs font-medium text-blue-700 hover:text-blue-800 underline"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  Open source article
                                </a>
                              ) : null}
                            </div>
                            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                              <h4 className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">Risk Analysis</h4>
                              <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                                <div className="text-slate-500">Event Type</div>
                                <div className="font-medium text-slate-900">{row.details.classification?.event_type || "—"}</div>
                                <div className="text-slate-500">Severity</div>
                                <div className="font-medium text-slate-900">{row.details.classification?.severity_level || row.severity}</div>
                                <div className="text-slate-500">Expected Duration</div>
                                <div className="font-medium text-slate-900">{row.details.risk?.expected_duration_hours ?? row.predictedDelayHours}h</div>
                                <div className="text-slate-500">Risk Score</div>
                                <div className="font-medium text-slate-900">
                                  {row.details.risk ? `${(row.details.risk.risk_score * 100).toFixed(1)}%` : `${(row.stockoutProbability * 100).toFixed(1)}%`}
                                </div>
                                <div className="text-slate-500">Lane Relevance</div>
                                <div className="font-medium text-slate-900">
                                  {row.details.risk?.lane_relevance_score != null
                                    ? `${Math.round(row.details.risk.lane_relevance_score * 100)}%`
                                    : "—"}
                                </div>
                                <div className="text-slate-500">Exposure</div>
                                <div className="font-medium text-rose-700">{formatInr(row.estimatedExposureInr)}</div>
                              </div>
                              <div className="mt-3 text-xs text-slate-600">
                                Classification ID: {row.details.classification?.classification_id || "—"}
                              </div>
                              <div className="mt-1 text-xs text-slate-600">
                                Risk ID: {row.details.risk?.risk_id || row.riskId}
                              </div>
                            </div>
                            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:col-span-2">
                              <h4 className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">Mitigation Plan</h4>
                              <div className="text-sm text-slate-900 font-medium">{row.actionTitle}</div>
                              <div className="text-sm text-slate-700 mt-1">{row.actionDescription}</div>
                              {row.details.mitigation?.recommended_actions?.length ? (
                                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                                  {row.details.mitigation.recommended_actions.map((action) => (
                                    <div key={action.action_id} className="rounded-lg border border-gray-200 bg-slate-50 p-3">
                                      <div className="text-sm font-semibold text-slate-900">{action.title}</div>
                                      <div className="text-xs text-slate-600 mt-1">{action.description}</div>
                                      <div className="text-xs text-slate-700 mt-2">
                                        Cost {formatInr(action.estimated_cost_inr)} | Save {action.expected_delay_reduction_hours}h
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                              {row.details.notification?.message ? (
                                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                  <span className="font-semibold">Alert reason:</span> {row.details.notification.message}
                                </div>
                              ) : null}
                            </div>
                          </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
