import assert from "node:assert/strict";
import test from "node:test";

import { NoaaWeatherAlertsClient } from "../../src/connectors/weather-noaa/client.js";
import {
  buildAlertVersion,
  parseNoaaAlertsPayload,
  toRawSignal
} from "../../src/connectors/weather-noaa/schema.js";
import { NoaaWeatherConnectorService } from "../../src/connectors/weather-noaa/service.js";
import type { NoaaAlert } from "../../src/connectors/weather-noaa/types.js";
import { EventStreams } from "../../src/infrastructure/event-bus/streams.js";
import { SourceTypes } from "../../src/modules/signal-ingestion/constants.js";

function samplePayload(sent = "2026-02-23T10:00:00.000Z"): unknown {
  return {
    type: "FeatureCollection",
    features: [
      {
        id: "https://api.weather.gov/alerts/abc123",
        properties: {
          event: "Tornado Warning",
          severity: "Extreme",
          urgency: "Immediate",
          certainty: "Observed",
          areaDesc: "Travis County, TX",
          headline: "Tornado warning in effect",
          description: "A severe storm capable of producing a tornado.",
          instruction: "Take shelter immediately.",
          status: "Actual",
          messageType: "Alert",
          sent,
          effective: sent,
          expires: "2026-02-23T11:00:00.000Z",
          senderName: "NWS Austin/San Antonio TX",
          web: "https://www.weather.gov/"
        }
      }
    ]
  };
}

function sampleAlert(sent = "2026-02-23T10:00:00.000Z"): NoaaAlert {
  return {
    alertId: "https://api.weather.gov/alerts/abc123",
    event: "Tornado Warning",
    severity: "Extreme",
    urgency: "Immediate",
    certainty: "Observed",
    areaDesc: "Travis County, TX",
    headline: "Tornado warning in effect",
    description: "A severe storm capable of producing a tornado.",
    instruction: "Take shelter immediately.",
    response: undefined,
    status: "Actual",
    messageType: "Alert",
    senderName: "NWS Austin/San Antonio TX",
    sent,
    effective: sent,
    onset: undefined,
    expires: "2026-02-23T11:00:00.000Z",
    web: "https://www.weather.gov/",
    affectedZones: []
  };
}

test("parses NOAA payload and maps weather alert to raw signal", () => {
  const alerts = parseNoaaAlertsPayload(samplePayload(), 10);
  assert.equal(alerts.length, 1);

  const first = alerts[0];
  assert.ok(first);
  const signal = toRawSignal(first, new Date("2026-02-23T10:05:00.000Z"));

  assert.equal(signal.source_type, SourceTypes.WEATHER);
  assert.equal(signal.geographic_scope, "Travis County, TX");
  assert.match(String(signal.event_id), /^noaa:/);
  assert.ok((signal.signal_confidence ?? 0) >= 0.9);
});

test("weather client supports conditional requests and query filters", async () => {
  let callCount = 0;
  const client = new NoaaWeatherAlertsClient({
    baseUrl: "https://api.weather.gov",
    alertsPath: "/alerts/active",
    userAgent: "swarm-risk-management-test/1.0",
    requestTimeoutMs: 10_000,
    area: "CA,OR",
    severity: "Severe,Extreme",
    urgency: "Immediate,Expected",
    certainty: "Observed,Likely",
    fetchImpl: async (input, init) => {
      callCount += 1;
      const url = input instanceof URL ? input : new URL(String(input));
      assert.equal(url.pathname, "/alerts/active");
      assert.equal(url.searchParams.get("area"), "CA,OR");
      assert.equal(url.searchParams.get("severity"), "Severe,Extreme");
      assert.equal(url.searchParams.get("urgency"), "Immediate,Expected");
      assert.equal(url.searchParams.get("certainty"), "Observed,Likely");

      if (callCount === 1) {
        const headers = init?.headers as Record<string, string>;
        assert.equal(headers["if-none-match"], undefined);
        return new Response(JSON.stringify(samplePayload()), {
          status: 200,
          headers: {
            etag: '"abc123"',
            "last-modified": "Mon, 23 Feb 2026 10:00:00 GMT"
          }
        });
      }

      const headers = init?.headers as Record<string, string>;
      assert.equal(headers["if-none-match"], '"abc123"');
      assert.ok(typeof headers["if-modified-since"] === "string");
      return new Response(null, { status: 304 });
    }
  });

  const first = await client.fetchActiveAlerts(20);
  assert.equal(first.notModified, false);
  assert.equal(first.alerts.length, 1);

  const second = await client.fetchActiveAlerts(20);
  assert.equal(second.notModified, true);
  assert.equal(second.alerts.length, 0);
});

test("weather connector service publishes only new/updated alert versions", async () => {
  let fetchRound = 0;
  const alertsProvider = {
    async fetchActiveAlerts() {
      fetchRound += 1;
      if (fetchRound === 1) {
        return { alerts: [sampleAlert("2026-02-23T10:00:00.000Z")], notModified: false };
      }
      if (fetchRound === 2) {
        return { alerts: [sampleAlert("2026-02-23T10:00:00.000Z")], notModified: false };
      }
      return { alerts: [sampleAlert("2026-02-23T10:05:00.000Z")], notModified: false };
    }
  };

  const published: Array<{ stream: string; event_id: string }> = [];
  const service = new NoaaWeatherConnectorService({
    alertsProvider,
    eventPublisher: {
      async publish(stream, message) {
        const payload = message as { event_id?: string };
        const eventId = payload.event_id ?? "unknown";
        published.push({ stream, event_id: eventId });
        return {
          id: `${published.length}-0`,
          stream,
          message,
          published_at_utc: new Date().toISOString()
        };
      }
    },
    stream: EventStreams.RAW_INPUT_SIGNALS,
    maxAlertsPerPoll: 20
  });

  const first = await service.runOnce();
  const second = await service.runOnce();
  const third = await service.runOnce();

  assert.equal(first.published, 1);
  assert.equal(second.published, 0);
  assert.equal(second.skipped_unchanged, 1);
  assert.equal(third.published, 1);
  assert.equal(published.length, 2);
  assert.notEqual(
    buildAlertVersion(sampleAlert("2026-02-23T10:00:00.000Z")),
    buildAlertVersion(sampleAlert("2026-02-23T10:05:00.000Z"))
  );
});
