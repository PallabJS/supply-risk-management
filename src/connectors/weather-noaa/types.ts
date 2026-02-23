import type { EventPublisher } from "../../infrastructure/event-bus/types.js";
import type { Logger } from "../../modules/signal-ingestion/types.js";

export interface NoaaAlert {
  alertId: string;
  event: string;
  severity: string | undefined;
  urgency: string | undefined;
  certainty: string | undefined;
  areaDesc: string | undefined;
  headline: string | undefined;
  description: string | undefined;
  instruction: string | undefined;
  response: string | undefined;
  status: string | undefined;
  messageType: string | undefined;
  senderName: string | undefined;
  sent: string | undefined;
  effective: string | undefined;
  onset: string | undefined;
  expires: string | undefined;
  web: string | undefined;
  affectedZones: string[];
}

export interface FetchActiveAlertsResult {
  alerts: NoaaAlert[];
  notModified: boolean;
}

export interface WeatherAlertsProvider {
  fetchActiveAlerts(maxAlerts: number): Promise<FetchActiveAlertsResult>;
}

export interface NoaaWeatherAlertsClientOptions {
  baseUrl: string;
  alertsPath: string;
  userAgent: string;
  requestTimeoutMs: number;
  area?: string;
  severity?: string;
  urgency?: string;
  certainty?: string;
  fetchImpl?: typeof fetch;
}

export interface WeatherConnectorPollSummary {
  fetched: number;
  published: number;
  skipped_unchanged: number;
  failed: number;
  not_modified: boolean;
}

export interface NoaaWeatherConnectorServiceOptions {
  alertsProvider: WeatherAlertsProvider;
  eventPublisher: EventPublisher;
  stream: string;
  maxAlertsPerPoll: number;
  logger?: Logger;
}
