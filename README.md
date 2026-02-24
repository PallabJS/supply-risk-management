# Swarm Risk Management - Monorepo

A comprehensive, real-time supply chain risk intelligence system with backend services and a modern web dashboard.

## 📦 Monorepo Structure

```
swarm-risk-management/
├── apps/
│   ├── backend/          # Core backend services
│   │   ├── src/
│   │   │   ├── adapters/      # HTTP gateways and adapters
│   │   │   ├── infrastructure/# Core infrastructure (Redis, event bus, metrics)
│   │   │   ├── modules/       # Business logic (signal ingestion, classification, risk engine)
│   │   │   ├── connectors/    # Data source connectors
│   │   │   └── workers/       # Event consumer workers
│   │   ├── test/
│   │   ├── scripts/
│   │   ├── docs/
│   │   └── package.json
│   │
│   └── web/             # Next.js web application
│       ├── app/         # Next.js app directory
│       │   ├── api/     # API routes
│       │   ├── page.tsx # Main page
│       │   └── layout.tsx
│       ├── components/  # React components
│       ├── lib/         # Utilities and services
│       └── package.json
```

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- npm or yarn
- Docker and Docker Compose (for Redis)

### Installation

1. Clone the repository
2. Install dependencies for all workspaces:

```bash
npm install
```

3. Start Redis:

```bash
npm run infra:up
```

4. In separate terminals, start the services:

```bash
# Terminal 1: Backend services
npm run services:all

# Terminal 2: Web application
npm run web:dev
```

The web application will be available at `http://localhost:3000`

## 📋 Available Commands

### Workspace-wide commands

```bash
npm run typecheck          # Type check all workspaces
```

### Backend commands

```bash
npm run dev                # Run backend development server
npm run services:all       # Run all backend services
npm run backend:build      # Build backend
npm run test               # Run tests
npm run test:integration   # Run integration tests
npm run infra:up          # Start Redis container
npm run infra:down        # Stop Redis container
npm run infra:logs        # View Redis logs
```

### Web application commands

```bash
npm run web:dev      # Start development server (http://localhost:3000)
npm run web:build    # Build for production
```

### Individual Backend Services

```bash
npm run --workspace=apps/backend gateway:signal-ingestion
npm run --workspace=apps/backend worker:signal-ingestion
npm run --workspace=apps/backend connector:run
npm run --workspace=apps/backend adapter:risk-classification-llm
npm run --workspace=apps/backend worker:risk-classification
npm run --workspace=apps/backend worker:risk-engine
```

## 🏗️ System Architecture

### Backend Services

1. **Signal Ingestion Gateway** (Port 8090)
   - HTTP gateway for ingesting risk signals
   - Publishes to `raw-input-signals` stream

2. **Signal Ingestion Worker**
   - Normalizes and deduplicates signals
   - Publishes to `external-signals` stream

3. **Risk Classification Adapter** (Port 8088)
   - LLM-based signal classification
   - Classifies signals into risk categories

4. **Risk Classification Worker**
   - Consumes external signals
   - Publishes to `classified-events` stream

5. **Risk Engine Worker**
   - Business impact calculation
   - Publishes to `risk-evaluations` stream

6. **Connectors**
   - Universal polling framework for 100+ data sources
   - NOAA weather connector included

### Frontend Dashboard

- Next.js React application
- TypeScript for type safety
- Tailwind CSS for styling
- Recharts for visualizations
- Real-time data from Redis via API routes

## 📊 Dashboard Features

- **Risk Metrics**: Total risks, severity distribution, revenue exposure
- **Signal Tracking**: Real-time signal ingestion with confidence scores
- **Event Classification**: Classified events by type and severity
- **Connector Health**: Data source performance and reliability
- **Trend Analysis**: 24-hour risk trends
- **Auto-refresh**: Configurable real-time updates (default: 30s)

## 🔌 Data Flow

```
External Sources (APIs, Webhooks)
           ↓
    Signal Ingestion Gateway (8090)
           ↓
    Signal Ingestion Worker
           ↓
    external-signals (Redis Stream)
           ↓
  Risk Classification (LLM Adapter)
           ↓
    classified-events (Redis Stream)
           ↓
    Risk Engine Worker
           ↓
    risk-evaluations (Redis Stream)
           ↓
    Dashboard (Frontend)
```

## 🗄️ Redis Streams

The system uses Redis Streams for durable, at-least-once message delivery:

- `raw-input-signals`: Unnormalized ingestion payloads
- `external-signals`: Normalized signals with confidence scores
- `classified-events`: Risk-classified events
- `risk-evaluations`: Final risk assessments with exposure calculations
- `mitigation-plans`: Future stream for mitigation strategies
- `notifications`: Future stream for stakeholder notifications

## 📈 Metrics

### Connector Metrics

- Last poll time and success time
- Poll counts (total, successful, failed)
- Items fetched and published
- Average latency
- Current backoff (if applicable)

### Gateway Metrics

- Request counts (total, failed)
- Signal counts (received, published)

### Stream Statistics

- Message count and queue length
- Last update time
- Consumer group information

## 🔧 Configuration

Environment variables are configured via `.env` files in each package:

### Backend (`apps/backend/.env`)

- Redis connection settings
- Service ports
- LLM configuration
- Connector settings

### Web application (`apps/web/.env.local`)

- Redis host and port
- Auto-refresh interval

See `.env.example` files for complete configuration options.

## 📚 Documentation

- **Backend**: See `apps/backend/docs/` for detailed API and architecture documentation
- **Web**: See `apps/web/README.md` for web application documentation

## 🧪 Testing

Run all tests:

```bash
npm run test
```

Run integration tests:

```bash
npm run test:integration
```

## 🚀 Production Deployment

### Build

```bash
npm run backend:build
npm run web:build
```

### Environment Setup

Set appropriate environment variables for production Redis instance.

### Running

Backend and web application can be deployed independently:

```bash
# Backend
npm run --workspace=apps/backend start

# Web application
npm run --workspace=apps/web start
```

## 📝 License

MIT

## 🤝 Contributing

Contributions are welcome! Please ensure:

1. All tests pass
2. Code is TypeScript type-safe
3. Commits follow conventional commit format
4. Documentation is updated

## 📞 Support

For issues, bugs, or questions:

1. Check existing documentation
2. Review recent commits and logs
3. Create detailed issue reports

---

Built with Node.js, TypeScript, Redis, Next.js, and React.
