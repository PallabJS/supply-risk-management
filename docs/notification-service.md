# Notification Service

## Purpose
Deliver risk alerts via real-time and threshold-based channels.

## Notification Schema

| Field | Type |
|-------|------|
| notification_id | UUID |
| risk_id | UUID |
| factory_id | UUID |
| risk_level | Enum |
| summary | Text |
| mitigation_reference | UUID |
| notification_channel | Enum |
| delivered_at_utc | ISO Timestamp |

## Alert Triggers
- Risk level >= HIGH
- Revenue threshold exceeded
- Low mitigation confidence
