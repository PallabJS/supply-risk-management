import assert from "node:assert/strict";
import test from "node:test";

import { EventStreams } from "../../src/infrastructure/event-bus/streams.js";
import { loadSignalIngestionGatewayConfig } from "../../src/adapters/signal-ingestion-gateway/config.js";
import { SignalIngestionGatewayService } from "../../src/adapters/signal-ingestion-gateway/service.js";

test("loads signal ingestion gateway config defaults", () => {
  const config = loadSignalIngestionGatewayConfig({});

  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 8090);
  assert.equal(config.maxRequestBytes, 1_048_576);
  assert.equal(config.maxSignalsPerRequest, 500);
  assert.equal(config.authToken, undefined);
});

test("loads signal ingestion gateway config custom values", () => {
  const config = loadSignalIngestionGatewayConfig({
    SIGNAL_INGESTION_GATEWAY_HOST: "0.0.0.0",
    SIGNAL_INGESTION_GATEWAY_PORT: "9001",
    SIGNAL_INGESTION_GATEWAY_MAX_REQUEST_BYTES: "2048",
    SIGNAL_INGESTION_GATEWAY_MAX_SIGNALS_PER_REQUEST: "20",
    SIGNAL_INGESTION_GATEWAY_AUTH_TOKEN: "secret-token"
  });

  assert.equal(config.host, "0.0.0.0");
  assert.equal(config.port, 9001);
  assert.equal(config.maxRequestBytes, 2_048);
  assert.equal(config.maxSignalsPerRequest, 20);
  assert.equal(config.authToken, "secret-token");
});

test("signal ingestion gateway service publishes raw signals to intake stream", async () => {
  const published: Array<{ stream: string; message: unknown }> = [];
  const service = new SignalIngestionGatewayService({
    eventPublisher: {
      async publish(stream, message) {
        published.push({ stream, message });
        return {
          id: `${published.length}-0`,
          stream,
          message,
          published_at_utc: new Date().toISOString()
        };
      }
    }
  });

  const records = await service.publishSignals([
    {
      event_id: "raw-evt-1",
      source_type: "NEWS",
      raw_content: "Port congestion update",
      source_reference: "news://signal-1",
      geographic_scope: "US-CA",
      timestamp_utc: new Date().toISOString(),
      signal_confidence: 0.76
    },
    {
      sourceType: "WEATHER",
      content: "Storm warning near logistics route",
      sourceReference: "wx://signal-2",
      region: "US-FL"
    }
  ]);

  assert.equal(records.length, 2);
  assert.equal(published.length, 2);
  assert.equal(published[0]?.stream, EventStreams.RAW_INPUT_SIGNALS);
  assert.equal(service.getMetrics().requests_total, 1);
  assert.equal(service.getMetrics().signals_received, 2);
  assert.equal(service.getMetrics().signals_published, 2);
  assert.equal(service.getMetrics().requests_failed, 0);
});
