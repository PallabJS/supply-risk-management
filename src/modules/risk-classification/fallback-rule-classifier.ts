import { RiskEventTypes, type RiskEventType } from "./constants.js";
import type { RiskClassifier, StructuredRiskDraft } from "./types.js";
import type { ExternalSignal } from "../signal-ingestion/types.js";

interface SeverityOutcome {
  severity: number;
  durationHours: number;
  confidence: number;
}

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function classifySeverity(rawContentLower: string): SeverityOutcome {
  if (
    includesAny(rawContentLower, [
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
    return { severity: 5, durationHours: 120, confidence: 0.86 };
  }

  if (
    includesAny(rawContentLower, [
      "strike",
      "labor disruption",
      "major delay",
      "severe storm",
      "outage",
      "critical shortage",
      "port closure"
    ])
  ) {
    return { severity: 4, durationHours: 72, confidence: 0.78 };
  }

  if (
    includesAny(rawContentLower, [
      "congestion",
      "delay",
      "protest",
      "slowdown",
      "moderate rain",
      "minor outage"
    ])
  ) {
    return { severity: 3, durationHours: 24, confidence: 0.7 };
  }

  return { severity: 2, durationHours: 12, confidence: 0.66 };
}

function classifyEventType(signal: ExternalSignal, rawContentLower: string): RiskEventType {
  if (includesAny(rawContentLower, ["strike", "union", "labor"])) {
    return RiskEventTypes.LABOR;
  }
  if (includesAny(rawContentLower, ["embargo", "sanction", "war", "geopolitical"])) {
    return RiskEventTypes.GEOPOLITICAL;
  }
  if (includesAny(rawContentLower, ["shortage", "supplier default", "backorder"])) {
    return RiskEventTypes.SUPPLY;
  }
  if (includesAny(rawContentLower, ["traffic", "road closure", "port congestion"])) {
    return RiskEventTypes.TRAFFIC;
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
    const content = signal.raw_content.toLowerCase();
    const severityOutcome = classifySeverity(content);

    return {
      event_id: signal.event_id,
      event_type: classifyEventType(signal, content),
      severity_level: severityOutcome.severity,
      impact_region: signal.geographic_scope,
      expected_duration_hours: severityOutcome.durationHours,
      classification_confidence: severityOutcome.confidence,
      model_version: this.name
    };
  }
}
