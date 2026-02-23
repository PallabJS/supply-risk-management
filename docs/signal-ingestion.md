# Signal Ingestion Service

## Purpose
Continuously collect and normalize external signals, deduplicate safely, and publish durably to the event bus.

Current production path publishes to Redis Streams.

---

## Implemented Files

| Responsibility | File |
|---------------|------|
| Main orchestration | `src/modules/signal-ingestion/service.ts` |
| Streaming worker wrapper | `src/modules/signal-ingestion/worker.ts` |
| Worker entrypoint | `src/workers/signal-ingestion-worker.ts` |
| Schema normalization/validation | `src/modules/signal-ingestion/schema.ts` |
| Source type constants | `src/modules/signal-ingestion/constants.ts` |
| Retry utility | `src/modules/signal-ingestion/retry.ts` |
| Manual simulation source | `src/modules/signal-ingestion/sources/manual-simulation-source.ts` |
| NOAA weather connector | `src/connectors/weather-noaa/` |
| NOAA connector worker entrypoint | `src/workers/weather-connector-worker.ts` |
| Type contracts | `src/modules/signal-ingestion/types.ts` |
| HTTP input gateway adapter | `src/adapters/signal-ingestion-gateway/` |

---

## External Signal Schema

| Field | Type | Description |
|-------|------|-------------|
| `event_id` | UUID/Text | Unique id for dedup/idempotency |
| `source_type` | Enum | `WEATHER`, `NEWS`, `SOCIAL`, `TRAFFIC` |
| `raw_content` | Text | Original normalized content |
| `source_reference` | Text | Source url/reference |
| `geographic_scope` | Text | Region code or region label |
| `timestamp_utc` | ISO Timestamp | Detection timestamp |
| `ingestion_time_utc` | ISO Timestamp | Ingestion processing timestamp |
| `signal_confidence` | Decimal (0-1) | Initial confidence |

---

## Runtime Behavior
1. Receive raw events via `POST /signals` (gateway) or polling sources.
2. NOAA connector (`connector:weather-noaa`) polls active weather alerts and publishes raw weather events.
3. Publish raw payloads durably into `raw-input-signals`.
4. Ingestion worker consumes `raw-input-signals`.
5. Normalize each raw signal into canonical schema.
6. Queue non-duplicate events for publish.
7. For each queued event, reserve idempotency key (`markIfFirstSeen`).
8. Publish normalized signals to `external-signals` with retry policy.
9. On publish failure, clear idempotency key and keep event pending.

---

## Deduplication and Idempotency
- In-memory duplicate checks still prevent same-cycle duplicates.
- Cross-restart and cross-replica dedup is enforced by Redis idempotency store.
- Idempotency TTL defaults to `REDIS_DEDUP_TTL_SECONDS=604800` (7 days).

---

## Operational Guarantees (Current)
- At-least-once publish attempt behavior.
- Retry with exponential backoff on transient publish failure.
- Restart-safe duplicate prevention (with Redis idempotency).
- Deterministic summary output:
  - `polled`
  - `queued`
  - `skipped_deduplicated`
  - `published`
  - `failed`
  - `pending`

---

## Development Demo Flow
The app demo service (`src/playground/manual-ingestion-demo-service.ts`) does the following:
- Connects to Redis.
- Seeds a manual signal source.
- Runs one ingestion cycle.
- Reads and prints recent persisted records from `external-signals`.

This behavior is intentionally production-aligned (no runtime in-memory fallback).

Streaming demo path:
1. Start all services: `npm run services:all`
2. Submit sample input: `npm run producer:sample-input`
3. Inspect stream outputs with your stream inspector command.

Automated weather stream path:
1. Configure NOAA connector env fields in `.env`.
2. Run `npm run connector:weather-noaa`.
3. Weather alerts automatically flow into `raw-input-signals`.

## HTTP Gateway Contract
Accepted endpoints:
- `POST /signals`
- `POST /v1/signals`

Accepted request payloads:
- Single signal object
- `{ "signal": { ... } }`
- `{ "signals": [ ... ] }`
- Array of signal objects

Response:
- `202` with accepted count and raw stream ids.

Security:
- Optional bearer token via `SIGNAL_INGESTION_GATEWAY_AUTH_TOKEN`.
