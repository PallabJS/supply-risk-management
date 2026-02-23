import { EventStreams } from "../../infrastructure/event-bus/streams.js";
import { withRetry } from "../signal-ingestion/retry.js";
import { RuleBasedRiskClassifier } from "./fallback-rule-classifier.js";
import { normalizeStructuredRisk } from "./schema.js";
import type { ExternalSignal, Logger } from "../signal-ingestion/types.js";
import type {
  RiskClassificationDecision,
  RiskClassificationServiceOptions,
  RiskClassificationSummary,
  RiskClassifier
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

function normalizeConfidenceThreshold(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0.65;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

export class RiskClassificationService {
  private readonly eventPublisher: RiskClassificationServiceOptions["eventPublisher"];
  private readonly primaryClassifier: RiskClassifier | undefined;
  private readonly fallbackClassifier: RiskClassifier;
  private readonly outputStream: string;
  private readonly confidenceThreshold: number;
  private readonly modelVersion: string;
  private readonly maxPublishAttempts: number;
  private readonly retryDelayMs: number;
  private readonly logger: Logger;

  constructor({
    eventPublisher,
    primaryClassifier,
    fallbackClassifier = new RuleBasedRiskClassifier(),
    outputStream = EventStreams.CLASSIFIED_EVENTS,
    confidenceThreshold = 0.65,
    modelVersion = "risk-classification-v1",
    maxPublishAttempts = 4,
    retryDelayMs = 50,
    logger = createNoopLogger()
  }: RiskClassificationServiceOptions) {
    if (!eventPublisher || typeof eventPublisher.publish !== "function") {
      throw new Error("RiskClassificationService requires an eventPublisher.publish method");
    }

    this.eventPublisher = eventPublisher;
    this.primaryClassifier = primaryClassifier;
    this.fallbackClassifier = fallbackClassifier;
    this.outputStream = outputStream;
    this.confidenceThreshold = normalizeConfidenceThreshold(confidenceThreshold);
    this.modelVersion = modelVersion;
    this.maxPublishAttempts = maxPublishAttempts;
    this.retryDelayMs = retryDelayMs;
    this.logger = logger;
  }

  private async runClassifier(
    classifier: RiskClassifier,
    signal: ExternalSignal
  ): Promise<RiskClassificationDecision> {
    const draft = await classifier.classify(signal);
    const structuredRisk = normalizeStructuredRisk(draft, signal, {
      defaultModelVersion: classifier.name || this.modelVersion
    });

    return {
      structuredRisk,
      usedFallback: classifier === this.fallbackClassifier
    };
  }

  async classifySignal(signal: ExternalSignal): Promise<RiskClassificationDecision> {
    if (this.primaryClassifier) {
      try {
        const primaryDecision = await this.runClassifier(this.primaryClassifier, signal);
        if (
          primaryDecision.structuredRisk.classification_confidence >= this.confidenceThreshold
        ) {
          return primaryDecision;
        }

        this.logger.warn("primary classifier confidence below threshold, using fallback", {
          event_id: signal.event_id,
          confidence: primaryDecision.structuredRisk.classification_confidence,
          threshold: this.confidenceThreshold
        });
      } catch (error) {
        this.logger.warn("primary classifier failed, using fallback", {
          event_id: signal.event_id,
          error: errorMessage(error)
        });
      }
    }

    const fallbackDecision = await this.runClassifier(this.fallbackClassifier, signal);
    return {
      ...fallbackDecision,
      usedFallback: true,
      fallbackReason: this.primaryClassifier
        ? "PRIMARY_FAILED_OR_LOW_CONFIDENCE"
        : "PRIMARY_NOT_CONFIGURED"
    };
  }

  async classifyAndPublish(signal: ExternalSignal): Promise<RiskClassificationDecision> {
    const decision = await this.classifySignal(signal);
    await withRetry(
      async () => {
        await this.eventPublisher.publish(this.outputStream, decision.structuredRisk);
      },
      {
        attempts: this.maxPublishAttempts,
        baseDelayMs: this.retryDelayMs,
        onRetry: ({ attempt, attempts, delayMs, error }) => {
          this.logger.warn("classified-event publish failed, retrying", {
            event_id: signal.event_id,
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

  async classifyAndPublishBatch(signals: ExternalSignal[]): Promise<RiskClassificationSummary> {
    const summary: RiskClassificationSummary = {
      received: 0,
      published: 0,
      used_fallback: 0,
      failed: 0
    };

    for (const signal of signals) {
      summary.received += 1;
      try {
        const decision = await this.classifyAndPublish(signal);
        summary.published += 1;
        if (decision.usedFallback) {
          summary.used_fallback += 1;
        }
      } catch (error) {
        summary.failed += 1;
        this.logger.error("risk classification failed", {
          event_id: signal.event_id,
          error: errorMessage(error)
        });
      }
    }

    return summary;
  }
}
