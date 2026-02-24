import { EventStreams } from "../../infrastructure/event-bus/streams.js";
import { deterministicUuidFromSeed } from "../risk-engine/schema.js";
import { withRetry } from "../signal-ingestion/retry.js";
import type { Logger } from "../signal-ingestion/types.js";
import type {
  MitigationNotificationInput,
  NotificationDecision,
  NotificationServiceOptions,
  NotificationSummary,
  RiskNotification
} from "./types.js";

function createNoopLogger(): Logger {
  return {
    info() {},
    warn() {},
    error() {}
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function channelsForRiskLevel(level: RiskNotification["risk_level"]): string[] {
  if (level === "CRITICAL") {
    return ["DASHBOARD", "EMAIL", "SLACK"];
  }
  if (level === "HIGH") {
    return ["DASHBOARD", "SLACK"];
  }
  return ["DASHBOARD"];
}

export class NotificationService {
  private readonly eventPublisher: NotificationServiceOptions["eventPublisher"];
  private readonly outputStream: string;
  private readonly minRiskScore: number;
  private readonly minLaneRelevanceScore: number;
  private readonly maxPublishAttempts: number;
  private readonly retryDelayMs: number;
  private readonly logger: Logger;

  constructor({
    eventPublisher,
    policy,
    outputStream = EventStreams.NOTIFICATIONS,
    maxPublishAttempts = 4,
    retryDelayMs = 50,
    logger = createNoopLogger()
  }: NotificationServiceOptions) {
    this.eventPublisher = eventPublisher;
    this.outputStream = outputStream;
    this.minRiskScore = policy?.minRiskScore ?? 0.65;
    this.minLaneRelevanceScore = policy?.minLaneRelevanceScore ?? 0.6;
    this.maxPublishAttempts = maxPublishAttempts;
    this.retryDelayMs = retryDelayMs;
    this.logger = logger;
  }

  buildDecision(input: MitigationNotificationInput): NotificationDecision {
    const riskScore = typeof input.risk_score === "number" ? input.risk_score : 0;
    const laneRelevanceScore =
      typeof input.lane_relevance_score === "number" ? input.lane_relevance_score : 0;
    const isHighPriorityLevel = input.risk_level === "HIGH" || input.risk_level === "CRITICAL";

    const shouldNotify =
      isHighPriorityLevel ||
      riskScore >= this.minRiskScore ||
      laneRelevanceScore >= this.minLaneRelevanceScore;

    if (!shouldNotify) {
      return { shouldNotify: false };
    }

    const topAction = input.recommended_actions[0];
    const title = `${input.risk_level} risk on ${input.lane_id}`;
    const message = topAction
      ? `Predicted delay ${input.predicted_delay_hours}h. Recommended: ${topAction.title}.`
      : `Predicted delay ${input.predicted_delay_hours}h. Mitigation plan generated.`;

    return {
      shouldNotify: true,
      notification: {
        notification_id: deterministicUuidFromSeed(`notification:${input.mitigation_id}`),
        risk_id: input.risk_id,
        mitigation_id: input.mitigation_id,
        lane_id: input.lane_id,
        risk_level: input.risk_level,
        title,
        message,
        channels: channelsForRiskLevel(input.risk_level),
        requires_ack: input.risk_level === "HIGH" || input.risk_level === "CRITICAL",
        status: "OPEN",
        created_at_utc: new Date().toISOString()
      }
    };
  }

  async notify(input: MitigationNotificationInput): Promise<NotificationDecision> {
    const decision = this.buildDecision(input);
    if (!decision.shouldNotify || !decision.notification) {
      return decision;
    }

    await withRetry(
      async () => {
        await this.eventPublisher.publish(this.outputStream, decision.notification);
      },
      {
        attempts: this.maxPublishAttempts,
        baseDelayMs: this.retryDelayMs,
        onRetry: ({ attempt, attempts, delayMs, error }) => {
          this.logger.warn("notification publish failed, retrying", {
            mitigation_id: input.mitigation_id,
            attempt,
            attempts,
            delayMs,
            error: errorMessage(error)
          });
        }
      }
    );

    return decision;
  }

  async notifyBatch(inputs: MitigationNotificationInput[]): Promise<NotificationSummary> {
    const summary: NotificationSummary = {
      received: 0,
      published: 0,
      skipped: 0,
      failed: 0
    };

    for (const input of inputs) {
      summary.received += 1;
      try {
        const decision = await this.notify(input);
        if (decision.shouldNotify) {
          summary.published += 1;
        } else {
          summary.skipped += 1;
        }
      } catch (error) {
        summary.failed += 1;
        this.logger.error("notification generation failed", {
          mitigation_id: input.mitigation_id,
          error: errorMessage(error)
        });
      }
    }

    return summary;
  }
}
