# Core Data Model

## Factory

| Field | Type |
|-------|------|
| factory_id | UUID |
| name | Text |
| geographic_location | Text |
| operational_criticality_score | Decimal |
| primary_output_products | JSON |
| created_at | ISO Timestamp |

## Supplier

| Field | Type |
|-------|------|
| supplier_id | UUID |
| name | Text |
| location | Text |
| linked_factory_id | UUID |
| supply_category | Text |
| reliability_score | Decimal |

## Inventory

| Field | Type |
|-------|------|
| inventory_id | UUID |
| factory_id | UUID |
| sku_code | Text |
| coverage_days | Integer |
| safety_stock_level | Integer |
| last_updated_utc | ISO Timestamp |
