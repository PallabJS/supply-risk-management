import { EventStreams } from "../../infrastructure/event-bus/streams.js";
import { withRetry } from "../signal-ingestion/retry.js";
import { DeterministicRiskEvaluator } from "./deterministic-evaluator.js";
import { normalizeRiskEvaluation } from "./schema.js";
import type { Logger } from "../signal-ingestion/types.js";
import type {
  ClassifiedRiskInput,
  RiskEngineServiceOptions,
  RiskEvaluationDecision,
  RiskEngineSummary,
  RiskEvaluator
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

export class RiskEngineService {
  private readonly eventPublisher: RiskEngineServiceOptions["eventPublisher"];
  private readonly evaluator: RiskEvaluator;
  private readonly outputStream: string;
  private readonly evaluationVersion: string;
  private readonly dailyRevenueBaseline: number;
  private readonly maxPublishAttempts: number;
  private readonly retryDelayMs: number;
  private readonly logger: Logger;

  constructor({
    eventPublisher,
    evaluator,
    outputStream = EventStreams.RISK_EVALUATIONS,
    evaluationVersion = "risk-engine-v1",
    dailyRevenueBaseline = 250_000,
    maxPublishAttempts = 4,
    retryDelayMs = 50,
    logger = createNoopLogger()
  }: RiskEngineServiceOptions) {
    if (!eventPublisher || typeof eventPublisher.publish !== "function") {
      throw new Error("RiskEngineService requires an eventPublisher.publish method");
    }

    this.eventPublisher = eventPublisher;
    this.evaluationVersion = evaluationVersion;
    this.dailyRevenueBaseline = dailyRevenueBaseline;
    this.evaluator =
      evaluator ??
      new DeterministicRiskEvaluator({
        evaluationVersion,
        dailyRevenueBaseline
      });
    this.outputStream = outputStream;
    this.maxPublishAttempts = maxPublishAttempts;
    this.retryDelayMs = retryDelayMs;
    this.logger = logger;
  }

  async evaluateRisk(classifiedRisk: ClassifiedRiskInput): Promise<RiskEvaluationDecision> {
    const draft = await this.evaluator.evaluate(classifiedRisk);
    const riskEvaluation = normalizeRiskEvaluation(draft, classifiedRisk, {
      evaluationVersion: this.evaluationVersion,
      dailyRevenueBaseline: this.dailyRevenueBaseline
    });

    return {
      riskEvaluation,
      evaluatorName: this.evaluator.name
    };
  }

  async evaluateAndPublish(
    classifiedRisk: ClassifiedRiskInput
  ): Promise<RiskEvaluationDecision> {
    const decision = await this.evaluateRisk(classifiedRisk);

    await withRetry(
      async () => {
        await this.eventPublisher.publish(this.outputStream, decision.riskEvaluation);
      },
      {
        attempts: this.maxPublishAttempts,
        baseDelayMs: this.retryDelayMs,
        onRetry: ({ attempt, attempts, delayMs, error }) => {
          this.logger.warn("risk-evaluation publish failed, retrying", {
            classification_id: classifiedRisk.classification_id,
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

  async evaluateAndPublishBatch(
    risks: ClassifiedRiskInput[]
  ): Promise<RiskEngineSummary> {
    const summary: RiskEngineSummary = {
      received: 0,
      published: 0,
      failed: 0
    };

    for (const risk of risks) {
      summary.received += 1;
      try {
        await this.evaluateAndPublish(risk);
        summary.published += 1;
      } catch (error) {
        summary.failed += 1;
        this.logger.error("risk evaluation failed", {
          classification_id: risk.classification_id,
          error: errorMessage(error)
        });
      }
    }

    return summary;
  }
}
