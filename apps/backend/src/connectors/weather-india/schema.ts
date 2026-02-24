import type { IndianWeatherAlert } from "./types.js";
import type { RawExternalSignal } from "../../modules/signal-ingestion/types.js";

/**
 * Parses weather alerts from API payload
 */
export function parseIndiaAlertsPayload(
  payload: unknown,
  maxAlerts: number,
  states: string[],
): IndianWeatherAlert[] {
  if (Array.isArray(payload)) {
    return payload.slice(0, maxAlerts).map((item: unknown) => {
      const obj = item as Record<string, unknown>;
      const districts = Array.isArray(obj.districts)
        ? obj.districts.filter((value): value is string => typeof value === "string")
        : undefined;
      const endTime = obj.endTime ? String(obj.endTime) : undefined;
      return {
        id: String(obj.id || crypto.randomUUID?.() || Date.now()),
        title: String(obj.title || obj.main || "Weather Alert"),
        description: String(obj.description || ""),
        severity: normalizeSeverity(String(obj.severity || "Moderate")),
        state: String(obj.state || obj.region || ""),
        ...(districts ? { districts } : {}),
        startTime: String(obj.startTime || new Date().toISOString()),
        ...(endTime ? { endTime } : {}),
        source: obj.source === "imd" ? "imd" : "weather-api",
      };
    });
  }

  // WeatherAPI response shape:
  // { location, forecast: { alerts: { alert: [...] } } } or { alerts: { alert: [...] } }
  const root = payload as Record<string, unknown> | null;
  if (!root || typeof root !== "object") {
    return [];
  }

  const location = (root.location as Record<string, unknown> | undefined) ?? {};
  const forecast = (root.forecast as Record<string, unknown> | undefined) ?? {};
  const alertsNode =
    (forecast.alerts as Record<string, unknown> | undefined) ??
    (root.alerts as Record<string, unknown> | undefined) ??
    {};
  const rawAlerts = alertsNode.alert;
  if (!Array.isArray(rawAlerts)) {
    return [];
  }

  return rawAlerts.slice(0, maxAlerts).map((item: unknown, index) => {
    const alert = (item as Record<string, unknown> | null) ?? {};
    const areasRaw = String(alert.areas ?? "").trim();
    const districts = areasRaw
      ? areasRaw
          .split(/[,;|]/)
          .map((value) => value.trim())
          .filter((value) => value !== "")
      : undefined;

    const derivedState =
      String(alert.region ?? "").trim() ||
      String(location.region ?? "").trim() ||
      String(location.name ?? "").trim() ||
      states[0] ||
      "India";

    const effective = String(alert.effective ?? "").trim();
    const expires = String(alert.expires ?? "").trim();
    const nowIso = new Date().toISOString();
    const startTime = Number.isFinite(Date.parse(effective)) ? effective : nowIso;
    const endTime = Number.isFinite(Date.parse(expires)) ? expires : undefined;

    return {
      id: String(alert.id || alert.headline || `${Date.now()}-${index}`),
      title: String(alert.headline || alert.event || "Weather Alert"),
      description: String(alert.desc || alert.note || alert.instruction || ""),
      severity: normalizeSeverity(String(alert.severity || "Moderate")),
      state: derivedState,
      ...(districts && districts.length > 0 ? { districts } : {}),
      startTime,
      ...(endTime ? { endTime } : {}),
      source: "weather-api",
    };
  });
}

/**
 * Generate mock Indian weather alerts for testing/demo
 */
export function generateMockIndianAlerts(
  states: string[],
  count: number,
): IndianWeatherAlert[] {
  const alerts: IndianWeatherAlert[] = [];
  const alertTypes = [
    "Heavy Rainfall",
    "Severe Thunderstorm",
    "Heat Wave",
    "Flood Warning",
    "Wind Advisory",
    "Dust Storm",
  ];
  const severities: Array<"Extreme" | "Severe" | "Moderate" | "Minor"> = [
    "Moderate",
    "Severe",
    "Moderate",
    "Minor",
  ];

  for (let i = 0; i < Math.min(count, 10); i++) {
    const state = states[Math.floor(Math.random() * states.length)] || "India";
    const alertType =
      alertTypes[Math.floor(Math.random() * alertTypes.length)] || "Weather Alert";
    const severity =
      severities[Math.floor(Math.random() * severities.length)] || "Moderate";

    alerts.push({
      id: `india-${Date.now()}-${i}`,
      title: `${alertType} Warning - ${state}`,
      description: `A ${severity.toLowerCase()} ${alertType.toLowerCase()} warning is in effect for ${state}.`,
      severity,
      state,
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      source: "weather-api",
    });
  }

  return alerts;
}

function normalizeSeverity(
  severity: string,
): "Extreme" | "Severe" | "Moderate" | "Minor" {
  const normalized = severity.toLowerCase();
  if (normalized.includes("extreme")) return "Extreme";
  if (normalized.includes("severe")) return "Severe";
  if (normalized.includes("moderate")) return "Moderate";
  return "Minor";
}

/**
 * Transform Indian weather alert to raw signal
 */
export function toRawSignal(alert: IndianWeatherAlert): RawExternalSignal {
  return {
    event_id: alert.id,
    source_type: "WEATHER",
    raw_content: JSON.stringify({
      title: alert.title,
      description: alert.description,
      severity: alert.severity,
      state: alert.state,
      districts: alert.districts || [],
    }),
    source_reference: `weather-india:${alert.id}`,
    geographic_scope: alert.state || "India",
    signal_confidence: mapSeverityToConfidence(alert.severity),
    timestamp_utc: new Date(alert.startTime).toISOString(),
  };
}

function mapSeverityToConfidence(severity: string): number {
  switch (severity) {
    case "Extreme":
      return 0.95;
    case "Severe":
      return 0.85;
    case "Moderate":
      return 0.7;
    case "Minor":
      return 0.55;
    default:
      return 0.5;
  }
}

/**
 * Build version string for change detection
 */
export function buildAlertVersion(alert: IndianWeatherAlert): string {
  return `${alert.id}:${alert.severity}:${alert.startTime}`;
}
