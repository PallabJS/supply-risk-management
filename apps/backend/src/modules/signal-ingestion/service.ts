import { EventStreams } from "../../infrastructure/event-bus/streams.js";
import { SignalDeduplicator } from "./deduplicator.js";
import { normalizeRawSignal } from "./schema.js";
import { withRetry } from "./retry.js";
import type {
  EventIdempotencyStore,
  ExternalSignal,
  IngestionSummary,
  Logger,
  RawExternalSignal,
  SignalIngestionServiceOptions
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

export class SignalIngestionService {
  private readonly sources: SignalIngestionServiceOptions["sources"];
  private readonly eventBus: SignalIngestionServiceOptions["eventBus"];
  private readonly stream: string;
  private readonly idempotencyStore: EventIdempotencyStore;
  private readonly maxPublishAttempts: number;
  private readonly retryDelayMs: number;
  private readonly logger: Logger;
  private pendingEvents: ExternalSignal[] = [];

  constructor({
    sources,
    eventBus,
    stream = EventStreams.EXTERNAL_SIGNALS,
    idempotencyStore = new SignalDeduplicator(),
    maxPublishAttempts = 4,
    retryDelayMs = 50,
    logger = createNoopLogger()
  }: SignalIngestionServiceOptions) {
    if (!eventBus || typeof eventBus.publish !== "function") {
      throw new Error("SignalIngestionService requires an eventBus.publish method");
    }
    if (!Array.isArray(sources)) {
      throw new Error("SignalIngestionService sources must be an array");
    }

    this.sources = sources;
    this.eventBus = eventBus;
    this.stream = stream;
    this.idempotencyStore = idempotencyStore;
    this.maxPublishAttempts = maxPublishAttempts;
    this.retryDelayMs = retryDelayMs;
    this.logger = logger;
  }

  getPendingCount(): number {
    return this.pendingEvents.length;
  }

  async ingestSignals(rawEvents: RawExternalSignal[]): Promise<IngestionSummary> {
    const summary: IngestionSummary = {
      polled: 0,
      queued: 0,
      skipped_deduplicated: 0,
      published: 0,
      failed: 0,
      pending: 0
    };

    const pendingEventIds = new Set(this.pendingEvents.map((event) => event.event_id));
    for (const rawEvent of rawEvents) {
      summary.polled += 1;
      const normalized = normalizeRawSignal(rawEvent);
      if (pendingEventIds.has(normalized.event_id)) {
        summary.skipped_deduplicated += 1;
        continue;
      }
      this.pendingEvents.push(normalized);
      pendingEventIds.add(normalized.event_id);
      summary.queued += 1;
    }

    const stillPending: ExternalSignal[] = [];

    for (const event of this.pendingEvents) {
      const isFirstSeen = await this.idempotencyStore.markIfFirstSeen(
        this.stream,
        event.event_id
      );
      if (!isFirstSeen) {
        summary.skipped_deduplicated += 1;
        continue;
      }

      try {
        await withRetry(
          async () => this.eventBus.publish(this.stream, event),
          {
            attempts: this.maxPublishAttempts,
            baseDelayMs: this.retryDelayMs,
            onRetry: ({ attempt, attempts, delayMs, error }) => {
              this.logger.warn("publish failed, retrying", {
                event_id: event.event_id,
                attempt,
                attempts,
                delayMs,
                error: errorMessage(error)
              });
            }
          }
        );
        summary.published += 1;
      } catch (error) {
        await this.idempotencyStore.clear(this.stream, event.event_id);
        stillPending.push(event);
        summary.failed += 1;
        this.logger.error("publish failed, event kept in pending queue", {
          event_id: event.event_id,
          error: errorMessage(error)
        });
      }
    }

    this.pendingEvents = stillPending;
    summary.pending = this.pendingEvents.length;
    return summary;
  }

  async runCycle(): Promise<IngestionSummary> {
    const polledRawEvents: RawExternalSignal[] = [];

    for (const source of this.sources) {
      if (!source || typeof source.poll !== "function") {
        throw new Error("Each source must implement an async poll() method");
      }

      try {
        const rawEvents = (await source.poll()) ?? [];
        polledRawEvents.push(...rawEvents);
      } catch (error) {
        this.logger.warn("source poll failed", {
          source: source.constructor?.name ?? "unknown-source",
          error: errorMessage(error)
        });
      }
    }

    return this.ingestSignals(polledRawEvents);
  }
}
