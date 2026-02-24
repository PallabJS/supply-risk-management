import { loadConfig } from "../config/env.js";
import { RedisIdempotencyStore } from "../infrastructure/event-bus/redis-idempotency-store.js";
import { RedisStreamEventBus } from "../infrastructure/event-bus/redis-stream-event-bus.js";
import { EventStreams } from "../infrastructure/event-bus/streams.js";
import { createConnectedRedisClient } from "../infrastructure/redis/client.js";
import { SourceTypes } from "../modules/signal-ingestion/constants.js";
import { SignalIngestionService } from "../modules/signal-ingestion/service.js";
import { ManualSimulationSource } from "../modules/signal-ingestion/sources/manual-simulation-source.js";
import type { EventRecord } from "../infrastructure/event-bus/types.js";
import type {
  ExternalSignal,
  IngestionSummary,
  RawExternalSignal
} from "../modules/signal-ingestion/types.js";

export interface ManualIngestionDemoResult {
  summary: IngestionSummary;
  publishedRecords: EventRecord<ExternalSignal>[];
}

export interface ManualIngestionDemoServiceOptions {
  seedEvents?: RawExternalSignal[];
}

const DEFAULT_SEED_EVENTS: RawExternalSignal[] = [
  {
    source_type: SourceTypes.NEWS,
    raw_content: "Cyclone warning near Chennai port",
    source_reference: "manual://simulation/1",
    geographic_scope: "IN-TN",
    timestamp_utc: new Date().toISOString(),
    signal_confidence: 0.91
  }
];

export class ManualIngestionDemoService {
  private readonly seedEvents: RawExternalSignal[];

  constructor(options: ManualIngestionDemoServiceOptions = {}) {
    this.seedEvents = options.seedEvents ?? DEFAULT_SEED_EVENTS;
  }

  async runDemo(): Promise<ManualIngestionDemoResult> {
    const config = loadConfig();
    const redis = await createConnectedRedisClient({
      url: config.redisUrl,
      clientName: "swarm-risk-management-dev"
    });
    const eventBus = new RedisStreamEventBus(redis, {
      defaultMaxLen: config.redisStreamMaxLen,
      ownsClient: true
    });

    try {
      const idempotencyStore = new RedisIdempotencyStore(
        redis,
        config.redisDedupTtlSeconds
      );
      const manualSource = new ManualSimulationSource([...this.seedEvents]);

      const ingestion = new SignalIngestionService({
        sources: [manualSource],
        eventBus,
        idempotencyStore,
        stream: EventStreams.EXTERNAL_SIGNALS
      });

      const summary = await ingestion.runCycle();
      const publishedRecords = await eventBus.readRecent<ExternalSignal>(
        EventStreams.EXTERNAL_SIGNALS,
        config.devStreamPrintLimit
      );

      return {
        summary,
        publishedRecords
      };
    } finally {
      await eventBus.close();
    }
  }
}
