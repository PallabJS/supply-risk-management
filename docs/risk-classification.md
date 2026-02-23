# Risk Classification Service

## Purpose
Convert raw signals into structured risk indicators using local LLM.

## Structured Risk Schema

| Field | Type |
|-------|------|
| classification_id | UUID |
| event_id | UUID |
| event_type | Enum |
| severity_level | Integer (1–5) |
| impact_region | Text |
| expected_duration_hours | Integer |
| classification_confidence | Decimal (0–1) |
| model_version | Text |
| processed_at_utc | ISO Timestamp |

## Reliability Controls
- JSON schema enforcement
- Confidence gating
- Retry logic
- Fallback rule-based classifier
