import { EventStreams } from "../../infrastructure/event-bus/streams.js";
import type { MitigationPlan } from "../mitigation-planning/types.js";
import type { Logger } from "../signal-ingestion/types.js";
import { PlanningStateStore } from "./state-store.js";
import type {
  AtRiskShipment,
  InventoryExposure,
  PlanningImpactServiceOptions
} from "./types.js";

function createNoopLogger(): Logger {
  return {
    info() {},
    warn() {},
    error() {}
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export class PlanningImpactService {
  private readonly eventPublisher: PlanningImpactServiceOptions["eventPublisher"];
  private readonly outputAtRiskStream: string;
  private readonly outputInventoryExposureStream: string;
  private readonly logger: Logger;

  constructor(
    private readonly planningStateStore: PlanningStateStore,
    options: PlanningImpactServiceOptions
  ) {
    this.eventPublisher = options.eventPublisher;
    this.outputAtRiskStream = options.outputAtRiskStream ?? EventStreams.AT_RISK_SHIPMENTS;
    this.outputInventoryExposureStream =
      options.outputInventoryExposureStream ?? EventStreams.INVENTORY_EXPOSURES;
    this.logger = options.logger ?? createNoopLogger();
  }

  async evaluateMitigation(mitigationPlan: MitigationPlan): Promise<number> {
    const shipments = await this.planningStateStore.getShipmentsByLane(mitigationPlan.lane_id);
    if (shipments.length === 0) {
      this.logger.info("no shipments mapped to lane", { lane_id: mitigationPlan.lane_id });
      return 0;
    }

    let published = 0;
    for (const shipment of shipments) {
      const inventory = await this.planningStateStore.getInventory(
        shipment.sku,
        shipment.warehouse_id
      );
      if (!inventory) {
        continue;
      }

      const dailyDemand = Math.max(1, inventory.daily_demand_units);
      const currentUnits = inventory.on_hand_units + inventory.in_transit_units;
      const daysOfCover = currentUnits / dailyDemand;
      const stockoutDate = new Date(Date.now() + daysOfCover * 24 * 60 * 60 * 1000);
      const delayDays = mitigationPlan.predicted_delay_hours / 24;
      const safetyDays = inventory.safety_stock_units / dailyDemand;
      const effectiveGapDays = Math.max(0, delayDays - (daysOfCover - safetyDays));
      const stockoutProbability = clamp(effectiveGapDays / Math.max(1, delayDays), 0, 1);
      const revenueAtRisk =
        effectiveGapDays * dailyDemand * Math.max(1, shipment.unit_revenue_inr);

      const riskAdjustedEta = new Date(
        Date.parse(shipment.planned_eta_utc) + mitigationPlan.predicted_delay_hours * 60 * 60 * 1000
      );

      const action = mitigationPlan.recommended_actions[0];
      if (!action) {
        continue;
      }

      const atRiskRecord: AtRiskShipment = {
        risk_id: mitigationPlan.risk_id,
        mitigation_id: mitigationPlan.mitigation_id,
        shipment_id: shipment.shipment_id,
        po_number: shipment.po_number,
        sku: shipment.sku,
        lane_id: shipment.lane_id,
        warehouse_id: shipment.warehouse_id,
        planned_eta_utc: shipment.planned_eta_utc,
        risk_adjusted_eta_utc: riskAdjustedEta.toISOString(),
        delay_hours: mitigationPlan.predicted_delay_hours,
        stockout_date_utc: stockoutDate.toISOString(),
        stockout_probability: Number(stockoutProbability.toFixed(4)),
        revenue_at_risk_inr: Number(revenueAtRisk.toFixed(2)),
        required_action: action.title,
        action_description: action.description,
        risk_level: mitigationPlan.risk_level,
        generated_at_utc: new Date().toISOString()
      };

      const inventoryExposure: InventoryExposure = {
        risk_id: mitigationPlan.risk_id,
        sku: shipment.sku,
        warehouse_id: shipment.warehouse_id,
        days_of_cover: Number(daysOfCover.toFixed(2)),
        stockout_probability: Number(stockoutProbability.toFixed(4)),
        projected_stockout_date_utc: stockoutDate.toISOString(),
        revenue_at_risk_inr: Number(revenueAtRisk.toFixed(2)),
        generated_at_utc: new Date().toISOString()
      };

      await Promise.all([
        this.eventPublisher.publish(this.outputAtRiskStream, atRiskRecord),
        this.eventPublisher.publish(this.outputInventoryExposureStream, inventoryExposure)
      ]);
      published += 1;
    }

    return published;
  }
}
