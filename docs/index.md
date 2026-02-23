# Global Watchtower

## Overview

Global Watchtower is a real-time, event-driven supply chain risk intelligence system.
It ingests external signals, classifies risk, computes business impact, generates mitigation plans, and notifies stakeholders.

This repository currently implements the **production-grade foundation** for:

- Signal ingestion
- Durable event bus on Redis Streams
- Deduplication and idempotency
- Consumer-group and DLQ primitives

---

## Current Architecture (Implemented)

```text
External Inputs (manual/weather/news adapters)
                |
                v
      Signal Ingestion Service
  (normalize, dedup, retry, publish)
                |
                v
      Redis Streams Event Bus
      - external-signals stream
      - durable persisted history
      - consumer groups + ack
      - retry counters + DLQ
                |
                v
      Downstream Services (planned)
```

---

## Repository Module Status

| Module                      | Status      | Notes                                                        |
| --------------------------- | ----------- | ------------------------------------------------------------ |
| Signal Ingestion Service    | Implemented | Production publish path via Redis Streams                    |
| Event Bus Architecture      | Implemented | Redis Streams, consumer groups, DLQ, codecs                  |
| Risk Classification Service | Planned     | Will consume `external-signals` and emit `classified-events` |
| Dependency & Risk Engine    | Planned     | Will consume `classified-events` and emit `risk-evaluations` |
| Mitigation Planning Service | Planned     | Will consume `risk-evaluations` and emit `mitigation-plans`  |
| Notification Service        | Planned     | Will consume risk/mitigation outputs and emit notifications  |
| Frontend Dashboard          | Planned     | Will read notification and risk outputs                      |

---

## Streams (Canonical Names)

| Stream              | Description                                     |
| ------------------- | ----------------------------------------------- |
| `external-signals`  | Raw normalized ingestion events                 |
| `classified-events` | Structured risks (planned producer)             |
| `risk-evaluations`  | Deterministic risk outputs (planned producer)   |
| `mitigation-plans`  | Validated mitigation actions (planned producer) |
| `notifications`     | Outbound alerts (planned producer)              |

---

## Key Runtime Guarantees (Current)

- Durable stream persistence in Redis.
- At-least-once semantics on ingestion publish with retry.
- Restart-safe deduplication using Redis idempotency keys.
- Dead-letter routing support for malformed/failed-consumption records.
- Fail-fast startup when Redis is unavailable or `REDIS_URL` is missing.

---

## Local Developer Workflow

1. Configure env from `.env.example`.
2. Start Redis: `npm run infra:up`.
3. Run app: `npm run dev`.
4. Run unit tests: `npm test`.
5. Run integration tests: `npm run test:integration`.
6. Stop Redis: `npm run infra:down`.

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
