import { RiskEventTypes, type RiskEventType } from "./constants.js";
import type { RiskClassifier, StructuredRiskDraft } from "./types.js";
import type { ExternalSignal } from "../signal-ingestion/types.js";

interface SeverityOutcome {
  severity: number;
  durationHours: number;
  confidence: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasKeyword(text: string, keyword: string): boolean {
  const normalized = keyword.trim().toLowerCase();
  if (normalized === "") return false;

  // Preserve substring behavior for explicit phrases.
  if (normalized.includes(" ")) {
    return text.includes(normalized);
  }

  // Avoid false positives such as "war" in "warning".
  const pattern = new RegExp(`\\b${escapeRegExp(normalized)}\\b`, "i");
  return pattern.test(text);
}

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => hasKeyword(text, keyword));
}

function keywordHitCount(text: string, keywords: string[]): number {
  return keywords.reduce((count, keyword) => (hasKeyword(text, keyword) ? count + 1 : count), 0);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function toSignalText(signal: ExternalSignal): string {
  const raw = signal.raw_content ?? "";
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const title = typeof parsed.title === "string" ? parsed.title : "";
    const description = typeof parsed.description === "string" ? parsed.description : "";
    const note = typeof parsed.note === "string" ? parsed.note : "";
    return `${title} ${description} ${note}`.trim().toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function classifySeverity(signal: ExternalSignal, text: string): SeverityOutcome {
  const disruptionSignals = keywordHitCount(text, [
    "strike",
    "truckers",
    "lorry",
    "shutdown",
    "disruption",
    "disrupts",
    "delay",
    "congestion",
    "shortage",
    "outage",
    "blocked",
    "closure"
  ]);
  const confidenceModifier = Math.min(0.12, disruptionSignals * 0.02);

  const positiveSignal = includesAny(text, [
    "inks deal",
    "partnership",
    "expansion",
    "margin boost",
    "growth",
    "launch",
    "profit",
    "investment",
    "award",
    "pilot project"
  ]);

  if (positiveSignal) {
    return {
      severity: 1,
      durationHours: 6,
      confidence: clamp(0.42 + signal.signal_confidence * 0.18, 0.42, 0.7)
    };
  }

  if (
    includesAny(text, [
      "shutdown",
      "halted",
      "cyclone",
      "hurricane",
      "earthquake",
      "flood",
      "wildfire",
      "embargo",
      "sanction",
      "war"
    ])
  ) {
    return {
      severity: 5,
      durationHours: 120,
      confidence: clamp(0.78 + signal.signal_confidence * 0.2 + confidenceModifier, 0.78, 0.98)
    };
  }

  if (
    includesAny(text, [
      "strike",
      "labor disruption",
      "truckers",
      "lorry owners",
      "blocked",
      "major delay",
      "severe storm",
      "outage",
      "critical shortage",
      "port closure"
    ])
  ) {
    return {
      severity: 4,
      durationHours: 72,
      confidence: clamp(0.68 + signal.signal_confidence * 0.2 + confidenceModifier, 0.68, 0.93)
    };
  }

  if (
    includesAny(text, [
      "congestion",
      "delay",
      "delays",
      "delayed",
      "protest",
      "slowdown",
      "disrupt",
      "disruption",
      "disrupts",
      "moderate rain",
      "minor outage"
    ])
  ) {
    return {
      severity: 3,
      durationHours: 24,
      confidence: clamp(0.62 + signal.signal_confidence * 0.2 + confidenceModifier, 0.62, 0.9)
    };
  }

  return {
    severity: 2,
    durationHours: 12,
    confidence: clamp(0.54 + signal.signal_confidence * 0.18 + confidenceModifier, 0.54, 0.82)
  };
}

function classifyEventType(signal: ExternalSignal, text: string): RiskEventType {
  if (signal.source_type === "WEATHER") {
    return RiskEventTypes.WEATHER;
  }
  if (signal.source_type === "TRAFFIC") {
    return RiskEventTypes.TRAFFIC;
  }
  if (includesAny(text, ["strike", "union", "labor", "truckers"])) {
    return RiskEventTypes.LABOR;
  }
  if (includesAny(text, ["embargo", "sanction", "war", "geopolitical"])) {
    return RiskEventTypes.GEOPOLITICAL;
  }
  if (includesAny(text, ["shortage", "supplier default", "backorder", "dues", "ration supply"])) {
    return RiskEventTypes.SUPPLY;
  }
  if (includesAny(text, ["traffic", "road closure", "port congestion", "highway", "jam"])) {
    return RiskEventTypes.TRAFFIC;
  }
  if (includesAny(text, ["flood", "cyclone", "storm", "rainfall", "heat wave"])) {
    return RiskEventTypes.WEATHER;
  }

  switch (signal.source_type) {
    case "WEATHER":
      return RiskEventTypes.WEATHER;
    case "NEWS":
      return RiskEventTypes.NEWS;
    case "SOCIAL":
      return RiskEventTypes.SOCIAL;
    case "TRAFFIC":
      return RiskEventTypes.TRAFFIC;
    default:
      return RiskEventTypes.OTHER;
  }
}

export class RuleBasedRiskClassifier implements RiskClassifier {
  readonly name = "rule-based-classifier-v1";

  async classify(signal: ExternalSignal): Promise<StructuredRiskDraft> {
    const text = toSignalText(signal);
    const severityOutcome = classifySeverity(signal, text);

    return {
      event_id: signal.event_id,
      event_type: classifyEventType(signal, text),
      severity_level: severityOutcome.severity,
      impact_region: signal.geographic_scope,
      expected_duration_hours: severityOutcome.durationHours,
      classification_confidence: severityOutcome.confidence,
      model_version: this.name
    };
  }
}
