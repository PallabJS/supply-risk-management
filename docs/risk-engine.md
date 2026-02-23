# Dependency & Risk Engine

## Status
Implemented (production worker + deterministic evaluator baseline).

## Purpose
Compute operational impact from classified risk signals using deterministic and explainable scoring logic.

Input stream:
- `classified-events`

Output stream:
- `risk-evaluations`

---

## Implemented Files

| Responsibility | File |
|---------------|------|
| Risk evaluation service orchestration | `src/modules/risk-engine/service.ts` |
| Deterministic scoring evaluator | `src/modules/risk-engine/deterministic-evaluator.ts` |
| Risk evaluation schema normalization/validation | `src/modules/risk-engine/schema.ts` |
| Risk level constants | `src/modules/risk-engine/constants.ts` |
| Redis consumer worker wrapper | `src/modules/risk-engine/worker.ts` |
| Worker entrypoint | `src/workers/risk-engine-worker.ts` |

---

## Risk Evaluation Schema

| Field | Type |
|-------|------|
| `risk_id` | UUID/Text |
| `classification_id` | UUID/Text |
| `factory_id` | UUID/Text |
| `supplier_id` | UUID/Text |
| `inventory_coverage_days` | Integer |
| `operational_criticality` | Decimal (0-1) |
| `severity_weight` | Decimal (0-1) |
| `risk_score` | Decimal (0-1) |
| `risk_level` | Enum (`LOW`,`MEDIUM`,`HIGH`,`CRITICAL`) |
| `estimated_revenue_exposure` | Decimal |
| `evaluation_timestamp_utc` | ISO Timestamp |

---

## Scoring Model (Current)

Risk score is deterministic and bounded to `[0,1]` using weighted factors:
- `severity_weight` from classification severity.
- duration factor from `expected_duration_hours`.
- `operational_criticality` (provided value or deterministic fallback).
- classification confidence.
- inventory pressure derived from `inventory_coverage_days`.

Current weighted blend:
- severity: `35%`
- duration: `20%`
- operational criticality: `20%`
- confidence: `15%`
- inventory pressure: `10%`

Risk level mapping:
- `CRITICAL` >= `0.85`
- `HIGH` >= `0.65`
- `MEDIUM` >= `0.35`
- otherwise `LOW`

---

## Reliability Controls (Current)
- Schema enforcement before publish.
- Deterministic `risk_id` derivation from classification identity + evaluation version.
- Publish retry logic on `risk-evaluations` stream writes.
- Worker-level retry tracking and DLQ routing via event-bus infrastructure.

---

## Integration Contract
The worker consumes `EventRecord<StructuredRisk>` from `classified-events` and publishes typed risk-evaluation payloads to `risk-evaluations`.

Local run command:
- `npm run worker:risk-engine`
