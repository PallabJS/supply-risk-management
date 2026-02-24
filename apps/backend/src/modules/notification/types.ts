import type { EventPublisher } from "../../infrastructure/event-bus/types.js";
import type { MitigationPlan } from "../mitigation-planning/types.js";
import type { RiskLevel } from "../risk-engine/constants.js";
import type { Logger } from "../signal-ingestion/types.js";

export interface RiskNotification {
  notification_id: string;
  risk_id: string;
  mitigation_id: string;
  lane_id: string;
  risk_level: RiskLevel;
  title: string;
  message: string;
  channels: string[];
  requires_ack: boolean;
  status: "OPEN" | "ACKNOWLEDGED";
  created_at_utc: string;
}

export interface NotificationPolicy {
  minRiskScore: number;
  minLaneRelevanceScore: number;
}

export interface NotificationDecision {
  shouldNotify: boolean;
  notification?: RiskNotification;
}

export interface NotificationServiceOptions {
  eventPublisher: EventPublisher;
  policy?: NotificationPolicy;
  outputStream?: string;
  maxPublishAttempts?: number;
  retryDelayMs?: number;
  logger?: Logger;
}

export interface NotificationSummary {
  received: number;
  published: number;
  skipped: number;
  failed: number;
}

export interface MitigationNotificationInput extends MitigationPlan {
  risk_score?: number;
  lane_relevance_score?: number;
}
