import { EventStreams } from "../../infrastructure/event-bus/streams.js";
import type { EventPublisher, EventRecord } from "../../infrastructure/event-bus/types.js";
import type { RawExternalSignal } from "../../modules/signal-ingestion/types.js";

export interface SignalIngestionGatewayMetrics {
  requests_total: number;
  requests_failed: number;
  signals_received: number;
  signals_published: number;
}

export interface SignalIngestionGatewayServiceOptions {
  eventPublisher: EventPublisher;
  stream?: string;
}

export class SignalIngestionGatewayService {
  private readonly eventPublisher: EventPublisher;
  private readonly stream: string;

  private requestsTotal = 0;
  private requestsFailed = 0;
  private signalsReceived = 0;
  private signalsPublished = 0;

  constructor(options: SignalIngestionGatewayServiceOptions) {
    if (!options.eventPublisher || typeof options.eventPublisher.publish !== "function") {
      throw new Error("SignalIngestionGatewayService requires eventPublisher.publish");
    }

    this.eventPublisher = options.eventPublisher;
    this.stream = options.stream ?? EventStreams.RAW_INPUT_SIGNALS;
  }

  getMetrics(): SignalIngestionGatewayMetrics {
    return {
      requests_total: this.requestsTotal,
      requests_failed: this.requestsFailed,
      signals_received: this.signalsReceived,
      signals_published: this.signalsPublished
    };
  }

  async publishSignals(
    signals: RawExternalSignal[]
  ): Promise<EventRecord<RawExternalSignal>[]> {
    this.requestsTotal += 1;
    this.signalsReceived += signals.length;

    try {
      const published: EventRecord<RawExternalSignal>[] = [];
      for (const signal of signals) {
        const record = await this.eventPublisher.publish(this.stream, signal);
        published.push(record);
      }
      this.signalsPublished += published.length;
      return published;
    } catch (error) {
      this.requestsFailed += 1;
      throw error;
    }
  }
}
