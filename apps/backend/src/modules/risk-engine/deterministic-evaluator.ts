import { DEFAULT_RISK_LEVEL_THRESHOLDS, RiskLevels, type RiskLevel } from "./constants.js";
import { deterministicUuidFromSeed } from "./schema.js";
import type { ClassifiedRiskInput, RiskEvaluationDraft, RiskEvaluator } from "./types.js";
import { computeLaneRelevanceScore, resolveImpactedLanes } from "./lane-context.js";

export interface DeterministicRiskEvaluatorOptions {
  evaluationVersion?: string;
  dailyRevenueBaseline?: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeInventoryCoverageDays(risk: ClassifiedRiskInput): number {
  if (
    typeof risk.inventory_coverage_days === "number" &&
    Number.isFinite(risk.inventory_coverage_days)
  ) {
    return Math.max(0, Math.round(risk.inventory_coverage_days));
  }

  const durationDays = Math.max(1, Math.ceil(risk.expected_duration_hours / 24));
  const inferredCoverage = 32 - risk.severity_level * 4 - durationDays;
  return Math.max(1, Math.min(90, inferredCoverage));
}

function normalizeOperationalCriticality(risk: ClassifiedRiskInput): number {
  if (
    typeof risk.operational_criticality === "number" &&
    Number.isFinite(risk.operational_criticality)
  ) {
    return clamp(risk.operational_criticality, 0, 1);
  }

  const globalBoost = risk.impact_region === "GLOBAL" ? 0.2 : 0;
  const severityBoost = risk.severity_level >= 4 ? 0.15 : 0;
  const eventBoost =
    risk.event_type === "WEATHER" ||
    risk.event_type === "SUPPLY" ||
    risk.event_type === "LABOR"
      ? 0.1
      : 0;

  return clamp(0.45 + globalBoost + severityBoost + eventBoost, 0, 1);
}

function inferFactoryId(risk: ClassifiedRiskInput): string {
  if (typeof risk.factory_id === "string" && risk.factory_id.trim() !== "") {
    return risk.factory_id;
  }
  return deterministicUuidFromSeed(`factory:${risk.impact_region}`);
}

function inferSupplierId(risk: ClassifiedRiskInput): string {
  if (typeof risk.supplier_id === "string" && risk.supplier_id.trim() !== "") {
    return risk.supplier_id;
  }
  return deterministicUuidFromSeed(`supplier:${risk.event_type}:${risk.impact_region}`);
}

function resolveRiskLevel(score: number): RiskLevel {
  if (score >= DEFAULT_RISK_LEVEL_THRESHOLDS.critical) {
    return RiskLevels.CRITICAL;
  }
  if (score >= DEFAULT_RISK_LEVEL_THRESHOLDS.high) {
    return RiskLevels.HIGH;
  }
  if (score >= DEFAULT_RISK_LEVEL_THRESHOLDS.medium) {
    return RiskLevels.MEDIUM;
  }
  return RiskLevels.LOW;
}

function normalizeDailyRevenue(
  risk: ClassifiedRiskInput,
  dailyRevenueBaseline: number
): number {
  if (
    typeof risk.estimated_daily_revenue === "number" &&
    Number.isFinite(risk.estimated_daily_revenue) &&
    risk.estimated_daily_revenue > 0
  ) {
    return risk.estimated_daily_revenue;
  }
  return dailyRevenueBaseline;
}

export class DeterministicRiskEvaluator implements RiskEvaluator {
  readonly name: string;

  private readonly evaluationVersion: string;
  private readonly dailyRevenueBaseline: number;

  constructor(options: DeterministicRiskEvaluatorOptions = {}) {
    this.evaluationVersion =
      options.evaluationVersion?.trim() || "risk-engine-deterministic-v1";
    this.dailyRevenueBaseline =
      typeof options.dailyRevenueBaseline === "number" &&
      Number.isFinite(options.dailyRevenueBaseline) &&
      options.dailyRevenueBaseline > 0
        ? options.dailyRevenueBaseline
        : 250_000;
    this.name = this.evaluationVersion;
  }

  async evaluate(risk: ClassifiedRiskInput): Promise<RiskEvaluationDraft> {
    const severityWeight = clamp(risk.severity_level / 5, 0, 1);
    const durationFactor = clamp(risk.expected_duration_hours / (24 * 7), 0, 1);
    const inventoryCoverageDays = normalizeInventoryCoverageDays(risk);
    const inventoryPressure = clamp(1 - inventoryCoverageDays / 30, 0, 1);
    const operationalCriticality = normalizeOperationalCriticality(risk);
    const confidenceFactor = clamp(risk.classification_confidence, 0, 1);

    const riskScore = clamp(
      severityWeight * 0.35 +
        durationFactor * 0.2 +
        operationalCriticality * 0.2 +
        confidenceFactor * 0.15 +
        inventoryPressure * 0.1,
      0,
      1
    );

    const durationDays = Math.max(1, Math.ceil(risk.expected_duration_hours / 24));
    const dailyRevenue = normalizeDailyRevenue(risk, this.dailyRevenueBaseline);
    const impactedLanes = resolveImpactedLanes(risk.impact_region);
    const laneRelevanceScore = computeLaneRelevanceScore(risk.impact_region, impactedLanes);
    const estimatedRevenueExposure =
      dailyRevenue * durationDays * riskScore * operationalCriticality * (0.7 + laneRelevanceScore * 0.3);

    return {
      risk_id: deterministicUuidFromSeed(
        `${risk.classification_id}:${this.evaluationVersion}`
      ),
      classification_id: risk.classification_id,
      event_type: risk.event_type,
      impact_region: risk.impact_region,
      expected_duration_hours: risk.expected_duration_hours,
      classification_confidence: roundTo(confidenceFactor, 4),
      factory_id: inferFactoryId(risk),
      supplier_id: inferSupplierId(risk),
      inventory_coverage_days: inventoryCoverageDays,
      operational_criticality: roundTo(operationalCriticality, 4),
      severity_weight: roundTo(severityWeight, 4),
      risk_score: roundTo(riskScore, 4),
      risk_level: resolveRiskLevel(riskScore),
      impacted_lanes: impactedLanes,
      lane_relevance_score: roundTo(laneRelevanceScore, 4),
      estimated_revenue_exposure: roundTo(Math.max(0, estimatedRevenueExposure), 2),
      evaluation_timestamp_utc: new Date().toISOString()
    };
  }
}
