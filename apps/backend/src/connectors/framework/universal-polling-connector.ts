import type { EventPublisher } from "../../infrastructure/event-bus/types.js";
import type { ConnectorStateStore } from "./types.js";
import type { Logger } from "../../modules/signal-ingestion/types.js";
import type {
  ConnectorConfig,
  PollingConnector,
  ConnectorPollSummary,
} from "./types.js";

/**
 * Generic options for universal polling connector.
 * Handles the common flow for all polling-based connectors:
 * 1. Fetch data from external source
 * 2. Detect changes (optional)
 * 3. Transform to canonical signal format
 * 4. Publish to event stream
 * 5. Save state for next run
 */
export interface UniversalConnectorOptions<TProvider, TRawData, TSignal> {
  name: string;
  config: ConnectorConfig;
  provider: TProvider;
  fetcher: (provider: TProvider) => Promise<{ items: TRawData[] }>;
  transformer: (item: TRawData) => TSignal;
  changeDetector?: (item: TRawData) => string;
  eventPublisher: EventPublisher;
  stateStore: ConnectorStateStore;
  logger: Logger;
}

/**
 * Optional state that connectors can persist across polls.
 * Useful for etag, lastModified, cursors, etc.
 */
export interface ConnectorState {
  [key: string]: unknown;
}

/**
 * Base implementation for all polling-based connectors.
 *
 * Handles:
 * - Calling the provider to fetch data
 * - Detecting which items changed (optional)
 * - Transforming items to canonical signal format
 * - Publishing to Redis stream
 * - Persisting state between runs
 *
 * Subclasses can override methods for custom behavior.
 */
export class UniversalPollingConnector<
  TProvider,
  TRawData,
  TSignal,
> implements PollingConnector {
  readonly name: string;
  private readonly provider: TProvider;
  private readonly fetcher: (
    provider: TProvider,
  ) => Promise<{ items: TRawData[] }>;
  private readonly transformer: (item: TRawData) => TSignal;
  private readonly changeDetector: ((item: TRawData) => string) | undefined;
  private readonly eventPublisher: EventPublisher;
  private readonly stateStore: ConnectorStateStore;
  private readonly logger: Logger;
  private readonly outputStream: string;

  constructor(
    options: UniversalConnectorOptions<TProvider, TRawData, TSignal>,
  ) {
    this.name = options.name;
    this.provider = options.provider;
    this.fetcher = options.fetcher;
    this.transformer = options.transformer;
    this.changeDetector = options.changeDetector || undefined;
    this.eventPublisher = options.eventPublisher;
    this.stateStore = options.stateStore;
    this.logger = options.logger;
    this.outputStream = options.config.outputStream || "raw-input-signals";
  }

  /**
   * Run one poll cycle.
   * Fetches data, detects changes, publishes signals, saves state.
   */
  async poll(): Promise<ConnectorPollSummary> {
    const summary: ConnectorPollSummary = {
      fetched: 0,
      published: 0,
      skipped_unchanged: 0,
      failed: 0,
    };

    try {
      // Load previous state (optional)
      const previousState = await this.stateStore.load<ConnectorState>(
        this.name,
      );
      const stateTracker = new StateTracker(previousState || {});

      // Fetch from provider
      const result = await this.fetcher(this.provider);
      const items = result.items || [];
      summary.fetched = items.length;

      // Process each item
      for (const item of items) {
        // Check for changes (if change detector is provided)
        if (this.changeDetector) {
          const version = this.changeDetector(item);
          const previousVersion = stateTracker.getItemVersion(
            this.getItemKey(item),
          );

          if (previousVersion === version) {
            summary.skipped_unchanged += 1;
            continue;
          }

          stateTracker.setItemVersion(this.getItemKey(item), version);
        }

        // Transform to signal
        let signal: TSignal;
        try {
          signal = this.transformer(item);
        } catch (error) {
          this.logger.error("Failed to transform item", {
            connector: this.name,
            error: error instanceof Error ? error.message : String(error),
          });
          summary.failed += 1;
          continue;
        }

        // Publish to stream
        try {
          await this.eventPublisher.publish(this.outputStream, signal);
          summary.published += 1;
        } catch (error) {
          this.logger.error("Failed to publish signal", {
            connector: this.name,
            error: error instanceof Error ? error.message : String(error),
          });
          summary.failed += 1;
        }
      }

      // Save updated state
      try {
        await this.stateStore.save(this.name, stateTracker.getState());
      } catch (error) {
        this.logger.warn("Failed to save connector state", {
          connector: this.name,
          error: error instanceof Error ? error.message : String(error),
        });
        // Don't fail the poll, just warn
      }

      return summary;
    } catch (error) {
      this.logger.error("Poll failed", {
        connector: this.name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get a unique key for an item.
   * Override in subclass if items don't have an obvious unique identifier.
   */
  protected getItemKey(item: TRawData): string {
    if (typeof item === "object" && item !== null && "id" in item) {
      return String((item as Record<string, unknown>).id);
    }
    return JSON.stringify(item);
  }
}

/**
 * Helper for tracking state across poll cycles.
 * Maintains a map of item versions.
 */
class StateTracker {
  private state: ConnectorState;

  constructor(initialState: ConnectorState = {}) {
    this.state = { ...initialState };
  }

  getItemVersion(itemKey: string): string | undefined {
    const versions = this.state.itemVersions as
      | Record<string, string>
      | undefined;
    return versions?.[itemKey];
  }

  setItemVersion(itemKey: string, version: string): void {
    if (!this.state.itemVersions) {
      this.state.itemVersions = {};
    }
    (this.state.itemVersions as Record<string, string>)[itemKey] = version;
  }

  getState(): ConnectorState {
    return { ...this.state };
  }
}
