import type { StructuredRiskDraft } from "./types.js";

type DraftField =
  | "classification_id"
  | "event_id"
  | "event_type"
  | "severity_level"
  | "impact_region"
  | "expected_duration_hours"
  | "classification_confidence"
  | "model_version"
  | "processed_at_utc";

const FIELD_ALIASES: Record<DraftField, readonly string[]> = {
  classification_id: ["classification_id", "classificationId"],
  event_id: ["event_id", "eventId"],
  event_type: [
    "event_type",
    "eventType",
    "risk_event_type",
    "riskEventType",
    "risk_type",
    "riskType"
  ],
  severity_level: ["severity_level", "severityLevel", "risk_level", "riskLevel", "severity"],
  impact_region: ["impact_region", "impactRegion", "geographic_scope", "region"],
  expected_duration_hours: [
    "expected_duration_hours",
    "expectedDurationHours",
    "duration_hours",
    "durationHours",
    "expected_duration"
  ],
  classification_confidence: [
    "classification_confidence",
    "classificationConfidence",
    "confidence",
    "probability"
  ],
  model_version: ["model_version", "modelVersion", "model_name", "modelName", "model"],
  processed_at_utc: [
    "processed_at_utc",
    "processedAtUtc",
    "processed_at",
    "timestamp_utc",
    "timestampUtc"
  ]
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function findFieldValue(
  payload: Record<string, unknown>,
  aliases: readonly string[]
): unknown {
  const queue: Array<{ item: Record<string, unknown>; depth: number }> = [
    { item: payload, depth: 0 }
  ];
  const visited = new Set<Record<string, unknown>>([payload]);

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) {
      break;
    }

    for (const alias of aliases) {
      if (Object.prototype.hasOwnProperty.call(next.item, alias)) {
        return next.item[alias];
      }
    }

    if (next.depth >= 2) {
      continue;
    }

    for (const value of Object.values(next.item)) {
      if (!isObjectRecord(value) || visited.has(value)) {
        continue;
      }
      visited.add(value);
      queue.push({ item: value, depth: next.depth + 1 });
    }
  }

  return undefined;
}

function normalizeEventType(value: unknown): string | undefined {
  const text = asNonEmptyString(value);
  if (!text) {
    return undefined;
  }

  return text.toUpperCase().replaceAll("-", "_").replace(/\s+/g, "_");
}

function normalizeConfidence(value: unknown): number | undefined {
  const numeric = asFiniteNumber(value);
  if (numeric == null) {
    return undefined;
  }

  if (numeric > 1 && numeric <= 100) {
    return Math.max(0, Math.min(1, numeric / 100));
  }

  return Math.max(0, Math.min(1, numeric));
}

function normalizeFieldValue(field: DraftField, value: unknown): unknown {
  switch (field) {
    case "classification_id":
    case "event_id":
    case "impact_region":
    case "model_version":
    case "processed_at_utc":
      return asNonEmptyString(value);
    case "event_type":
      return normalizeEventType(value);
    case "severity_level": {
      const numeric = asFiniteNumber(value);
      return numeric == null ? undefined : Math.round(numeric);
    }
    case "expected_duration_hours": {
      const numeric = asFiniteNumber(value);
      return numeric == null ? undefined : Math.round(numeric);
    }
    case "classification_confidence":
      return normalizeConfidence(value);
    default:
      return undefined;
  }
}

function hasClassificationSignal(draft: StructuredRiskDraft): boolean {
  return (
    typeof draft.event_type === "string" ||
    typeof draft.severity_level === "number" ||
    typeof draft.impact_region === "string" ||
    typeof draft.expected_duration_hours === "number" ||
    typeof draft.classification_confidence === "number"
  );
}

export function extractStructuredRiskDraft(payload: unknown): StructuredRiskDraft {
  if (!isObjectRecord(payload)) {
    throw new Error("Structured risk payload must be an object");
  }

  const draft: StructuredRiskDraft = {};
  const fields = Object.keys(FIELD_ALIASES) as DraftField[];
  for (const field of fields) {
    const rawValue = findFieldValue(payload, FIELD_ALIASES[field]);
    const normalized = normalizeFieldValue(field, rawValue);
    if (normalized !== undefined) {
      draft[field] = normalized as never;
    }
  }

  if (!hasClassificationSignal(draft)) {
    throw new Error("Structured risk payload does not include classification fields");
  }

  return draft;
}
