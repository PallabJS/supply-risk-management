import { parseIndiaAlertsPayload } from "./schema.js";
import type {
  FetchActiveAlertsResult,
  IndianWeatherAlertsClientOptions,
  WeatherAlertsProvider,
} from "./types.js";

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function assertPositiveInt(value: number, fieldName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
}

function applyOptionalQuery(
  url: URL,
  key: string,
  value: string | undefined,
): void {
  if (!value || value.trim() === "") {
    return;
  }
  url.searchParams.set(key, value.trim());
}

export class IndianWeatherAlertsClient implements WeatherAlertsProvider {
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly requestTimeoutMs: number;
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;

  private etag: string | undefined;
  private lastModified: string | undefined;

  constructor(options: IndianWeatherAlertsClientOptions) {
    if (!options.baseUrl || options.baseUrl.trim() === "") {
      throw new Error("IndianWeatherAlertsClient requires a non-empty baseUrl");
    }

    assertPositiveInt(options.requestTimeoutMs, "requestTimeoutMs");

    this.baseUrl = stripTrailingSlash(options.baseUrl.trim());
    this.userAgent = options.userAgent || "swarm-risk-management/0.1";
    this.requestTimeoutMs = options.requestTimeoutMs;
    this.apiKey = options.apiKey?.trim() || undefined;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async fetchActiveAlerts(maxAlerts: number): Promise<FetchActiveAlertsResult> {
    assertPositiveInt(maxAlerts, "maxAlerts");

    // Major Indian states for weather monitoring
    const indianStates = [
      "Andhra Pradesh",
      "Arunachal Pradesh",
      "Assam",
      "Bihar",
      "Chhattisgarh",
      "Goa",
      "Gujarat",
      "Haryana",
      "Himachal Pradesh",
      "Jharkhand",
      "Karnataka",
      "Kerala",
      "Madhya Pradesh",
      "Maharashtra",
      "Manipur",
      "Meghalaya",
      "Mizoram",
      "Nagaland",
      "Odisha",
      "Punjab",
      "Rajasthan",
      "Sikkim",
      "Tamil Nadu",
      "Telangana",
      "Tripura",
      "Uttar Pradesh",
      "Uttarakhand",
      "West Bengal",
    ];

    try {
      const url = new URL(`${this.baseUrl}/forecast.json`);
      if (this.apiKey) {
        // WeatherAPI expects "key" as the API key parameter name.
        url.searchParams.set("key", this.apiKey);
      }
      // Best-effort: request alerts for India. WeatherAPI does not provide a bulk
      // India-wide alert feed, so we query a representative location.
      url.searchParams.set("q", "India");
      url.searchParams.set("days", "1");
      url.searchParams.set("alerts", "yes");

      const headers: Record<string, string> = {
        accept: "application/json",
        "user-agent": this.userAgent,
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
          signal: controller.signal,
        });

        if (response.status === 304) {
          return {
            alerts: [],
            notModified: true,
          };
        }

        if (!response.ok) {
          const body = await response.text();
          console.log(
            `Indian weather API request failed with status ${response.status}`,
            body,
          );
          // In dev/demo environments, we prefer showing India-only data rather than
          // hard-failing the connector when the API key is missing/invalid.
          if (response.status === 401 || response.status === 403) {
            return {
              alerts: parseIndiaAlertsPayload(
                undefined,
                maxAlerts,
                indianStates,
              ),
              notModified: false,
            };
          }
          throw new Error(
            `Indian weather API request failed (${response.status}): ${body}`,
          );
        }

        this.etag = response.headers.get("etag") ?? this.etag;
        this.lastModified =
          response.headers.get("last-modified") ?? this.lastModified;

        const payload = (await response.json()) as unknown;
        const alerts = parseIndiaAlertsPayload(
          payload,
          maxAlerts,
          indianStates,
        );

        return {
          alerts,
          notModified: false,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(
          `Indian weather API request timed out after ${this.requestTimeoutMs}ms`,
        );
      }
      throw error;
    }
  }
}
