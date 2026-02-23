import { hostname } from "node:os";

import { RedisStreamConsumerWorker } from "../../infrastructure/event-bus/redis-stream-consumer-worker.js";
import { EventStreams } from "../../infrastructure/event-bus/streams.js";
import type { EventBus } from "../../infrastructure/event-bus/types.js";
import type { AppRedisClient } from "../../infrastructure/redis/client.js";
import type { StructuredRisk } from "../risk-classification/types.js";
import type { Logger } from "../signal-ingestion/types.js";
import { RiskEngineService } from "./service.js";

export interface RiskEngineWorkerOptions {
  eventBus: EventBus;
  redis: AppRedisClient;
  riskEngineService: RiskEngineService;
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
  return `risk-engine-${hostname()}-${process.pid}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export class RiskEngineWorker {
  private readonly worker: RedisStreamConsumerWorker<StructuredRisk>;
  private readonly logger: Logger;

  constructor(options: RiskEngineWorkerOptions) {
    this.logger = options.logger ?? createNoopLogger();

    this.worker = new RedisStreamConsumerWorker<StructuredRisk>({
      consumer: options.eventBus,
      redis: options.redis,
      stream: options.inputStream ?? EventStreams.CLASSIFIED_EVENTS,
      group: options.consumerGroup,
      consumerName: options.consumerName ?? defaultConsumerName(),
      batchSize: options.batchSize,
      blockMs: options.blockMs,
      maxDeliveries: options.maxDeliveries,
      retryKeyTtlSeconds: options.retryKeyTtlSeconds,
      handler: async (classifiedRisk) => {
        try {
          const decision = await options.riskEngineService.evaluateAndPublish(classifiedRisk);
          this.logger.info("evaluated classified risk", {
            classification_id: classifiedRisk.classification_id,
            risk_id: decision.riskEvaluation.risk_id,
            risk_level: decision.riskEvaluation.risk_level,
            output_stream: EventStreams.RISK_EVALUATIONS
          });
        } catch (error) {
          this.logger.error("risk-engine handler failed", {
            classification_id: classifiedRisk.classification_id,
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
