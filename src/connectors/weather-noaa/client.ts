import { parseNoaaAlertsPayload } from "./schema.js";
import type {
  FetchActiveAlertsResult,
  NoaaWeatherAlertsClientOptions,
  WeatherAlertsProvider
} from "./types.js";

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function assertPositiveInt(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
}

function applyOptionalQuery(url: URL, key: string, value: string | undefined): void {
  if (!value || value.trim() === "") {
    return;
  }
  url.searchParams.set(key, value.trim());
}

export class NoaaWeatherAlertsClient implements WeatherAlertsProvider {
  private readonly baseUrl: string;
  private readonly alertsPath: string;
  private readonly userAgent: string;
  private readonly requestTimeoutMs: number;
  private readonly area: string | undefined;
  private readonly severity: string | undefined;
  private readonly urgency: string | undefined;
  private readonly certainty: string | undefined;
  private readonly fetchImpl: typeof fetch;

  private etag: string | undefined;
  private lastModified: string | undefined;

  constructor(options: NoaaWeatherAlertsClientOptions) {
    if (!options.baseUrl || options.baseUrl.trim() === "") {
      throw new Error("NoaaWeatherAlertsClient requires a non-empty baseUrl");
    }
    if (!options.userAgent || options.userAgent.trim() === "") {
      throw new Error("NoaaWeatherAlertsClient requires a non-empty userAgent");
    }

    assertPositiveInt(options.requestTimeoutMs, "requestTimeoutMs");

    this.baseUrl = stripTrailingSlash(options.baseUrl.trim());
    this.alertsPath = options.alertsPath.startsWith("/")
      ? options.alertsPath
      : `/${options.alertsPath}`;
    this.userAgent = options.userAgent.trim();
    this.requestTimeoutMs = options.requestTimeoutMs;
    this.area = options.area?.trim() || undefined;
    this.severity = options.severity?.trim() || undefined;
    this.urgency = options.urgency?.trim() || undefined;
    this.certainty = options.certainty?.trim() || undefined;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async fetchActiveAlerts(maxAlerts: number): Promise<FetchActiveAlertsResult> {
    assertPositiveInt(maxAlerts, "maxAlerts");

    const url = new URL(`${this.baseUrl}${this.alertsPath}`);
    applyOptionalQuery(url, "status", "actual");
    applyOptionalQuery(url, "message_type", "alert");
    applyOptionalQuery(url, "area", this.area);
    applyOptionalQuery(url, "severity", this.severity);
    applyOptionalQuery(url, "urgency", this.urgency);
    applyOptionalQuery(url, "certainty", this.certainty);

    const headers: Record<string, string> = {
      accept: "application/geo+json, application/json",
      "user-agent": this.userAgent
    };
    if (this.etag) {
      headers["if-none-match"] = this.etag;
    }
    if (this.lastModified) {
      headers["if-modified-since"] = this.lastModified;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.requestTimeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers,
        signal: controller.signal
      });

      if (response.status === 304) {
        return {
          alerts: [],
          notModified: true
        };
      }

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`NOAA weather API request failed (${response.status}): ${body}`);
      }

      this.etag = response.headers.get("etag") ?? this.etag;
      this.lastModified = response.headers.get("last-modified") ?? this.lastModified;

      const payload = (await response.json()) as unknown;
      const alerts = parseNoaaAlertsPayload(payload, maxAlerts);

      return {
        alerts,
        notModified: false
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`NOAA weather API request timed out after ${this.requestTimeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
