import { hostname } from "node:os";

import { RedisStreamConsumerWorker } from "../../infrastructure/event-bus/redis-stream-consumer-worker.js";
import { EventStreams } from "../../infrastructure/event-bus/streams.js";
import type { EventBus } from "../../infrastructure/event-bus/types.js";
import type { AppRedisClient } from "../../infrastructure/redis/client.js";
import type { MitigationPlan } from "../mitigation-planning/types.js";
import type { Logger } from "../signal-ingestion/types.js";
import { NotificationService } from "./service.js";

export interface NotificationWorkerOptions {
  eventBus: EventBus;
  redis: AppRedisClient;
  notificationService: NotificationService;
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
  return `notification-${hostname()}-${process.pid}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export class NotificationWorker {
  private readonly worker: RedisStreamConsumerWorker<MitigationPlan>;
  private readonly logger: Logger;

  constructor(options: NotificationWorkerOptions) {
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
          const decision = await options.notificationService.notify(mitigationPlan);
          if (decision.shouldNotify && decision.notification) {
            this.logger.info("published notification", {
              notification_id: decision.notification.notification_id,
              risk_id: mitigationPlan.risk_id,
              output_stream: EventStreams.NOTIFICATIONS
            });
          }
        } catch (error) {
          this.logger.error("notification handler failed", {
            mitigation_id: mitigationPlan.mitigation_id,
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
