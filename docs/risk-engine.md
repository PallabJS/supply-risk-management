# Dependency & Risk Engine

## Purpose
Compute operational impact using deterministic logic.

## Risk Evaluation Schema

| Field | Type |
|-------|------|
| risk_id | UUID |
| classification_id | UUID |
| factory_id | UUID |
| supplier_id | UUID |
| inventory_coverage_days | Integer |
| operational_criticality | Decimal |
| severity_weight | Decimal |
| risk_score | Decimal (0–1) |
| risk_level | Enum |
| estimated_revenue_exposure | Decimal |
| evaluation_timestamp_utc | ISO Timestamp |

## Characteristics
- Fully deterministic
- Explainable calculations
- Auditable outputs
