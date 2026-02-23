import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryEventBus } from "../../src/infrastructure/event-bus/in-memory-event-bus.js";
import { EventStreams } from "../../src/infrastructure/event-bus/streams.js";
import {
  ManualSimulationSource,
  SignalIngestionService,
  SourceTypes
} from "../../src/modules/signal-ingestion/index.js";
import type { EventPublisher } from "../../src/infrastructure/event-bus/types.js";
import type { ExternalSignal } from "../../src/modules/signal-ingestion/types.js";

test("normalizes and publishes a valid external signal", async () => {
  const eventBus = new InMemoryEventBus();
  const source = new ManualSimulationSource([
    {
      sourceType: SourceTypes.NEWS,
      content: "Factory labor strike expected tomorrow",
      sourceReference: "rss://feed/item-1",
      region: "US-TX",
      confidence: 0.74
    }
  ]);

  const service = new SignalIngestionService({
    sources: [source],
    eventBus,
    stream: EventStreams.EXTERNAL_SIGNALS
  });

  const summary = await service.runCycle();
  const records = eventBus.readStream<ExternalSignal>(
    EventStreams.EXTERNAL_SIGNALS
  );

  assert.equal(summary.polled, 1);
  assert.equal(summary.published, 1);
  assert.equal(summary.failed, 0);
  assert.equal(records.length, 1);

  const firstRecord = records[0];
  assert.ok(firstRecord);
  assert.equal(firstRecord.message.source_type, SourceTypes.NEWS);
  assert.match(firstRecord.message.event_id, /^[0-9a-f-]{36}$/i);
});

test("deduplicates repeated events by event_id", async () => {
  const eventBus = new InMemoryEventBus();
  const source = new ManualSimulationSource([
    {
      event_id: "evt-123",
      source_type: SourceTypes.TRAFFIC,
      raw_content: "Road closure near supplier hub",
      source_reference: "manual://sim/road-1",
      geographic_scope: "US-CA",
      timestamp_utc: new Date().toISOString(),
      signal_confidence: 0.7
    }
  ]);

  const service = new SignalIngestionService({
    sources: [source],
    eventBus
  });

  await service.runCycle();
  source.enqueue({
    event_id: "evt-123",
    source_type: SourceTypes.TRAFFIC,
    raw_content: "Road closure near supplier hub",
    source_reference: "manual://sim/road-1",
    geographic_scope: "US-CA",
    timestamp_utc: new Date().toISOString(),
    signal_confidence: 0.7
  });
  const secondSummary = await service.runCycle();

  assert.equal(secondSummary.skipped_deduplicated, 1);
  assert.equal(eventBus.readStream(EventStreams.EXTERNAL_SIGNALS).length, 1);
});

test("retries transient publish failures and succeeds", async () => {
  const eventBus = new InMemoryEventBus();
  eventBus.setPublishFailureBudget(EventStreams.EXTERNAL_SIGNALS, 2);

  const source = new ManualSimulationSource([
    {
      event_id: "evt-retry-success",
      source_type: SourceTypes.WEATHER,
      raw_content: "Cyclone watch issued",
      source_reference: "weather://alert/123",
      geographic_scope: "US-FL",
      timestamp_utc: new Date().toISOString(),
      signal_confidence: 0.9
    }
  ]);

  const service = new SignalIngestionService({
    sources: [source],
    eventBus,
    maxPublishAttempts: 4,
    retryDelayMs: 1
  });

  const summary = await service.runCycle();
  const records = eventBus.readStream<ExternalSignal>(
    EventStreams.EXTERNAL_SIGNALS
  );

  assert.equal(summary.published, 1);
  assert.equal(summary.failed, 0);
  assert.equal(summary.pending, 0);
  assert.equal(records.length, 1);
});

