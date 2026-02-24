export interface IndianWeatherAlert {
  id: string;
  title: string;
  description: string;
  severity: "Extreme" | "Severe" | "Moderate" | "Minor";
  state: string;
  districts?: string[];
  startTime: string;
  endTime?: string;
  source: "imd" | "weather-api";
}

export interface FetchActiveAlertsResult {
  alerts: IndianWeatherAlert[];
  notModified?: boolean;
}

export interface IndianWeatherAlertsClientOptions {
  baseUrl: string;
  requestTimeoutMs: number;
  userAgent?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export interface WeatherAlertsProvider {
  fetchActiveAlerts(maxAlerts: number): Promise<FetchActiveAlertsResult>;
}

export interface WeatherConnectorPollSummary {
  fetched: number;
  published: number;
  skipped_unchanged: number;
  failed: number;
  not_modified?: boolean;
}
