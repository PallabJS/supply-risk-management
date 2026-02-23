# Connector Framework Guide

## Overview

The **Connector Framework** provides a scalable, plug-and-play architecture for ingesting data from up to ~100+ external sources. Each connector is independent, configurable, and can be deployed as a separate service.

## Quick Start

### Run a Single Connector

```bash
# Start Redis first
npm run infra:up

# Run NOAA weather connector
npm run connector:run:weather-noaa

# Or use environment variable
CONNECTOR_NAME=weather-noaa npm run connector:run
```

### Run All Enabled Connectors

```bash
npm run connectors:all
```

Each connector runs as an independent child process with automatic restart on failure.

---

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│         Connector Config (connectors.json or ENV)           │
└──────────────┬──────────────────────────────────────────────┘
               │
               v
┌─────────────────────────────────────────────────────────────┐
│         Registry Loader & Environment Substitution          │
└──────────────┬──────────────────────────────────────────────┘
               │
               v
┌─────────────────────────────────────────────────────────────┐
│         Universal Connector Worker (single process)         │
│  - Lease management (distributed coordination)              │
│  - Hot-reload support (SIGHUP)                              │
│  - Graceful shutdown                                        │
└──────────────┬──────────────────────────────────────────────┘
               │
               v
┌─────────────────────────────────────────────────────────────┐
│         Connector Factory & Type Registration               │
└──────────────┬──────────────────────────────────────────────┘
               │
               v
┌─────────────────────────────────────────────────────────────┐
│    [NOAA] [JIRA] [GitHub] [DataDog] [etc...]               │
│    Each connector plugin with its own client logic          │
└──────────────┬──────────────────────────────────────────────┘
               │
               v
┌─────────────────────────────────────────────────────────────┐
│    Redis Streams (raw-input-signals)                        │
│    + State Store (connector:state:*)                        │
│    + Metrics (metrics:connector:*)                          │
│    + Leases (lease:*)                                       │
└─────────────────────────────────────────────────────────────┘
```

### Key Abstractions

1. **ConnectorConfig**: Universal configuration for all connectors
   - name, type, enabled, pollIntervalMs, requestTimeoutMs, maxRetries
   - Optional: outputStream, leaseTtlSeconds, retryConfig
   - providerConfig: Connector-specific fields (baseUrl, apiToken, etc.)

2. **ConnectorRegistry**: Central registry of all connectors
   - In-memory map with validation
   - Loaded from JSON file or environment variables

3. **PollingConnector**: Base interface
   - Single method: `poll(): Promise<ConnectorPollSummary>`
   - Returns: { fetched, published, skipped_unchanged, failed, [key]: unknown }

4. **UniversalPollingConnector**: Base class for all connectors
   - Handles: fetch → detect changes → transform → publish → save state
   - Generic types: `<TProvider, TRawData, TSignal>`

5. **ConnectorStateStore**: Persistent state across polls
   - Redis-backed: key pattern `connector:state:{name}`
   - Tracks: etag, lastModified, cursors, etc.

6. **ConnectorLeaseManager**: Distributed coordination
   - Redis-backed: key pattern `lease:{name}`
   - Ensures only one instance runs per connector
   - Auto-expires on instance crash (TTL-based)

---

## Configuration

### Option 1: JSON File (Recommended for Production)

**File**: `connectors.json`

```json
{
  "connectors": [
    {
      "name": "weather-noaa",
      "type": "NOAA_WEATHER",
      "enabled": true,
      "pollIntervalMs": 60000,
      "requestTimeoutMs": 10000,
      "maxRetries": 2,
      "outputStream": "raw-input-signals",
      "leaseTtlSeconds": 30,
      "retryConfig": {
        "baseDelayMs": 150,
        "maxDelayMs": 10000,
        "jitterRatio": 0.1
      },
      "providerConfig": {
        "baseUrl": "https://api.weather.gov",
        "alertsPath": "/alerts/active",
        "area": "CA,OR",
        "severity": "Severe,Extreme"
      }
    },
    {
      "name": "jira-prod",
      "type": "JIRA",
      "enabled": true,
      "pollIntervalMs": 300000,
      "requestTimeoutMs": 15000,
      "maxRetries": 3,
      "providerConfig": {
        "baseUrl": "${JIRA_BASE_URL}",
        "apiToken": "${JIRA_API_TOKEN}",
        "jql": "project = SEC AND status = Open"
      }
    }
  ]
}
```

**Environment Variables**:

- `CONNECTORS_CONFIG_PATH=/path/to/connectors.json`

**Feature**: ENV variable substitution

- Pattern: `${VAR_NAME}` in providerConfig
- Resolved at load time from process.env
- Required variables must be set or startup fails

### Option 2: Environment Variables (Development)

```bash
export ENABLED_CONNECTORS=weather-noaa,jira-prod

