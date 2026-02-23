# Event Bus Architecture

## Purpose
Provide a durable, asynchronous backbone between independent services.

The current implementation uses **Redis Streams** as the production event bus.
Kafka remains a planned future upgrade path for higher scale/retention requirements.

---

## Implemented Components

| Component | File |
|----------|------|
| Event bus contracts | `src/infrastructure/event-bus/types.ts` |
| Redis Streams implementation | `src/infrastructure/event-bus/redis-stream-event-bus.ts` |
| Payload codec | `src/infrastructure/event-bus/codec.ts` |
| Idempotency store | `src/infrastructure/event-bus/redis-idempotency-store.ts` |
| Consumer worker loop | `src/infrastructure/event-bus/redis-stream-consumer-worker.ts` |
| Redis client/bootstrap | `src/infrastructure/redis/client.ts` |

In-memory bus still exists only for unit tests and explicit local fixtures.

---

## Stream Operations

| Capability | Redis Command |
|-----------|---------------|
| Publish | `XADD` |
| Read recent history | `XREVRANGE` |
| Create consumer group | `XGROUP CREATE ... MKSTREAM` |
| Consume as group member | `XREADGROUP` |
| Acknowledge processed message | `XACK` |
| Dead-letter publish | `XADD` to `<stream>.dlq` |

---

## Message Format

Each stream record stores fields:
- `payload`: JSON serialized business message
- `published_at_utc`: ISO timestamp

Decoded runtime shape:

```ts
{
  id: string;
  stream: string;
  message: TMessage;
  published_at_utc: string;
}
```

---

## Reliability Model
- Producer retries are handled at service layer.
- Ingestion dedup uses Redis key strategy: `dedup:<stream>:<event_id>`.
- Consumer retry keys: `retry:<stream>:<message_id>`.
- Messages exceeding max delivery attempts are moved to `<stream>.dlq`.
- Malformed payload records are routed to DLQ with decode metadata.

---

## Key Naming Conventions

| Type | Pattern |
|------|---------|
| Main stream | `<stream>` |
| Dead letter stream | `<stream>.dlq` |
| Dedup key | `dedup:<stream>:<event_id>` |
| Retry key | `retry:<stream>:<message_id>` |

---

## Consumer Group Handling
1. Ensure group exists via `ensureGroup`.
2. Consume pending entries first (`stream id = 0`) to recover in-flight work.
3. Consume new entries (`stream id = >`).
4. Ack on success.
5. Increment retry key on failure.
6. Route to DLQ and ack when retries exceed configured threshold.

---

## Defaults
- Max stream length: `REDIS_STREAM_MAXLEN=100000`
- Consumer block timeout: `REDIS_CONSUMER_BLOCK_MS=5000`
- Consumer batch size: `REDIS_CONSUMER_BATCH_SIZE=50`
- Max deliveries before DLQ: `REDIS_MAX_DELIVERIES=5`
