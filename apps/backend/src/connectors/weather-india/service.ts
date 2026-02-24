import { EventStreams } from "../../infrastructure/event-bus/streams.js";
import type { Logger } from "../../modules/signal-ingestion/types.js";
import { buildAlertVersion, toRawSignal } from "./schema.js";
import type {
  IndianWeatherAlert,
  WeatherConnectorPollSummary,
} from "./types.js";

function createNoopLogger(): Logger {
  return {
    info() {},
    warn() {},
    error() {},
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export interface IndianWeatherConnectorServiceOptions {
  alertsProvider: {
    fetchActiveAlerts(maxAlerts: number): Promise<{
      alerts: IndianWeatherAlert[];
      notModified?: boolean;
    }>;
  };
  eventPublisher: {
    publish(stream: string, data: unknown): Promise<void>;
  };
  stream?: string;
  maxAlertsPerPoll: number;
  logger?: Logger;
}

export class IndianWeatherConnectorService {
  private readonly alertsProvider: IndianWeatherConnectorServiceOptions["alertsProvider"];
  private readonly eventPublisher: IndianWeatherConnectorServiceOptions["eventPublisher"];
  private readonly stream: string;
  private readonly maxAlertsPerPoll: number;
  private readonly logger: Logger;

  private readonly lastVersionByAlertId = new Map<string, string>();

  constructor(options: IndianWeatherConnectorServiceOptions) {
    this.alertsProvider = options.alertsProvider;
    this.eventPublisher = options.eventPublisher;
    this.stream = options.stream ?? EventStreams.RAW_INPUT_SIGNALS;
    this.maxAlertsPerPoll = options.maxAlertsPerPoll;
    this.logger = options.logger ?? createNoopLogger();
  }

  async runOnce(): Promise<WeatherConnectorPollSummary> {
    const summary: WeatherConnectorPollSummary = {
      fetched: 0,
      published: 0,
      skipped_unchanged: 0,
      failed: 0,
      not_modified: false,
    };

    const result = await this.alertsProvider.fetchActiveAlerts(
      this.maxAlertsPerPoll,
    );
    if (result.notModified) {
      summary.not_modified = true;
      return summary;
    }

    summary.fetched = result.alerts.length;
    const activeAlertIds = new Set<string>();

    for (const alert of result.alerts) {
      activeAlertIds.add(alert.id);
      const version = buildAlertVersion(alert);
      if (this.lastVersionByAlertId.get(alert.id) === version) {
        summary.skipped_unchanged += 1;
        continue;
      }

      const rawSignal = toRawSignal(alert);
      try {
        await this.eventPublisher.publish(this.stream, rawSignal);
        this.lastVersionByAlertId.set(alert.id, version);
        summary.published += 1;
      } catch (error) {
        summary.failed += 1;
        this.logger.warn("weather connector publish failed", {
          alert_id: alert.id,
          error: errorMessage(error),
        });
      }
    }

    for (const alertId of this.lastVersionByAlertId.keys()) {
      if (!activeAlertIds.has(alertId)) {
        this.lastVersionByAlertId.delete(alertId);
      }
    }

    return summary;
  }
}
