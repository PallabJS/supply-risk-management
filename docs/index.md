# Global Watchtower

## Overview

Global Watchtower is a real-time, event-driven supply chain risk intelligence system.
It ingests external signals, classifies risk, computes business impact, generates mitigation plans, and notifies stakeholders.

This repository currently implements the **production-grade foundation** for:

- Signal ingestion
- Durable event bus on Redis Streams
- Deduplication and idempotency
- Consumer-group and DLQ primitives
- Risk classification with confidence gating and fallback
- Local OpenAI-compatible LLM adapter service for classification

---

## Current Architecture (Implemented)

```text
External Inputs (webhooks, vendor feeds, NOAA weather connector, manual adapters)
                |
                v
      Input Streaming Gateway
      - POST /signals
      - durable publish to raw-input-signals
                |
                v
      Signal Ingestion Worker + Service
      - consumes raw-input-signals
      - normalize, dedup, retry, publish
                |
                v
      Redis Streams Event Bus
      - raw-input-signals stream
      - external-signals stream
      - durable persisted history
      - consumer groups + ack
      - retry counters + DLQ
                |
                v
      Risk Classification Service
      - consumes external-signals
      - publishes classified-events
      - load-managed LLM primary + confidence gating + fallback classifier
                |
                v
      Dependency & Risk Engine
      - consumes classified-events
      - publishes risk-evaluations
      - deterministic scoring + explainable factors
                |
                v
      Remaining Downstream Services (planned)
```

---

## Repository Module Status

| Module                      | Status      | Notes                                                        |
| --------------------------- | ----------- | ------------------------------------------------------------ |
| Signal Ingestion Service    | Implemented | Gateway + worker path from `raw-input-signals` to `external-signals` |
| Event Bus Architecture      | Implemented | Redis Streams, consumer groups, DLQ, codecs                  |
| Risk Classification Service | Implemented | Load-managed LLM primary with confidence gating and fallback |
| Dependency & Risk Engine    | Implemented | Deterministic worker consumes `classified-events` and emits `risk-evaluations` |
| Mitigation Planning Service | Planned     | Will consume `risk-evaluations` and emit `mitigation-plans`  |
| Notification Service        | Planned     | Will consume risk/mitigation outputs and emit notifications  |
| Frontend Dashboard          | Planned     | Will read notification and risk outputs                      |

---

## Streams (Canonical Names)

| Stream              | Description                                     |
| ------------------- | ----------------------------------------------- |
| `raw-input-signals` | Durable intake stream for unnormalized signal payloads |
| `external-signals`  | Raw normalized ingestion events                 |
| `classified-events` | Structured risks (produced by risk classification) |
| `risk-evaluations`  | Deterministic risk outputs from risk engine      |
| `mitigation-plans`  | Validated mitigation actions (planned producer) |
| `notifications`     | Outbound alerts (planned producer)              |

---

## Key Runtime Guarantees (Current)

- Durable stream persistence in Redis.
- At-least-once semantics on ingestion publish with retry.
- Restart-safe deduplication using Redis idempotency keys.
- Bounded request concurrency and queue backpressure on LLM classification path.
- Dead-letter routing support for malformed/failed-consumption records.
- Fail-fast startup when Redis is unavailable or `REDIS_URL` is missing.

---

## Local Developer Workflow

1. Configure env from `.env.example`.
2. Start Redis: `npm run infra:up`.
3. Run input gateway: `npm run gateway:signal-ingestion`.
4. Run ingestion worker: `npm run worker:signal-ingestion`.
5. (Optional) Run weather connector: `npm run connector:weather-noaa`.
6. Run LLM adapter (LLM mode): `npm run adapter:risk-classification-llm`.
7. Run classification worker: `npm run worker:risk-classification`.
8. Run risk engine worker: `npm run worker:risk-engine`.
9. Send input events to `/signals` or run demo producer: `npm run producer:sample-input`.
10. Run unit tests: `npm test`.
11. Run integration tests: `npm run test:integration`.
12. Stop Redis: `npm run infra:down`.

---

## Documentation Map

- [Signal Ingestion Service](./signal-ingestion.md)
- [Event Bus Architecture](./event-bus.md)
- [Deployment & Scalability](./deployment.md)
- [Data Model & Schemas](./data-model.md)
- [Risk Classification Service](./risk-classification.md)
- [Dependency & Risk Engine](./risk-engine.md)
- [Mitigation Planning Service](./mitigation-service.md)
- [Notification Service](./notification-service.md)
- [Frontend Dashboard Architecture](./frontend-architecture.md)
