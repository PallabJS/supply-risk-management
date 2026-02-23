import type { EventPublisher } from "../../infrastructure/event-bus/types.js";
import type { StructuredRisk } from "../risk-classification/types.js";
import type { Logger } from "../signal-ingestion/types.js";
import type { RiskLevel } from "./constants.js";

export interface ClassifiedRiskInput extends StructuredRisk {
  factory_id?: string;
  supplier_id?: string;
  inventory_coverage_days?: number;
  operational_criticality?: number;
  estimated_daily_revenue?: number;
}

export interface RiskEvaluation {
  risk_id: string;
  classification_id: string;
  factory_id: string;
  supplier_id: string;
  inventory_coverage_days: number;
  operational_criticality: number;
  severity_weight: number;
  risk_score: number;
  risk_level: RiskLevel;
  estimated_revenue_exposure: number;
  evaluation_timestamp_utc: string;
}

export interface RiskEvaluationDraft {
  risk_id?: string;
  classification_id?: string;
  factory_id?: string;
  supplier_id?: string;
  inventory_coverage_days?: number;
  operational_criticality?: number;
  severity_weight?: number;
  risk_score?: number;
  risk_level?: string;
  estimated_revenue_exposure?: number;
  evaluation_timestamp_utc?: string;
  [key: string]: unknown;
}

export interface RiskEvaluator {
  name: string;
  evaluate(risk: ClassifiedRiskInput): Promise<RiskEvaluationDraft>;
}

export interface RiskEvaluationDecision {
  riskEvaluation: RiskEvaluation;
  evaluatorName: string;
}

export interface RiskEngineServiceOptions {
  eventPublisher: EventPublisher;
  evaluator?: RiskEvaluator;
  outputStream?: string;
  evaluationVersion?: string;
  dailyRevenueBaseline?: number;
  maxPublishAttempts?: number;
  retryDelayMs?: number;
  logger?: Logger;
}

export interface RiskEngineSummary {
  received: number;
  published: number;
  failed: number;
}
