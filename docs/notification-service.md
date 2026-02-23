# Notification Service

## Status
Planned (not implemented in code yet).

## Purpose
Deliver risk alerts through real-time and threshold-based notification channels.

Primary inputs (planned):
- `risk-evaluations`
- `mitigation-plans`

Output stream (planned):
- `notifications`

---

## Notification Schema

| Field | Type |
|-------|------|
| `notification_id` | UUID |
| `risk_id` | UUID |
| `factory_id` | UUID |
| `risk_level` | Enum |
| `summary` | Text |
| `mitigation_reference` | UUID |
| `notification_channel` | Enum |
| `delivered_at_utc` | ISO Timestamp |

---

## Alert Triggers (Planned)
- `risk_level >= HIGH`
- Revenue exposure threshold exceeded
- Low mitigation confidence
- Manual escalation policies
