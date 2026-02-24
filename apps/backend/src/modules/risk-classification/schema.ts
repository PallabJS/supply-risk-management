import { randomUUID } from "node:crypto";
import type { ExternalSignal } from "../signal-ingestion/types.js";
import { RiskEventTypes, VALID_RISK_EVENT_TYPES, type RiskEventType } from "./constants.js";
import type { StructuredRisk, StructuredRiskDraft } from "./types.js";

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    value.includes("T")
  );
}

function assertString(field: string, value: unknown): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid "${field}" in structured risk schema`);
  }
}

function assertIntegerRange(field: string, value: unknown, min: number, max: number): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Invalid "${field}" in structured risk schema`);
  }
}

function assertNumberRange(field: string, value: unknown, min: number, max: number): void {
  if (typeof value !== "number" || Number.isNaN(value) || value < min || value > max) {
    throw new Error(`Invalid "${field}" in structured risk schema`);
  }
}

function normalizeRiskEventType(value: unknown, signal: ExternalSignal): RiskEventType {
  const source = typeof value === "string" ? value.toUpperCase() : signal.source_type;
  if (VALID_RISK_EVENT_TYPES.has(source as RiskEventType)) {
    return source as RiskEventType;
  }
  return RiskEventTypes.OTHER;
}

function normalizeSeverityLevel(value: unknown, signal: ExternalSignal): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(5, Math.max(1, Math.round(value)));
  }

  switch (signal.source_type) {
    case "WEATHER":
      return 4;
    case "TRAFFIC":
      return 3;
    case "NEWS":
      return 3;
    case "SOCIAL":
      return 2;
    default:
      return 2;
  }
}

function normalizeDuration(value: unknown, severityLevel: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  return severityLevel * 24;
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0.7;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

export function assertStructuredRiskSchema(value: unknown): asserts value is StructuredRisk {
  if (!value || typeof value !== "object") {
    throw new Error("Structured risk payload must be an object");
  }

  const risk = value as StructuredRisk;
  assertString("classification_id", risk.classification_id);
  assertString("event_id", risk.event_id);
  assertString("event_type", risk.event_type);
  if (!VALID_RISK_EVENT_TYPES.has(risk.event_type)) {
    throw new Error(`Invalid "event_type" in structured risk schema: ${risk.event_type}`);
  }
  assertIntegerRange("severity_level", risk.severity_level, 1, 5);
  assertString("impact_region", risk.impact_region);
  if (!Number.isInteger(risk.expected_duration_hours) || risk.expected_duration_hours < 0) {
    throw new Error('Invalid "expected_duration_hours" in structured risk schema');
  }
  assertNumberRange("classification_confidence", risk.classification_confidence, 0, 1);
  assertString("model_version", risk.model_version);
  if (!isIsoTimestamp(risk.processed_at_utc)) {
    throw new Error('Invalid "processed_at_utc" in structured risk schema');
  }
}

export interface NormalizeStructuredRiskOptions {
  defaultModelVersion: string;
}

export function normalizeStructuredRisk(
  draft: StructuredRiskDraft,
  signal: ExternalSignal,
  options: NormalizeStructuredRiskOptions
): StructuredRisk {
  const safeDraft = draft ?? {};
  const severityLevel = normalizeSeverityLevel(safeDraft.severity_level, signal);

  const normalized: StructuredRisk = {
    classification_id:
      typeof safeDraft.classification_id === "string" && safeDraft.classification_id.trim() !== ""
        ? safeDraft.classification_id
        : randomUUID(),
    event_id:
      typeof safeDraft.event_id === "string" && safeDraft.event_id.trim() !== ""
        ? safeDraft.event_id
        : signal.event_id,
    event_type: normalizeRiskEventType(safeDraft.event_type, signal),
    severity_level: severityLevel,
    impact_region:
      typeof safeDraft.impact_region === "string" && safeDraft.impact_region.trim() !== ""
        ? safeDraft.impact_region
        : signal.geographic_scope,
    expected_duration_hours: normalizeDuration(safeDraft.expected_duration_hours, severityLevel),
    classification_confidence: normalizeConfidence(safeDraft.classification_confidence),
    model_version:
      typeof safeDraft.model_version === "string" && safeDraft.model_version.trim() !== ""
        ? safeDraft.model_version
        : options.defaultModelVersion,
    processed_at_utc: isIsoTimestamp(safeDraft.processed_at_utc)
      ? safeDraft.processed_at_utc
      : new Date().toISOString()
  };

  assertStructuredRiskSchema(normalized);
  return normalized;
}
