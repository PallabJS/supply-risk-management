import { createHash } from "node:crypto";

import {
  DEFAULT_RISK_LEVEL_THRESHOLDS,
  VALID_RISK_LEVELS,
  type RiskLevel
} from "./constants.js";
import type { ClassifiedRiskInput, RiskEvaluation, RiskEvaluationDraft } from "./types.js";
import {
  RiskEventTypes,
  VALID_RISK_EVENT_TYPES,
  type RiskEventType
} from "../risk-classification/constants.js";
import { computeLaneRelevanceScore, resolveImpactedLanes } from "./lane-context.js";

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    value.includes("T")
  );
}

function assertString(field: string, value: unknown): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid "${field}" in risk evaluation schema`);
  }
}

function assertIntegerRange(field: string, value: unknown, min: number, max: number): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Invalid "${field}" in risk evaluation schema`);
  }
}

function assertNumberRange(field: string, value: unknown, min: number, max: number): void {
  if (typeof value !== "number" || Number.isNaN(value) || value < min || value > max) {
    throw new Error(`Invalid "${field}" in risk evaluation schema`);
  }
}

function assertPositiveNumber(field: string, value: unknown): void {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    throw new Error(`Invalid "${field}" in risk evaluation schema`);
  }
}

function assertStringArray(field: string, value: unknown): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Invalid "${field}" in risk evaluation schema`);
  }
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

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function deterministicUuidFromSeed(seed: string): string {
  const hash = createHash("sha1").update(seed).digest();
  const bytes = Uint8Array.from(hash.subarray(0, 16));
  const byte6 = bytes[6] ?? 0;
  const byte8 = bytes[8] ?? 0;

  bytes[6] = (byte6 & 0x0f) | 0x50;
  bytes[8] = (byte8 & 0x3f) | 0x80;

  const hex = toHex(bytes);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32)
  ].join("-");
}

function normalizeInventoryCoverageDays(
  value: unknown,
  classifiedRisk: ClassifiedRiskInput
): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  const durationDays = Math.max(1, Math.ceil(classifiedRisk.expected_duration_hours / 24));
  const inferredCoverage = 32 - classifiedRisk.severity_level * 4 - durationDays;
  return Math.max(1, Math.min(90, inferredCoverage));
}

function normalizeOperationalCriticality(
  value: unknown,
  classifiedRisk: ClassifiedRiskInput
): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clamp(value, 0, 1);
  }

  const regionBoost = classifiedRisk.impact_region === "GLOBAL" ? 0.2 : 0;
  const severityBoost = classifiedRisk.severity_level >= 4 ? 0.15 : 0;
  return clamp(0.5 + regionBoost + severityBoost, 0, 1);
}

function resolveRiskLevel(score: number): RiskLevel {
  if (score >= DEFAULT_RISK_LEVEL_THRESHOLDS.critical) {
    return "CRITICAL";
  }
  if (score >= DEFAULT_RISK_LEVEL_THRESHOLDS.high) {
    return "HIGH";
  }
  if (score >= DEFAULT_RISK_LEVEL_THRESHOLDS.medium) {
    return "MEDIUM";
  }
  return "LOW";
}

function normalizeSeverityWeight(value: unknown, classifiedRisk: ClassifiedRiskInput): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clamp(value, 0, 1);
  }
  return clamp(classifiedRisk.severity_level / 5, 0, 1);
}

function normalizeRiskScore(
  value: unknown,
  classifiedRisk: ClassifiedRiskInput,
  operationalCriticality: number,
  inventoryCoverageDays: number,
  severityWeight: number
): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clamp(value, 0, 1);
  }

  const durationFactor = clamp(classifiedRisk.expected_duration_hours / (24 * 7), 0, 1);
  const inventoryPressure = clamp(1 - inventoryCoverageDays / 30, 0, 1);

  const score =
    severityWeight * 0.35 +
    durationFactor * 0.2 +
    operationalCriticality * 0.2 +
    classifiedRisk.classification_confidence * 0.15 +
    inventoryPressure * 0.1;

  return clamp(score, 0, 1);
}

function normalizeEstimatedRevenueExposure(
  value: unknown,
  riskScore: number,
  operationalCriticality: number,
  classifiedRisk: ClassifiedRiskInput,
  dailyRevenueBaseline: number
): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return roundTo(value, 2);
  }

  const durationDays = Math.max(1, Math.ceil(classifiedRisk.expected_duration_hours / 24));
  const dailyRevenue =
    typeof classifiedRisk.estimated_daily_revenue === "number" &&
    Number.isFinite(classifiedRisk.estimated_daily_revenue) &&
    classifiedRisk.estimated_daily_revenue > 0
      ? classifiedRisk.estimated_daily_revenue
      : dailyRevenueBaseline;

  return roundTo(dailyRevenue * durationDays * riskScore * operationalCriticality, 2);
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function normalizeRiskEventType(value: unknown, classifiedRisk: ClassifiedRiskInput): RiskEventType {
  const candidate = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (VALID_RISK_EVENT_TYPES.has(candidate as RiskEventType)) {
    return candidate as RiskEventType;
  }
  if (VALID_RISK_EVENT_TYPES.has(classifiedRisk.event_type)) {
    return classifiedRisk.event_type;
  }
  return RiskEventTypes.OTHER;
}

function normalizeExpectedDurationHours(value: unknown, classifiedRisk: ClassifiedRiskInput): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  return Math.max(0, Math.round(classifiedRisk.expected_duration_hours));
}

function normalizeClassificationConfidence(value: unknown, classifiedRisk: ClassifiedRiskInput): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clamp(value, 0, 1);
  }
  return clamp(classifiedRisk.classification_confidence, 0, 1);
}

export function assertRiskEvaluationSchema(value: unknown): asserts value is RiskEvaluation {
  if (!value || typeof value !== "object") {
    throw new Error("Risk evaluation payload must be an object");
  }

  const risk = value as RiskEvaluation;
  assertString("risk_id", risk.risk_id);
  assertString("classification_id", risk.classification_id);
  assertString("event_type", risk.event_type);
  if (!VALID_RISK_EVENT_TYPES.has(risk.event_type)) {
    throw new Error(`Invalid "event_type" in risk evaluation schema: ${risk.event_type}`);
  }
  assertString("impact_region", risk.impact_region);
  assertIntegerRange("expected_duration_hours", risk.expected_duration_hours, 0, 7200);
  assertNumberRange("classification_confidence", risk.classification_confidence, 0, 1);
  assertString("factory_id", risk.factory_id);
  assertString("supplier_id", risk.supplier_id);
  assertIntegerRange("inventory_coverage_days", risk.inventory_coverage_days, 0, 3650);
  assertNumberRange("operational_criticality", risk.operational_criticality, 0, 1);
  assertNumberRange("severity_weight", risk.severity_weight, 0, 1);
  assertNumberRange("risk_score", risk.risk_score, 0, 1);
  assertString("risk_level", risk.risk_level);
  if (!VALID_RISK_LEVELS.has(risk.risk_level)) {
    throw new Error(`Invalid "risk_level" in risk evaluation schema: ${risk.risk_level}`);
  }
  assertStringArray("impacted_lanes", risk.impacted_lanes);
  assertNumberRange("lane_relevance_score", risk.lane_relevance_score, 0, 1);
  assertPositiveNumber("estimated_revenue_exposure", risk.estimated_revenue_exposure);
  if (!isIsoTimestamp(risk.evaluation_timestamp_utc)) {
    throw new Error('Invalid "evaluation_timestamp_utc" in risk evaluation schema');
  }
}

export interface NormalizeRiskEvaluationOptions {
  evaluationVersion: string;
  dailyRevenueBaseline: number;
}

export function normalizeRiskEvaluation(
  draft: RiskEvaluationDraft,
  classifiedRisk: ClassifiedRiskInput,
  options: NormalizeRiskEvaluationOptions
): RiskEvaluation {
  const safeDraft = draft ?? {};

  const classificationId =
    optionalString(safeDraft.classification_id) ?? classifiedRisk.classification_id;
  const inventoryCoverageDays = normalizeInventoryCoverageDays(
    safeDraft.inventory_coverage_days,
    classifiedRisk
  );
  const operationalCriticality = normalizeOperationalCriticality(
    safeDraft.operational_criticality,
    classifiedRisk
  );
  const severityWeight = normalizeSeverityWeight(safeDraft.severity_weight, classifiedRisk);
  const riskScore = normalizeRiskScore(
    safeDraft.risk_score,
    classifiedRisk,
    operationalCriticality,
    inventoryCoverageDays,
    severityWeight
  );
  const riskLevel =
    typeof safeDraft.risk_level === "string" &&
    VALID_RISK_LEVELS.has(safeDraft.risk_level as RiskLevel)
      ? (safeDraft.risk_level as RiskLevel)
      : resolveRiskLevel(riskScore);

  const normalized: RiskEvaluation = {
    risk_id:
      optionalString(safeDraft.risk_id) ??
      deterministicUuidFromSeed(`${classificationId}:${options.evaluationVersion}`),
    classification_id: classificationId,
    event_type: normalizeRiskEventType(safeDraft.event_type, classifiedRisk),
    impact_region:
      optionalString(safeDraft.impact_region) ?? classifiedRisk.impact_region,
    expected_duration_hours: normalizeExpectedDurationHours(
      safeDraft.expected_duration_hours,
      classifiedRisk
    ),
    classification_confidence: roundTo(
      normalizeClassificationConfidence(safeDraft.classification_confidence, classifiedRisk),
      4
    ),
    factory_id:
      optionalString(safeDraft.factory_id) ??
      optionalString(classifiedRisk.factory_id) ??
      deterministicUuidFromSeed(`factory:${classifiedRisk.impact_region}`),
    supplier_id:
      optionalString(safeDraft.supplier_id) ??
      optionalString(classifiedRisk.supplier_id) ??
      deterministicUuidFromSeed(
        `supplier:${classifiedRisk.event_type}:${classifiedRisk.impact_region}`
      ),
    inventory_coverage_days: inventoryCoverageDays,
    operational_criticality: roundTo(operationalCriticality, 4),
    severity_weight: roundTo(severityWeight, 4),
    risk_score: roundTo(riskScore, 4),
    risk_level: riskLevel,
    impacted_lanes: Array.isArray(safeDraft.impacted_lanes)
      ? safeDraft.impacted_lanes.filter(
          (value): value is string => typeof value === "string" && value.trim() !== ""
        )
      : resolveImpactedLanes(classifiedRisk.impact_region),
    lane_relevance_score: roundTo(
      typeof safeDraft.lane_relevance_score === "number" &&
        Number.isFinite(safeDraft.lane_relevance_score)
        ? clamp(safeDraft.lane_relevance_score, 0, 1)
        : computeLaneRelevanceScore(
            optionalString(safeDraft.impact_region) ?? classifiedRisk.impact_region,
            Array.isArray(safeDraft.impacted_lanes)
              ? safeDraft.impacted_lanes.filter(
                  (value): value is string =>
                    typeof value === "string" && value.trim() !== ""
                )
              : resolveImpactedLanes(classifiedRisk.impact_region)
          ),
      4
    ),
    estimated_revenue_exposure: normalizeEstimatedRevenueExposure(
      safeDraft.estimated_revenue_exposure,
      riskScore,
      operationalCriticality,
      classifiedRisk,
      options.dailyRevenueBaseline
    ),
    evaluation_timestamp_utc: isIsoTimestamp(safeDraft.evaluation_timestamp_utc)
      ? safeDraft.evaluation_timestamp_utc
      : new Date().toISOString()
  };

  assertRiskEvaluationSchema(normalized);
  return normalized;
}
