# Event Bus Architecture

## Purpose
Decouple services using asynchronous streaming.

## Streams

| Stream | Description |
|--------|------------|
| external-signals | Raw events |
| classified-events | Structured risks |
| risk-evaluations | Deterministic risk outputs |
| mitigation-plans | Validated mitigation |
| notifications | Outbound alerts |

## Design Principles
- Stateless workers
- Horizontal scalability
- Independent consumption
