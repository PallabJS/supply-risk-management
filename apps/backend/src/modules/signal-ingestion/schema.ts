import { randomUUID } from "node:crypto";
import { VALID_SOURCE_TYPES } from "./constants.js";
import type { SourceType } from "./constants.js";
import type { ExternalSignal, RawExternalSignal } from "./types.js";

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    value.includes("T")
  );
}

function assertString(field: string, value: unknown): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid "${field}" in external signal schema`);
  }
}

function assertNumberInRange(
  field: string,
  value: unknown,
  min: number,
  max: number
): void {
  if (
    typeof value !== "number" ||
    Number.isNaN(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(`Invalid "${field}" in external signal schema`);
  }
}

function coerceString(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }
  return fallback;
}

export function assertExternalSignalSchema(signal: unknown): asserts signal is ExternalSignal {
  if (!signal || typeof signal !== "object") {
    throw new Error("Signal must be an object");
  }

  const typedSignal = signal as ExternalSignal;

  assertString("event_id", typedSignal.event_id);
  assertString("source_type", typedSignal.source_type);
  assertString("raw_content", typedSignal.raw_content);
  assertString("source_reference", typedSignal.source_reference);
  assertString("geographic_scope", typedSignal.geographic_scope);
  if (!isIsoTimestamp(typedSignal.timestamp_utc)) {
    throw new Error('Invalid "timestamp_utc" in external signal schema');
  }
  if (!isIsoTimestamp(typedSignal.ingestion_time_utc)) {
    throw new Error('Invalid "ingestion_time_utc" in external signal schema');
  }
  assertNumberInRange("signal_confidence", typedSignal.signal_confidence, 0, 1);

  if (!VALID_SOURCE_TYPES.has(typedSignal.source_type)) {
    throw new Error(
      `Invalid "source_type" value "${typedSignal.source_type}", expected one of ${[
        ...VALID_SOURCE_TYPES,
      ].join(", ")}`
    );
  }
}

function normalizeTimestamp(value: unknown, fallbackDate: Date): string {
  if (isIsoTimestamp(value)) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  return fallbackDate.toISOString();
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0.5;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

export function normalizeRawSignal(
  rawSignal: RawExternalSignal = {},
  now = new Date()
): ExternalSignal {
  const safeRawSignal = rawSignal ?? {};
  const sourceType =
    safeRawSignal.source_type ??
    safeRawSignal.sourceType ??
    safeRawSignal.type ??
    "NEWS";

  const normalized: ExternalSignal = {
    event_id: safeRawSignal.event_id ?? safeRawSignal.eventId ?? randomUUID(),
    source_type: String(sourceType).toUpperCase() as SourceType,
    raw_content: coerceString(
      safeRawSignal.raw_content ??
        safeRawSignal.rawContent ??
        safeRawSignal.content,
      JSON.stringify(safeRawSignal)
    ),
    source_reference: coerceString(
      safeRawSignal.source_reference ??
        safeRawSignal.sourceReference ??
        safeRawSignal.reference,
      "unknown"
    ),
    geographic_scope: coerceString(
      safeRawSignal.geographic_scope ??
        safeRawSignal.geographicScope ??
        safeRawSignal.region,
      "GLOBAL"
    ),
    timestamp_utc: normalizeTimestamp(
      safeRawSignal.timestamp_utc ??
        safeRawSignal.timestampUtc ??
        safeRawSignal.detected_at,
      now
    ),
    ingestion_time_utc: now.toISOString(),
    signal_confidence: normalizeConfidence(
      safeRawSignal.signal_confidence ??
        safeRawSignal.signalConfidence ??
        safeRawSignal.confidence
    )
  };

  assertExternalSignalSchema(normalized);
  return normalized;
}
