# Risk Classification Service

## Status
Planned (not implemented in code yet).

## Purpose
Convert raw external signals into structured risk indicators using a local LLM with reliability controls.

Input stream (planned):
- `external-signals`

Output stream (planned):
- `classified-events`

---

## Structured Risk Schema

| Field | Type |
|-------|------|
| `classification_id` | UUID |
| `event_id` | UUID/Text |
| `event_type` | Enum |
| `severity_level` | Integer (1-5) |
| `impact_region` | Text |
| `expected_duration_hours` | Integer |
| `classification_confidence` | Decimal (0-1) |
| `model_version` | Text |
| `processed_at_utc` | ISO Timestamp |

---

## Reliability Controls (Planned)
- JSON schema enforcement.
- Confidence gating.
- Retry logic.
- Fallback rule-based classifier.

---

## Integration Contract
The service should consume `EventRecord<ExternalSignal>` semantics from the event bus and publish typed risk payloads using the same event-bus contracts documented in `docs/event-bus.md`.
