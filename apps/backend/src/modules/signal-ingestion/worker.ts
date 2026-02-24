import { hostname } from "node:os";

import { RedisStreamConsumerWorker } from "../../infrastructure/event-bus/redis-stream-consumer-worker.js";
import { EventStreams } from "../../infrastructure/event-bus/streams.js";
import type { EventBus } from "../../infrastructure/event-bus/types.js";
import type { AppRedisClient } from "../../infrastructure/redis/client.js";
import type { RawExternalSignal } from "./types.js";
import { SignalIngestionService } from "./service.js";
import type { Logger } from "./types.js";

export interface SignalIngestionWorkerOptions {
  eventBus: EventBus;
  redis: AppRedisClient;
  ingestionService: SignalIngestionService;
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
  return `signal-ingestion-${hostname()}-${process.pid}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export class SignalIngestionWorker {
  private readonly worker: RedisStreamConsumerWorker<RawExternalSignal>;
  private readonly logger: Logger;

  constructor(options: SignalIngestionWorkerOptions) {
    this.logger = options.logger ?? createNoopLogger();

    this.worker = new RedisStreamConsumerWorker<RawExternalSignal>({
      consumer: options.eventBus,
      redis: options.redis,
      stream: options.inputStream ?? EventStreams.RAW_INPUT_SIGNALS,
      group: options.consumerGroup,
      consumerName: options.consumerName ?? defaultConsumerName(),
      batchSize: options.batchSize,
      blockMs: options.blockMs,
      maxDeliveries: options.maxDeliveries,
      retryKeyTtlSeconds: options.retryKeyTtlSeconds,
      handler: async (rawSignal) => {
        try {
          const summary = await options.ingestionService.ingestSignals([rawSignal]);
          if (summary.failed > 0 || summary.pending > 0) {
            throw new Error("signal ingestion did not complete successfully");
          }

          this.logger.info("ingested raw input signal", {
            queued: summary.queued,
            published: summary.published,
            skipped_deduplicated: summary.skipped_deduplicated
          });
        } catch (error) {
          this.logger.error("signal ingestion handler failed", {
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
