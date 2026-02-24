# Risk Management Web Application

A modern, real-time web dashboard for the Swarm Risk Management system built with Next.js and TypeScript.

## Overview

This dashboard displays comprehensive metrics and visualizations from the risk management backend including:

- **Risk Metrics**: Total risks, severity distribution, and revenue exposure
- **Signal Ingestion**: Real-time signal tracking with confidence scores
- **Event Classification**: Classified events by type and severity
- **Connector Health**: Data source connector status and performance
- **Trend Analysis**: 24-hour risk trends and metrics

## Features

- 📊 **Interactive Charts**: Risk distribution, event types, connector latency, and trends
- 📈 **Real-time Metrics**: Auto-refreshing dashboard with 30-second intervals
- 📋 **Detailed Tables**: Browse recent signals, events, risks, and connector health
- 🎨 **Modern UI**: Clean, responsive design with Tailwind CSS
- ⚡ **Fast Performance**: Server-side data fetching with Next.js API routes
- 🔄 **Auto-Refresh**: Toggle automatic data refresh on/off

## Prerequisites

- Node.js 20+
- npm or yarn
- Redis running on your system (same Redis instance as the backend)

## Installation

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables:

Copy `.env.example` to `.env.local` and update Redis connection settings if needed:

```bash
cp .env.example .env.local
```

Default configuration assumes Redis is running on `localhost:6379`.

## Development

Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Building for Production

Build the application:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

## Architecture

### Components

- **Header**: Dashboard header with title and branding
- **MetricCard**: Reusable metric display cards
- **Charts**: Responsive chart components using Recharts
  - Risk Distribution (Pie Chart)
  - Event Types (Bar Chart)
  - Connector Latency (Bar Chart)
  - Risk Trend (Line Chart)
- **Tables**: Data tables for recent signals, events, risks, and connectors

### Services

- **redis.ts**: Redis client and data fetching functions
- **metrics.ts**: Metrics aggregation and calculation utilities

### API Routes

- **GET /api/metrics**: Aggregates and returns all dashboard data from Redis streams

## Data Sources

The dashboard connects to Redis streams populated by the backend:

- `external-signals`: Normalized input signals
- `classified-events`: Risk-classified events
- `risk-evaluations`: Final risk assessments
- `metrics:connector:*`: Per-connector performance metrics
- `metrics:gateway:signal-ingestion`: Gateway metrics

## Customization

### Adding New Metrics

1. Add data fetching function in `lib/redis.ts`
2. Create calculation function in `lib/metrics.ts`
3. Add new component in `components/`
4. Include in main page layout

### Modifying Charts

Edit `components/Charts.tsx` to customize chart types, colors, and data display:

```tsx
<RiskDistributionChart data={data.riskSummary.severityDistribution} />
```

### Styling

The dashboard uses Tailwind CSS. Modify `tailwind.config.ts` to customize colors and spacing.

## Troubleshooting

### Cannot connect to Redis

- Ensure Redis is running: `redis-cli ping`
- Check Redis host and port in `.env.local`
- Verify Redis is on the same instance as the backend

### No data showing

- Ensure the backend services are running
- Check backend Redis streams have data
- Verify API route can fetch from Redis

### Performance issues

- Adjust auto-refresh interval in frontend code
- Limit number of items fetched per stream (modify `*FromStream()` calls)
- Consider pagination for large datasets

## License

MIT
