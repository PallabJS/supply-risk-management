import assert from "node:assert/strict";
import test from "node:test";

import { EventStreams } from "../../src/infrastructure/event-bus/streams.js";
import { RuleBasedRiskClassifier } from "../../src/modules/risk-classification/fallback-rule-classifier.js";
import { RiskClassificationService } from "../../src/modules/risk-classification/service.js";
import type { RiskClassifier } from "../../src/modules/risk-classification/types.js";
import type { ExternalSignal } from "../../src/modules/signal-ingestion/types.js";

function createSignal(partial: Partial<ExternalSignal> = {}): ExternalSignal {
  return {
    event_id: partial.event_id ?? "evt-risk-1",
    source_type: partial.source_type ?? "NEWS",
    raw_content: partial.raw_content ?? "Major logistics delay expected near port",
    source_reference: partial.source_reference ?? "manual://risk-test",
    geographic_scope: partial.geographic_scope ?? "US-CA",
    timestamp_utc: partial.timestamp_utc ?? new Date().toISOString(),
    ingestion_time_utc: partial.ingestion_time_utc ?? new Date().toISOString(),
    signal_confidence: partial.signal_confidence ?? 0.8
  };
}

test("classifies and publishes with fallback classifier by default", async () => {
  const published: unknown[] = [];
  const service = new RiskClassificationService({
    eventPublisher: {
      async publish(_stream, message) {
        published.push(message);
        return {
          id: "1-0",
          stream: EventStreams.CLASSIFIED_EVENTS,
          message,
          published_at_utc: new Date().toISOString()
        };
      }
    }
  });

  const decision = await service.classifyAndPublish(createSignal());
  assert.equal(decision.usedFallback, true);
  assert.equal(published.length, 1);
  const structuredRisk = published[0] as Record<string, unknown>;
  assert.equal(structuredRisk.event_id, "evt-risk-1");
  assert.equal(structuredRisk.impact_region, "US-CA");
  assert.equal(typeof structuredRisk.classification_id, "string");
});

test("uses primary classifier when confidence passes threshold", async () => {
  const primaryClassifier: RiskClassifier = {
    name: "primary-model-v1",
    async classify(signal) {
      return {
        event_id: signal.event_id,
        event_type: "NEWS",
        severity_level: 4,
        impact_region: signal.geographic_scope,
        expected_duration_hours: 36,
        classification_confidence: 0.92
      };
    }
  };

  const service = new RiskClassificationService({
    eventPublisher: {
      async publish(_stream, message) {
        return {
          id: "1-0",
          stream: EventStreams.CLASSIFIED_EVENTS,
          message,
          published_at_utc: new Date().toISOString()
        };
      }
    },
    primaryClassifier,
    confidenceThreshold: 0.7
  });

  const decision = await service.classifySignal(createSignal());
  assert.equal(decision.usedFallback, false);
  assert.equal(decision.structuredRisk.model_version, "primary-model-v1");
  assert.equal(decision.structuredRisk.classification_confidence, 0.92);
});

test("falls back when primary classifier confidence is below threshold", async () => {
  const primaryClassifier: RiskClassifier = {
    name: "primary-model-v1",
    async classify(signal) {
      return {
        event_id: signal.event_id,
        event_type: "NEWS",
        severity_level: 2,
        impact_region: signal.geographic_scope,
        expected_duration_hours: 12,
        classification_confidence: 0.4
      };
    }
  };

  const service = new RiskClassificationService({
    eventPublisher: {
      async publish(_stream, message) {
        return {
          id: "1-0",
          stream: EventStreams.CLASSIFIED_EVENTS,
          message,
          published_at_utc: new Date().toISOString()
        };
      }
    },
    primaryClassifier,
    fallbackClassifier: new RuleBasedRiskClassifier(),
    confidenceThreshold: 0.65
  });

  const decision = await service.classifySignal(createSignal());
  assert.equal(decision.usedFallback, true);
  assert.equal(decision.fallbackReason, "PRIMARY_FAILED_OR_LOW_CONFIDENCE");
  assert.ok(decision.structuredRisk.classification_confidence >= 0.65);
});

test("falls back when primary classifier throws", async () => {
  const primaryClassifier: RiskClassifier = {
    name: "primary-model-v1",
    async classify() {
      throw new Error("primary model unavailable");
    }
  };

  const service = new RiskClassificationService({
    eventPublisher: {
      async publish(_stream, message) {
        return {
          id: "1-0",
          stream: EventStreams.CLASSIFIED_EVENTS,
          message,
          published_at_utc: new Date().toISOString()
        };
      }
    },
    primaryClassifier
  });

  const decision = await service.classifySignal(createSignal());
  assert.equal(decision.usedFallback, true);
  assert.equal(decision.fallbackReason, "PRIMARY_FAILED_OR_LOW_CONFIDENCE");
});

test("retries classified-event publish on transient failures", async () => {
  let attempts = 0;
  const service = new RiskClassificationService({
    eventPublisher: {
      async publish(_stream, message) {
        attempts += 1;
        if (attempts < 3) {
          throw new Error("synthetic publish failure");
        }
        return {
          id: "1-0",
          stream: EventStreams.CLASSIFIED_EVENTS,
          message,
          published_at_utc: new Date().toISOString()
        };
      }
    },
    maxPublishAttempts: 3,
    retryDelayMs: 1
  });

  const decision = await service.classifyAndPublish(createSignal());
  assert.equal(attempts, 3);
  assert.equal(typeof decision.structuredRisk.classification_id, "string");
});
