import { EventStreams } from "../../infrastructure/event-bus/streams.js";
import { withRetry } from "../signal-ingestion/retry.js";
import type { Logger } from "../signal-ingestion/types.js";
import type {
  MitigationPlanningDecision,
  MitigationPlanningServiceOptions,
  MitigationPlanningSummary
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

export class MitigationPlanningService {
  private readonly eventPublisher: MitigationPlanningServiceOptions["eventPublisher"];
  private readonly planner: MitigationPlanningServiceOptions["planner"];
  private readonly outputStream: string;
  private readonly maxPublishAttempts: number;
  private readonly retryDelayMs: number;
  private readonly logger: Logger;

  constructor({
    eventPublisher,
    planner,
    outputStream = EventStreams.MITIGATION_PLANS,
    maxPublishAttempts = 4,
    retryDelayMs = 50,
    logger = createNoopLogger()
  }: MitigationPlanningServiceOptions) {
    this.eventPublisher = eventPublisher;
    this.planner = planner;
    this.outputStream = outputStream;
    this.maxPublishAttempts = maxPublishAttempts;
    this.retryDelayMs = retryDelayMs;
    this.logger = logger;
  }

  async createMitigationPlan(
    riskEvaluation: Parameters<typeof this.planner.createPlan>[0]
  ): Promise<MitigationPlanningDecision> {
    const mitigationPlan = await this.planner.createPlan(riskEvaluation);
    return {
      mitigationPlan,
      plannerName: this.planner.name
    };
  }

  async createAndPublish(
    riskEvaluation: Parameters<typeof this.planner.createPlan>[0]
  ): Promise<MitigationPlanningDecision> {
    const decision = await this.createMitigationPlan(riskEvaluation);

    await withRetry(
      async () => {
        await this.eventPublisher.publish(this.outputStream, decision.mitigationPlan);
      },
      {
        attempts: this.maxPublishAttempts,
        baseDelayMs: this.retryDelayMs,
        onRetry: ({ attempt, attempts, delayMs, error }) => {
          this.logger.warn("mitigation-plan publish failed, retrying", {
            risk_id: riskEvaluation.risk_id,
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

  async createAndPublishBatch(
    riskEvaluations: Array<Parameters<typeof this.planner.createPlan>[0]>
  ): Promise<MitigationPlanningSummary> {
    const summary: MitigationPlanningSummary = {
      received: 0,
      published: 0,
      failed: 0
    };

    for (const riskEvaluation of riskEvaluations) {
      summary.received += 1;
      try {
        await this.createAndPublish(riskEvaluation);
        summary.published += 1;
      } catch (error) {
        summary.failed += 1;
        this.logger.error("mitigation planning failed", {
          risk_id: riskEvaluation.risk_id,
          error: errorMessage(error)
        });
      }
    }

    return summary;
  }
}
