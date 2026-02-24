import { hostname } from "node:os";

import { RedisStreamConsumerWorker } from "../../infrastructure/event-bus/redis-stream-consumer-worker.js";
import { EventStreams } from "../../infrastructure/event-bus/streams.js";
import type { EventBus } from "../../infrastructure/event-bus/types.js";
import type { AppRedisClient } from "../../infrastructure/redis/client.js";
import type { RiskEvaluation } from "../risk-engine/types.js";
import type { Logger } from "../signal-ingestion/types.js";
import { MitigationPlanningService } from "./service.js";

export interface MitigationPlanningWorkerOptions {
  eventBus: EventBus;
  redis: AppRedisClient;
  mitigationPlanningService: MitigationPlanningService;
  inputStream?: string;
  consumerGroup: string;
  consumerName?: string;
  batchSize: number;
  blockMs: number;
  maxDeliveries: number;
  retryKeyTtlSeconds: number;
  logger?: Logger;
}

function createNoopLogger(): Logger {
  return {
    info() {},
    warn() {},
    error() {}
  };
}

function defaultConsumerName(): string {
  return `mitigation-planning-${hostname()}-${process.pid}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export class MitigationPlanningWorker {
  private readonly worker: RedisStreamConsumerWorker<RiskEvaluation>;
  private readonly logger: Logger;

  constructor(options: MitigationPlanningWorkerOptions) {
    this.logger = options.logger ?? createNoopLogger();

    this.worker = new RedisStreamConsumerWorker<RiskEvaluation>({
      consumer: options.eventBus,
      redis: options.redis,
      stream: options.inputStream ?? EventStreams.RISK_EVALUATIONS,
      group: options.consumerGroup,
      consumerName: options.consumerName ?? defaultConsumerName(),
      batchSize: options.batchSize,
      blockMs: options.blockMs,
      maxDeliveries: options.maxDeliveries,
      retryKeyTtlSeconds: options.retryKeyTtlSeconds,
      handler: async (riskEvaluation) => {
        try {
          const decision =
            await options.mitigationPlanningService.createAndPublish(riskEvaluation);
          this.logger.info("published mitigation plan", {
            risk_id: riskEvaluation.risk_id,
            mitigation_id: decision.mitigationPlan.mitigation_id,
            output_stream: EventStreams.MITIGATION_PLANS
          });
        } catch (error) {
          this.logger.error("mitigation-planning handler failed", {
            risk_id: riskEvaluation.risk_id,
            error: errorMessage(error)
          });
          throw error;
        }
      }
    });
  }

  async init(): Promise<void> {
    await this.worker.init();
  }

  async runOnce(): Promise<number> {
    return this.worker.runOnce();
  }

  async start(): Promise<void> {
    await this.worker.start();
  }

  stop(): void {
    this.worker.stop();
  }
}
