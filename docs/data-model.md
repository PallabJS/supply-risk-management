# Core Data Model

## Domain Entities (Business Layer)

### Factory

| Field | Type |
|-------|------|
| `factory_id` | UUID |
| `name` | Text |
| `geographic_location` | Text |
| `operational_criticality_score` | Decimal |
| `primary_output_products` | JSON |
| `created_at` | ISO Timestamp |

### Supplier

| Field | Type |
|-------|------|
| `supplier_id` | UUID |
| `name` | Text |
| `location` | Text |
| `linked_factory_id` | UUID |
| `supply_category` | Text |
| `reliability_score` | Decimal |

### Inventory

| Field | Type |
|-------|------|
| `inventory_id` | UUID |
| `factory_id` | UUID |
| `sku_code` | Text |
| `coverage_days` | Integer |
| `safety_stock_level` | Integer |
| `last_updated_utc` | ISO Timestamp |

---

## Event-Bus Runtime Entities (Infrastructure Layer)

### EventRecord

| Field | Type | Description |
|------|------|-------------|
| `id` | Text | Redis stream message id (`ms-seq`) |
| `stream` | Text | Logical stream name |
| `message` | JSON | Typed payload |
| `published_at_utc` | ISO Timestamp | Producer-side publish timestamp |

### Redis Stream Fields

| Field | Type | Description |
|------|------|-------------|
| `payload` | JSON String | Serialized domain message |
| `published_at_utc` | ISO Timestamp | Written alongside payload |

---

## Operational Key Schema (Redis)

| Key Pattern | Purpose |
|------------|---------|
| `dedup:<stream>:<event_id>` | Restart-safe idempotency fence |
| `retry:<stream>:<message_id>` | Consumer retry counter |
| `<stream>.dlq` | Dead-letter stream for poisoned records |

These keys are infrastructure concerns and intentionally separate from domain tables.
