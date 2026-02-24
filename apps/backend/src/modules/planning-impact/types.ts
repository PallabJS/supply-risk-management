import type { EventPublisher } from "../../infrastructure/event-bus/types.js";
import type { Logger } from "../signal-ingestion/types.js";

export interface ShipmentPlan {
  shipment_id: string;
  po_number: string;
  sku: string;
  lane_id: string;
  warehouse_id: string;
  planned_eta_utc: string;
  unit_revenue_inr: number;
}

export interface InventorySnapshot {
  sku: string;
  warehouse_id: string;
  on_hand_units: number;
  in_transit_units: number;
  daily_demand_units: number;
  safety_stock_units: number;
}

export interface AtRiskShipment {
  risk_id: string;
  mitigation_id: string;
  shipment_id: string;
  po_number: string;
  sku: string;
  lane_id: string;
  warehouse_id: string;
  planned_eta_utc: string;
  risk_adjusted_eta_utc: string;
  delay_hours: number;
  stockout_date_utc: string;
  stockout_probability: number;
  revenue_at_risk_inr: number;
  required_action: string;
  action_description: string;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  generated_at_utc: string;
}

export interface InventoryExposure {
  risk_id: string;
  sku: string;
  warehouse_id: string;
  days_of_cover: number;
  stockout_probability: number;
  projected_stockout_date_utc: string;
  revenue_at_risk_inr: number;
  generated_at_utc: string;
}

export interface PlanningImpactServiceOptions {
  eventPublisher: EventPublisher;
  outputAtRiskStream?: string;
  outputInventoryExposureStream?: string;
  logger?: Logger;
}
