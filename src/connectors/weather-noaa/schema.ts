import { createHash } from "node:crypto";

import { SourceTypes } from "../../modules/signal-ingestion/constants.js";
import type { RawExternalSignal } from "../../modules/signal-ingestion/types.js";
import type { NoaaAlert } from "./types.js";

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const output: string[] = [];
  for (const item of value) {
    const normalized = asNonEmptyString(item);
    if (normalized) {
      output.push(normalized);
    }
  }
  return output;
}

function normalizeIsoTimestamp(value: unknown): string | undefined {
  const text = asNonEmptyString(value);
  if (!text) {
    return undefined;
  }
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return new Date(parsed).toISOString();
}

function parseNoaaAlert(feature: unknown): NoaaAlert | undefined {
  if (!isObjectRecord(feature)) {
    return undefined;
  }

  const properties = isObjectRecord(feature.properties) ? feature.properties : {};
  const alertId = asNonEmptyString(feature.id) ?? asNonEmptyString(properties.id);
  if (!alertId) {
    return undefined;
  }

  const event = asNonEmptyString(properties.event) ?? "Weather Alert";
  return {
    alertId,
    event,
    severity: asNonEmptyString(properties.severity),
    urgency: asNonEmptyString(properties.urgency),
    certainty: asNonEmptyString(properties.certainty),
    areaDesc: asNonEmptyString(properties.areaDesc),
    headline: asNonEmptyString(properties.headline),
    description: asNonEmptyString(properties.description),
    instruction: asNonEmptyString(properties.instruction),
    response: asNonEmptyString(properties.response),
    status: asNonEmptyString(properties.status),
    messageType: asNonEmptyString(properties.messageType),
    senderName: asNonEmptyString(properties.senderName),
    sent: normalizeIsoTimestamp(properties.sent),
    effective: normalizeIsoTimestamp(properties.effective),
    onset: normalizeIsoTimestamp(properties.onset),
    expires: normalizeIsoTimestamp(properties.expires),
    web: asNonEmptyString(properties.web),
    affectedZones: asStringArray(properties.affectedZones)
  };
}

export function parseNoaaAlertsPayload(payload: unknown, maxAlerts: number): NoaaAlert[] {
  if (!isObjectRecord(payload)) {
    throw new Error("NOAA payload must be an object");
  }

  const features = payload.features;
  if (!Array.isArray(features)) {
    throw new Error("NOAA payload must include a features array");
  }

  const safeLimit = Math.max(0, Math.trunc(maxAlerts));
  const alerts: NoaaAlert[] = [];
  for (const feature of features) {
    if (safeLimit > 0 && alerts.length >= safeLimit) {
      break;
    }

    const parsed = parseNoaaAlert(feature);
    if (parsed) {
      alerts.push(parsed);
    }
  }

  return alerts;
}

function severityConfidence(severity: string | undefined): number {
  const normalized = severity?.toUpperCase();
  switch (normalized) {
    case "EXTREME":
      return 0.95;
    case "SEVERE":
      return 0.9;
    case "MODERATE":
      return 0.82;
    case "MINOR":
      return 0.72;
    default:
      return 0.62;
  }
}

function certaintyAdjustment(certainty: string | undefined): number {
  const normalized = certainty?.toUpperCase();
  switch (normalized) {
    case "OBSERVED":
      return 0.03;
    case "LIKELY":
      return 0.01;
    case "POSSIBLE":
      return -0.05;
    case "UNLIKELY":
      return -0.1;
    default:
      return 0;
  }
}

function computeConfidence(alert: NoaaAlert): number {
  const value = severityConfidence(alert.severity) + certaintyAdjustment(alert.certainty);
  return Math.max(0.05, Math.min(0.99, Number(value.toFixed(2))));
}

function buildRawContent(alert: NoaaAlert): string {
  const parts = [alert.event, alert.headline, alert.description, alert.instruction].filter(
    (value): value is string => typeof value === "string" && value.trim() !== ""
  );
  if (parts.length === 0) {
    return "Weather alert received";
  }
  return parts.join(" | ");
}

export function buildAlertVersion(alert: NoaaAlert): string {
  return [
    alert.sent ?? "",
    alert.effective ?? "",
    alert.onset ?? "",
    alert.expires ?? "",
    alert.status ?? "",
    alert.messageType ?? "",
    alert.severity ?? "",
    alert.urgency ?? "",
    alert.certainty ?? "",
    alert.headline ?? ""
  ].join("|");
}

function buildSourceReference(alert: NoaaAlert): string {
  if (alert.web) {
    return alert.web;
  }
  if (alert.alertId.startsWith("http://") || alert.alertId.startsWith("https://")) {
    return alert.alertId;
  }
  return `https://api.weather.gov/alerts/${encodeURIComponent(alert.alertId)}`;
}

function buildEventId(alert: NoaaAlert): string {
  const providerIdHash = createHash("sha1").update(alert.alertId).digest("hex").slice(0, 12);
  const versionHash = createHash("sha1").update(buildAlertVersion(alert)).digest("hex").slice(0, 12);
  return `noaa:${providerIdHash}:${versionHash}`;
}

function toGeographicScope(areaDesc: string | undefined): string {
  const normalized = asNonEmptyString(areaDesc);
  if (!normalized) {
    return "US";
  }
  return normalized.length > 180 ? normalized.slice(0, 180) : normalized;
}

export function toRawSignal(alert: NoaaAlert, now = new Date()): RawExternalSignal {
  return {
    event_id: buildEventId(alert),
    source_type: SourceTypes.WEATHER,
    raw_content: buildRawContent(alert),
    source_reference: buildSourceReference(alert),
    geographic_scope: toGeographicScope(alert.areaDesc),
    timestamp_utc: alert.effective ?? alert.onset ?? alert.sent ?? now.toISOString(),
    signal_confidence: computeConfidence(alert),
    provider: "NOAA",
    provider_alert_id: alert.alertId,
    provider_status: alert.status,
    provider_message_type: alert.messageType,
    provider_severity: alert.severity,
    provider_urgency: alert.urgency,
    provider_certainty: alert.certainty,
    provider_event: alert.event,
    provider_expires_utc: alert.expires,
    provider_sender: alert.senderName,
    provider_affected_zones: alert.affectedZones
  };
}