# Universal fields
export CONNECTOR_WEATHER_NOAA_TYPE=NOAA_WEATHER
export CONNECTOR_WEATHER_NOAA_POLL_INTERVAL_MS=60000
export CONNECTOR_WEATHER_NOAA_REQUEST_TIMEOUT_MS=10000
export CONNECTOR_WEATHER_NOAA_MAX_RETRIES=2

# Provider-specific fields (snake_case → camelCase conversion)
export CONNECTOR_WEATHER_NOAA_BASE_URL=https://api.weather.gov
export CONNECTOR_WEATHER_NOAA_ALERTS_PATH=/alerts/active
export CONNECTOR_WEATHER_NOAA_AREA=CA,OR
export CONNECTOR_WEATHER_NOAA_SEVERITY=Severe,Extreme
```

---

## Implementing a New Connector

### Step 1: Create the Connector Module

**File**: `src/connectors/jira/index.ts`

```typescript
import { JiraClient } from "./client.js";
import { toRawSignal, buildVersionHash } from "./schema.js";
import { UniversalPollingConnector } from "../framework/universal-polling-connector.js";
import type { ConnectorConfig, PollingConnector } from "../framework/types.js";
import type { ConnectorFactoryOptions } from "../framework/connector-factory.js";

export function createJiraConnector(
  name: string,
  config: ConnectorConfig,
  options: ConnectorFactoryOptions,
): PollingConnector {
  const providerConfig = config.providerConfig as JiraProviderConfig;

  // Validate required config
  if (!providerConfig.baseUrl || typeof providerConfig.baseUrl !== "string") {
    throw new Error(`JIRA connector ${name}: baseUrl is required`);
  }

  const client = new JiraClient({
    baseUrl: providerConfig.baseUrl,
    apiToken: providerConfig.apiToken as string,
    timeout: config.requestTimeoutMs,
  });

  return new UniversalPollingConnector({
    name,
    config,
    provider: client,
    fetcher: async (c) => {
      const issues = await c.searchIssues(providerConfig.jql as string);
      return { items: issues };
    },
    transformer: toRawSignal,
    changeDetector: buildVersionHash,
    eventPublisher: options.eventBus,
    stateStore: options.stateStore,
    logger: options.logger,
  });
}

interface JiraProviderConfig extends Record<string, unknown> {
  baseUrl: string;
  apiToken?: string;
  jql?: string;
}
```

### Step 2: Register the Connector

**File**: `src/connectors/framework/built-in-connectors.ts`

```typescript
import { registerConnector } from "./connector-factory.js";
import { createJiraConnector } from "../jira/index.js";

export function registerBuiltInConnectors(): void {
  registerConnector("NOAA_WEATHER", createNoaaWeatherConnector);
  registerConnector("JIRA", createJiraConnector); // ← ADD THIS
}
```

### Step 3: Add to Configuration

**File**: `connectors.json`

```json
{
  "connectors": [
    {
      "name": "jira-prod",
      "type": "JIRA",
      "enabled": true,
      "pollIntervalMs": 300000,
      "requestTimeoutMs": 15000,
      "maxRetries": 3,
      "providerConfig": {
        "baseUrl": "${JIRA_BASE_URL}",
        "apiToken": "${JIRA_API_TOKEN}",
        "jql": "project = SEC AND status = Open"
      }
    }
  ]
}
```

### Step 4: Run the Connector

```bash
# Set secrets
export JIRA_BASE_URL=https://company.atlassian.net
export JIRA_API_TOKEN=your-token-here