test("keeps failed events pending to satisfy at-least-once delivery", async () => {
  const eventBus = new InMemoryEventBus();
  eventBus.setPublishFailureBudget(EventStreams.EXTERNAL_SIGNALS, 10);

  const source = new ManualSimulationSource([
    {
      event_id: "evt-pending-1",
      source_type: SourceTypes.NEWS,
      raw_content: "Unexpected customs delay",
      source_reference: "news://item/987",
      geographic_scope: "US-NY",
      timestamp_utc: new Date().toISOString(),
      signal_confidence: 0.82
    }
  ]);

  const service = new SignalIngestionService({
    sources: [source],
    eventBus,
    maxPublishAttempts: 3,
    retryDelayMs: 1
  });

  const firstSummary = await service.runCycle();
  assert.equal(firstSummary.published, 0);
  assert.equal(firstSummary.failed, 1);
  assert.equal(firstSummary.pending, 1);
  assert.equal(service.getPendingCount(), 1);

  eventBus.setPublishFailureBudget(EventStreams.EXTERNAL_SIGNALS, 0);
  const secondSummary = await service.runCycle();

  assert.equal(secondSummary.polled, 0);
  assert.equal(secondSummary.published, 1);
  assert.equal(secondSummary.failed, 0);
  assert.equal(secondSummary.pending, 0);
  assert.equal(eventBus.readStream(EventStreams.EXTERNAL_SIGNALS).length, 1);
});

test("skips publish when idempotency store marks event as duplicate", async () => {
  const source = new ManualSimulationSource([
    {
      event_id: "evt-duplicate",
      source_type: SourceTypes.NEWS,
      raw_content: "Duplicate signal",
      source_reference: "manual://duplicate",
      geographic_scope: "US-TX",
      timestamp_utc: new Date().toISOString(),
      signal_confidence: 0.8
    }
  ]);

  let publishCalls = 0;
  const eventBus: EventPublisher = {
    async publish() {
      publishCalls += 1;
      throw new Error("publish should not be called");
    }
  };

  const idempotencyStore = {
    async markIfFirstSeen() {
      return false;
    },
    async clear() {}
  };

  const service = new SignalIngestionService({
    sources: [source],
    eventBus,
    idempotencyStore
  });

  const summary = await service.runCycle();
  assert.equal(summary.published, 0);
  assert.equal(summary.skipped_deduplicated, 1);
  assert.equal(summary.failed, 0);
  assert.equal(publishCalls, 0);
});

test("clears idempotency key when publish fails", async () => {
  const source = new ManualSimulationSource([
    {
      event_id: "evt-clear-1",
      source_type: SourceTypes.NEWS,
      raw_content: "Failure scenario",
      source_reference: "manual://failure",
      geographic_scope: "US-NY",
      timestamp_utc: new Date().toISOString(),
      signal_confidence: 0.7
    }
  ]);

  let clearCalls = 0;
  const eventBus: EventPublisher = {
    async publish() {
      throw new Error("synthetic publish failure");
    }
  };

  const idempotencyStore = {
    async markIfFirstSeen() {
      return true;
    },
    async clear() {
      clearCalls += 1;
    }
  };

  const service = new SignalIngestionService({
    sources: [source],
    eventBus,
    idempotencyStore,
    maxPublishAttempts: 1,
    retryDelayMs: 1
  });

  const summary = await service.runCycle();
  assert.equal(summary.failed, 1);
  assert.equal(summary.pending, 1);
  assert.equal(clearCalls, 1);
});

test("ingests raw signals directly for stream-consumer workflows", async () => {
  const eventBus = new InMemoryEventBus();
  const service = new SignalIngestionService({
    sources: [],
    eventBus
  });

  const summary = await service.ingestSignals([
    {
      sourceType: SourceTypes.SOCIAL,
      content: "Unverified post reports supplier outage",
      sourceReference: "social://thread/1122",
      region: "US-WA",
      confidence: 0.58
    }
  ]);

  assert.equal(summary.polled, 1);
  assert.equal(summary.published, 1);
  assert.equal(summary.failed, 0);
  assert.equal(eventBus.readStream(EventStreams.EXTERNAL_SIGNALS).length, 1);
});
