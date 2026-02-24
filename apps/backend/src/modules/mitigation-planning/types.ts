import type { EventPublisher } from "../../infrastructure/event-bus/types.js";
import type { RiskLevel } from "../risk-engine/constants.js";
import type { RiskEvaluation } from "../risk-engine/types.js";
import type { Logger } from "../signal-ingestion/types.js";

export interface MitigationAction {
  action_id: string;
  title: string;
  description: string;
  estimated_cost_inr: number;
  expected_delay_reduction_hours: number;
  priority: 1 | 2 | 3;
}

export interface MitigationPlan {
  mitigation_id: string;
  risk_id: string;
  classification_id: string;
  lane_id: string;
  risk_level: RiskLevel;
  predicted_delay_hours: number;
  mitigation_confidence: number;
  recommended_actions: MitigationAction[];
  created_at_utc: string;
}

export interface MitigationPlanner {
  name: string;
  createPlan(riskEvaluation: RiskEvaluation): Promise<MitigationPlan>;
}

export interface MitigationPlanningDecision {
  mitigationPlan: MitigationPlan;
  plannerName: string;
}

export interface MitigationPlanningServiceOptions {
  eventPublisher: EventPublisher;
  planner: MitigationPlanner;
  outputStream?: string;
  maxPublishAttempts?: number;
  retryDelayMs?: number;
  logger?: Logger;
}

export interface MitigationPlanningSummary {
  received: number;
  published: number;
  failed: number;
}