# Run
npm run connector:run:jira-prod
# or
CONNECTOR_NAME=jira-prod npm run connector:run
```

---

## Deployment

### Single Connector (Docker)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci --only=prod
CMD ["npm", "run", "connector:run"]
```

```bash
docker run -e CONNECTOR_NAME=weather-noaa \
           -e REDIS_URL=redis://redis:6379 \
           -e CONNECTORS_CONFIG_PATH=/app/connectors.json \
           -v ./connectors.json:/app/connectors.json \
           swarm:latest
```

### Kubernetes (Multiple Connectors)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: connector-weather-noaa
spec:
  replicas: 1
  selector:
    matchLabels:
      app: connector
      connector: weather-noaa
  template:
    metadata:
      labels:
        app: connector
        connector: weather-noaa
    spec:
      containers:
        - name: connector
          image: swarm:latest
          command: ["npm", "run", "connector:run", "--", "weather-noaa"]
          env:
            - name: REDIS_URL
              valueFrom:
                configMapKeyRef:
                  name: redis-config
                  key: url
            - name: CONNECTORS_CONFIG_PATH
              value: /etc/connectors/connectors.json
          volumeMounts:
            - name: config
              mountPath: /etc/connectors
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
      volumes:
        - name: config
          configMap:
            name: connectors-config
```

Create one Deployment per connector for independent scaling.

---

## Monitoring & Metrics

### Health Check

```typescript
const metrics = await metricsCollector.getMetrics("weather-noaa");
const isHealthy = await metricsCollector.isHealthy("weather-noaa", 300); // 5 min timeout
```

### Metrics API Endpoint (Future)

```bash
# List all connector metrics
GET /metrics/connectors

# Get specific connector
GET /metrics/connectors/weather-noaa

# Health status
GET /health/connectors
```

### Metrics Structure

```typescript
{
  connectorName: "weather-noaa",
  lastPollTime: "2025-02-24T10:30:00Z",
  lastSuccessTime: "2025-02-24T10:30:00Z",
  totalPolls: 1234,
  successfulPolls: 1230,
  failedPolls: 4,
  itemsFetched: 15000,
  itemsPublished: 14998,
  averageLatencyMs: 234
}
```

---

## Hot-Reload

Connectors support hot-reload via SIGHUP signal:

```bash
# Change connectors.json
vi connectors.json

# Signal all running connectors
pkill -SIGHUP -f universal-connector-worker

# Connectors automatically reload config
# Disabled connectors shut down gracefully
# Enabled connectors adapt to new polling intervals
```

---

## State Management

Connectors persist state across restarts for efficient polling:

```typescript
// Connector saves state after each poll
{
  "itemVersions": {
    "alert-ID-123": "v1hash",
    "alert-ID-456": "v2hash"
  }
}
```

**Use Cases**:

- ETags (HTTP caching)
- Last-Modified timestamps
- Cursors (pagination)
- Version tracking (change detection)

---

## Troubleshooting

### Connector Won't Start

```bash
# Check configuration
npm run connector:run weather-noaa 2>&1

# Verify connectors.json syntax
cat connectors.json | jq .

# Check env variables
echo $REDIS_URL
echo $CONNECTORS_CONFIG_PATH
```

### High CPU / Memory Usage

- Reduce `pollIntervalMs` (poll less frequently)
- Reduce `maxAlertsPerPoll` or equivalent
- Check for memory leaks in transformer function

### Duplicates in Stream

- Check `changeDetector` function returns consistent versioning
- Verify connector state is persisting correctly
- Review deduplication settings in signal ingestion worker

### Lease Conflicts

```bash
# Check active leases
redis-cli KEYS "lease:*"

# Force release (if instance crashed)
redis-cli DEL lease:weather-noaa
```

---

## Next Steps

1. **Add more connectors** following the template
2. **Scale horizontally**: Each connector as separate pod
3. **Implement metrics API** for dashboard visibility
4. **Add alerting**: Watch health metrics with Prometheus/Grafana
5. **Optimize schema**: Connector-specific transformations

See also:

- [Deployment & Scalability](./deployment.md)
- [Signal Ingestion Service](./signal-ingestion.md)
- [Risk Classification Service](./signal-classification.md)
