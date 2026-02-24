import type { EventPublisher } from "../../infrastructure/event-bus/types.js";
import type { SourceType } from "./constants.js";

export interface ExternalSignal {
  event_id: string;
  source_type: SourceType;
  raw_content: string;
  source_reference: string;
  geographic_scope: string;
  timestamp_utc: string;
  ingestion_time_utc: string;
  signal_confidence: number;
}

export interface RawExternalSignal {
  event_id?: string;
  eventId?: string;
  source_type?: string;
  sourceType?: string;
  type?: string;
  raw_content?: string;
  rawContent?: string;
  content?: string;
  source_reference?: string;
  sourceReference?: string;
  reference?: string;
  geographic_scope?: string;
  geographicScope?: string;
  region?: string;
  timestamp_utc?: string | number;
  timestampUtc?: string | number;
  detected_at?: string | number;
  signal_confidence?: number;
  signalConfidence?: number;
  confidence?: number;
  [key: string]: unknown;
}

export interface SignalSource {
  poll(): Promise<RawExternalSignal[]>;
}

export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface IngestionSummary {
  polled: number;
  queued: number;
  skipped_deduplicated: number;
  published: number;
  failed: number;
  pending: number;
}

export interface EventIdempotencyStore {
  markIfFirstSeen(stream: string, eventId: string): Promise<boolean>;
  clear(stream: string, eventId: string): Promise<void>;
}

export interface SignalIngestionServiceOptions {
  sources: SignalSource[];
  eventBus: EventPublisher;
  stream?: string;
  idempotencyStore?: EventIdempotencyStore;
  maxPublishAttempts?: number;
  retryDelayMs?: number;
  logger?: Logger;
}
