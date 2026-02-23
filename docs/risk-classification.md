# Risk Classification Service

## Status
Implemented (production worker + load-managed LLM primary + fallback baseline).

## Purpose
Convert raw external signals into structured risk indicators using a local LLM with reliability controls.

Input stream:
- `external-signals`

Output stream:
- `classified-events`

---

## Implemented Files

| Responsibility | File |
|---------------|------|
| Classification service orchestration | `src/modules/risk-classification/service.ts` |
| Structured risk schema enforcement | `src/modules/risk-classification/schema.ts` |
| Event type constants | `src/modules/risk-classification/constants.ts` |
| Rule-based fallback classifier | `src/modules/risk-classification/fallback-rule-classifier.ts` |
| Load-managed local LLM classifier | `src/modules/risk-classification/local-llm-classifier.ts` |
| OpenAI-compatible local adapter server (`/classify`) | `src/adapters/risk-classification-llm-adapter/` |
| Redis consumer worker wrapper | `src/modules/risk-classification/worker.ts` |
| Worker entrypoint | `src/workers/risk-classification-worker.ts` |

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

## Reliability Controls (Current)
- JSON schema enforcement.
- Confidence gating on primary classifier outputs.
- Bounded LLM request concurrency and bounded queue for backpressure.
- LLM timeout + retry on transient failures.
- Publish retry logic on classified-event stream writes.
- Fallback rule-based classifier when primary is absent/fails/low-confidence.
- Worker-level retry tracking and DLQ routing via event-bus infrastructure.

---

## Primary Classifier Modes

`RISK_CLASSIFICATION_PRIMARY_CLASSIFIER` controls runtime behavior:
- `RULE_BASED` (default): skip LLM and use deterministic fallback only.
- `LLM`: use `LocalLlmRiskClassifier` as primary, fallback to rule-based on timeout/error/low confidence.

When `LLM` mode is enabled, `RISK_CLASSIFICATION_LLM_ENDPOINT` is required at startup.

Primary LLM load controls:
- `RISK_CLASSIFICATION_LLM_MAX_CONCURRENCY`
- `RISK_CLASSIFICATION_LLM_MAX_QUEUE_SIZE`
- `RISK_CLASSIFICATION_LLM_TIMEOUT_MS`
- `RISK_CLASSIFICATION_LLM_MAX_RETRIES`
- `RISK_CLASSIFICATION_LLM_RETRY_BASE_DELAY_MS`

Expected LLM endpoint request shape:
```json
{
  "model": "llama3.1:8b",
  "response_format": "structured-risk-draft-v1",
  "signal": { "...ExternalSignal fields..." },
  "instructions": "Classify supply-chain risk and return only JSON fields for StructuredRiskDraft."
}
```

Accepted response shapes:
- `{ "structured_risk": { ...StructuredRiskDraft } }`
- `{ "result": { ...StructuredRiskDraft } }`
- `{ "data": { ...StructuredRiskDraft } }`
- direct `{ ...StructuredRiskDraft }`

---

## Integration Contract
The worker consumes `EventRecord<ExternalSignal>` semantics from the event bus and publishes typed structured-risk payloads using contracts in `docs/event-bus.md`.

Local run command:
- `npm run adapter:risk-classification-llm`
- `npm run worker:risk-classification`
