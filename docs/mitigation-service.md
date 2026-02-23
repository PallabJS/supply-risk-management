# Mitigation Planning Service

## Purpose
Generate constrained and validated mitigation strategies.

## Allowed Action Schema

| Field | Type |
|-------|------|
| action_code | Enum |
| action_description | Text |
| execution_cost_estimate | Decimal |
| expected_risk_reduction | Decimal |
| execution_time_estimate_hours | Integer |

## Mitigation Plan Schema

| Field | Type |
|-------|------|
| mitigation_id | UUID |
| risk_id | UUID |
| recommended_actions | JSON |
| validation_status | Enum |
| mitigation_confidence | Decimal |
| requires_human_review | Boolean |
| generated_at_utc | ISO Timestamp |

## Validation Controls
- Supplier existence check
- Inventory feasibility
- Logistics constraints
