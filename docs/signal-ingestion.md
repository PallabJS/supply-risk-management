# Signal Ingestion Service

## Purpose
Continuously collect and normalize external signals, deduplicate safely, and publish durably to the event bus.

Current production path publishes to Redis Streams.

---

## Implemented Files

| Responsibility | File |
|---------------|------|
| Main orchestration | `src/modules/signal-ingestion/service.ts` |
| Schema normalization/validation | `src/modules/signal-ingestion/schema.ts` |
| Source type constants | `src/modules/signal-ingestion/constants.ts` |
| Retry utility | `src/modules/signal-ingestion/retry.ts` |
| Manual simulation source | `src/modules/signal-ingestion/sources/manual-simulation-source.ts` |
| Type contracts | `src/modules/signal-ingestion/types.ts` |

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
1. Poll all configured sources.
2. Normalize each raw signal into canonical schema.
3. Queue non-duplicate events for publish.
4. For each queued event, reserve idempotency key (`markIfFirstSeen`).
5. Publish with retry policy.
6. On publish failure, clear idempotency key and keep event pending.

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
