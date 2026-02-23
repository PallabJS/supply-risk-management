import { hostname } from "node:os";

import { RedisStreamConsumerWorker } from "../../infrastructure/event-bus/redis-stream-consumer-worker.js";
import { EventStreams } from "../../infrastructure/event-bus/streams.js";
import type { EventBus } from "../../infrastructure/event-bus/types.js";
import type { AppRedisClient } from "../../infrastructure/redis/client.js";
import type { ExternalSignal, Logger } from "../signal-ingestion/types.js";
import { RiskClassificationService } from "./service.js";

export interface RiskClassificationWorkerOptions {
  eventBus: EventBus;
  redis: AppRedisClient;
  classificationService: RiskClassificationService;
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
  return `risk-classification-${hostname()}-${process.pid}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export class RiskClassificationWorker {
  private readonly worker: RedisStreamConsumerWorker<ExternalSignal>;
  private readonly logger: Logger;

  constructor(options: RiskClassificationWorkerOptions) {
    this.logger = options.logger ?? createNoopLogger();

    this.worker = new RedisStreamConsumerWorker<ExternalSignal>({
      consumer: options.eventBus,
      redis: options.redis,
      stream: options.inputStream ?? EventStreams.EXTERNAL_SIGNALS,
      group: options.consumerGroup,
      consumerName: options.consumerName ?? defaultConsumerName(),
      batchSize: options.batchSize,
      blockMs: options.blockMs,
      maxDeliveries: options.maxDeliveries,
      retryKeyTtlSeconds: options.retryKeyTtlSeconds,
      handler: async (signal) => {
        try {
          const decision = await options.classificationService.classifyAndPublish(signal);
          this.logger.info("classified signal", {
            event_id: signal.event_id,
            used_fallback: decision.usedFallback,
            output_stream: EventStreams.CLASSIFIED_EVENTS
          });
        } catch (error) {
          this.logger.error("classification handler failed", {
            event_id: signal.event_id,
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
