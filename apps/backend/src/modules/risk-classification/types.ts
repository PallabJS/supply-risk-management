import type { EventPublisher } from "../../infrastructure/event-bus/types.js";
import type { ExternalSignal, Logger } from "../signal-ingestion/types.js";
import type { RiskEventType } from "./constants.js";

export interface StructuredRisk {
  classification_id: string;
  event_id: string;
  event_type: RiskEventType;
  severity_level: number;
  impact_region: string;
  expected_duration_hours: number;
  classification_confidence: number;
  model_version: string;
  processed_at_utc: string;
}

export interface StructuredRiskDraft {
  classification_id?: string;
  event_id?: string;
  event_type?: string;
  severity_level?: number;
  impact_region?: string;
  expected_duration_hours?: number;
  classification_confidence?: number;
  model_version?: string;
  processed_at_utc?: string;
  [key: string]: unknown;
}

export interface RiskClassifier {
  name: string;
  classify(signal: ExternalSignal): Promise<StructuredRiskDraft>;
}

export interface RiskClassificationDecision {
  structuredRisk: StructuredRisk;
  usedFallback: boolean;
  fallbackReason?: string;
}

export interface RiskClassificationServiceOptions {
  eventPublisher: EventPublisher;
  primaryClassifier?: RiskClassifier;
  fallbackClassifier?: RiskClassifier;
  outputStream?: string;
  confidenceThreshold?: number;
  modelVersion?: string;
  maxPublishAttempts?: number;
  retryDelayMs?: number;
  logger?: Logger;
}

export interface RiskClassificationSummary {
  received: number;
  published: number;
  used_fallback: number;
  failed: number;
}
