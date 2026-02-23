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
- `RISK_CLASSIFICATION_PRIMARY_CLASSIFIER=RULE_BASED`
- `RISK_CLASSIFICATION_CONSUMER_GROUP=risk-classification-group`
- `RISK_CLASSIFICATION_CONSUMER_NAME=` (optional)
- `RISK_CLASSIFICATION_CONFIDENCE_THRESHOLD=0.65`
- `RISK_CLASSIFICATION_MODEL_VERSION=risk-classification-v1`
- `RISK_CLASSIFICATION_LLM_ENDPOINT=` (required when classifier mode is `LLM`)
- `RISK_CLASSIFICATION_LLM_API_KEY=` (optional)
- `RISK_CLASSIFICATION_LLM_MODEL=local-risk-llm-v1`
- `RISK_CLASSIFICATION_LLM_TIMEOUT_MS=8000`
- `RISK_CLASSIFICATION_LLM_MAX_CONCURRENCY=8`
- `RISK_CLASSIFICATION_LLM_MAX_QUEUE_SIZE=500`
- `RISK_CLASSIFICATION_LLM_MAX_RETRIES=2`
- `RISK_CLASSIFICATION_LLM_RETRY_BASE_DELAY_MS=150`
- `LLM_ADAPTER_HOST=127.0.0.1`
- `LLM_ADAPTER_PORT=8088`
- `LLM_ADAPTER_UPSTREAM_BASE_URL=http://localhost:11434`
- `LLM_ADAPTER_UPSTREAM_API_KEY=` (optional)
- `LLM_ADAPTER_DEFAULT_MODEL=llama3.1:8b-instruct`
- `LLM_ADAPTER_REQUEST_TIMEOUT_MS=15000`
- `LLM_ADAPTER_MAX_CONCURRENCY=8`
- `LLM_ADAPTER_MAX_QUEUE_SIZE=500`
- `LLM_ADAPTER_MAX_REQUEST_BYTES=262144`
- `RISK_ENGINE_CONSUMER_GROUP=risk-engine-group`
- `RISK_ENGINE_CONSUMER_NAME=` (optional)
- `RISK_ENGINE_EVALUATION_VERSION=risk-engine-v1`
- `RISK_ENGINE_DAILY_REVENUE_BASELINE=250000`

Reference file: `.env.example`

Validation behavior:
- Startup fails fast when `RISK_CLASSIFICATION_PRIMARY_CLASSIFIER=LLM` and `RISK_CLASSIFICATION_LLM_ENDPOINT` is missing.

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
| `npm run adapter:risk-classification-llm` | Run local `/classify` adapter for OpenAI-compatible LLM backends |
| `npm run worker:risk-classification` | Run risk classification worker |
| `npm run worker:risk-engine` | Run risk engine worker |
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
