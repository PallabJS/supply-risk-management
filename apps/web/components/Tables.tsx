import type {
  AtRiskShipment,
  InventoryExposure,
  MitigationPlan,
  RiskEvaluation,
  RiskNotification
} from "@/lib/redis";

export interface OperationsRow {
  riskId: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  route: string;
  poNumber: string;
  sku: string;
  warehouseId: string;
  trigger: string;
  predictedDelayHours: number;
  stockoutDateUtc: string;
  daysOfCover: number | null;
  stockoutProbability: number;
  estimatedExposureInr: number;
  actionTitle: string;
  actionDescription: string;
  timestamp?: string;
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

export function buildOperationsRows(
  risks: RiskEvaluation[],
  mitigations: MitigationPlan[],
  notifications: RiskNotification[],
  atRiskShipments: AtRiskShipment[],
  inventoryExposures: InventoryExposure[],
): OperationsRow[] {
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
        const exposure = exposureByCompositeKey.get(
          `${item.risk_id}:${item.sku}:${item.warehouse_id}`
        );
        return {
          riskId: item.risk_id,
          severity: item.risk_level,
          route: routeLabel(item.lane_id),
          poNumber: item.po_number,
          sku: item.sku,
          warehouseId: item.warehouse_id,
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
          timestamp: item.timestamp
        };
      })
      .sort((a, b) => b.stockoutProbability - a.stockoutProbability);
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
      poNumber: "—",
      sku: "—",
      warehouseId: "—",
      trigger: notification?.message || notification?.title || "Operational disruption detected",
      predictedDelayHours: mitigation.predicted_delay_hours,
      stockoutDateUtc: "",
      daysOfCover: null,
      stockoutProbability: risk.risk_score,
      estimatedExposureInr: risk.estimated_revenue_exposure,
      actionTitle: topAction.title,
      actionDescription: `${topAction.description} (can reduce ~${topAction.expected_delay_reduction_hours}h, est. cost ${formatInr(topAction.estimated_cost_inr)})`,
      timestamp: notification?.timestamp || mitigation.timestamp || risk.timestamp,
    });
  }

  return rows.sort((a, b) => {
    const severityRank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    const rankDiff = severityRank[b.severity] - severityRank[a.severity];
    if (rankDiff !== 0) return rankDiff;
    return b.stockoutProbability - a.stockoutProbability;
  });
}

interface OperationsRiskTableProps {
  rows: OperationsRow[];
}

export function OperationsRiskTable({ rows }: OperationsRiskTableProps) {
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
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase w-[16%]">PO / SKU / WH</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase w-[11%]">Route</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase w-[20%]">Risk Trigger</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase w-[14%]">Impact</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase w-[22%]">Best Action</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase w-[9%]">Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-6 py-10 text-sm text-gray-500" colSpan={7}>
                  No actionable risks yet. Once disruptions are detected, this board will show route-level actions.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.riskId} className="border-b border-gray-200/70 hover:bg-gray-50 transition-colors align-top">
                  <td className="px-3 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${severityClass(row.severity)}`}>
                      {row.severity}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-sm text-gray-900 whitespace-normal break-words">
                    <div className="font-medium">{row.poNumber}</div>
                    <div className="text-xs text-gray-600">{row.sku}</div>
                    <div className="text-xs text-gray-500">{row.warehouseId}</div>
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
                  <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">{minutesAgo(row.timestamp)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
