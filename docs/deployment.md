# Deployment & Scalability

## Current Runtime Model
- Node.js TypeScript backend.
- Redis Streams as mandatory event backbone.
- Docker Compose for local Redis runtime.
- Fail-fast startup if Redis connectivity is unavailable.

---

## Environment Configuration

Required:
- `REDIS_URL`

Defaults:
- `REDIS_STREAM_MAXLEN=100000`
- `REDIS_DEDUP_TTL_SECONDS=604800`
- `REDIS_CONSUMER_BLOCK_MS=5000`
- `REDIS_CONSUMER_BATCH_SIZE=50`
- `REDIS_MAX_DELIVERIES=5`
- `DEV_STREAM_PRINT_LIMIT=25`

Reference file: `.env.example`

---

## Local Infra Commands

| Command | Purpose |
|--------|---------|
| `npm run infra:up` | Start Redis container |
| `npm run infra:logs` | Tail Redis logs |
| `npm run infra:down` | Stop and remove local containers |

Compose file: `docker-compose.yml`

---

## Build and Run Commands

| Command | Purpose |
|--------|---------|
| `npm run dev` | Run app directly from TS sources |
| `npm run build` | Compile TS to `dist/` |
| `npm start` | Build then run compiled app |
| `npm run typecheck` | Strict TS type validation |
| `npm test` | Unit tests only |
| `npm run test:integration` | Redis-backed integration tests |

---

## Testing Strategy
- Unit tests are fast and isolated from Redis runtime.
- Integration tests validate durable queue semantics and worker reliability using real Redis.
- CI recommendation:
  - Always run `typecheck` + unit tests.
  - Run integration tests when Redis service is provisioned.

---

## Production Evolution Path
Near-term production baseline:
- Redis Streams with consumer groups and DLQ.
- Structured logs and service-level health checks.

Future scaling path:
- Kafka for larger retention and throughput needs.
- Containerized microservices per module.
- Kubernetes scheduling and autoscaling.
