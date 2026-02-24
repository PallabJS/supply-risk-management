import { hostname } from "node:os";

import { RedisStreamConsumerWorker } from "../../infrastructure/event-bus/redis-stream-consumer-worker.js";
import { EventStreams } from "../../infrastructure/event-bus/streams.js";
import type { EventBus } from "../../infrastructure/event-bus/types.js";
import type { AppRedisClient } from "../../infrastructure/redis/client.js";
import type { MitigationPlan } from "../mitigation-planning/types.js";
import type { Logger } from "../signal-ingestion/types.js";
import { PlanningImpactService } from "./service.js";

export interface PlanningImpactWorkerOptions {
  eventBus: EventBus;
  redis: AppRedisClient;
  planningImpactService: PlanningImpactService;
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
  return `planning-impact-${hostname()}-${process.pid}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export class PlanningImpactWorker {
  private readonly worker: RedisStreamConsumerWorker<MitigationPlan>;
  private readonly logger: Logger;

  constructor(options: PlanningImpactWorkerOptions) {
    this.logger = options.logger ?? createNoopLogger();

    this.worker = new RedisStreamConsumerWorker<MitigationPlan>({
      consumer: options.eventBus,
      redis: options.redis,
      stream: options.inputStream ?? EventStreams.MITIGATION_PLANS,
      group: options.consumerGroup,
      consumerName: options.consumerName ?? defaultConsumerName(),
      batchSize: options.batchSize,
      blockMs: options.blockMs,
      maxDeliveries: options.maxDeliveries,
      retryKeyTtlSeconds: options.retryKeyTtlSeconds,
      handler: async (mitigationPlan) => {
        try {
          const count =
            await options.planningImpactService.evaluateMitigation(mitigationPlan);
          this.logger.info("published planning impact records", {
            risk_id: mitigationPlan.risk_id,
            records: count
          });
        } catch (error) {
          this.logger.error("planning-impact handler failed", {
            risk_id: mitigationPlan.risk_id,
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

  async start(): Promise<void> {
    await this.worker.start();
  }

  stop(): void {
    this.worker.stop();
  }
}
