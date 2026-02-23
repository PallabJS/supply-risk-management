# Signal Ingestion Service

## Purpose
Continuously collect and normalize global external signals for downstream processing.

## Responsibilities
- Poll public weather APIs
- Parse RSS feeds
- Accept manual simulation inputs
- Normalize into unified schema
- Publish to Event Bus

## External Signal Schema

| Field | Type | Description |
|-------|------|-------------|
| event_id | UUID | Unique identifier |
| source_type | Enum | WEATHER, NEWS, SOCIAL, TRAFFIC |
| raw_content | Text | Original content |
| source_reference | Text | Source link |
| geographic_scope | Text | Region |
| timestamp_utc | ISO Timestamp | Detection time |
| ingestion_time_utc | ISO Timestamp | Ingestion time |
| signal_confidence | Decimal (0–1) | Initial confidence |

## Operational Guarantees
- At-least-once delivery
- Deduplication
- Retry on failure
