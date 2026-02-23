# Global Watchtower

## Overview
Global Watchtower is a real-time, event-driven supply chain risk intelligence system that continuously ingests global external signals, classifies operational risks, computes impact exposure, generates validated mitigation plans, and notifies stakeholders in real time.

---

## System Architecture

                    ┌──────────────────────────┐
                    │   External Data Sources  │
                    │  (Weather, News, RSS)    │
                    └──────────────┬───────────┘
                                   │
                                   ▼
                    ┌──────────────────────────┐
                    │  Signal Ingestion Service │
                    └──────────────┬───────────┘
                                   │
                                   ▼
                    ┌──────────────────────────┐
                    │  Event Bus (Redis/Kafka) │
                    └──────────────┬───────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            ▼                      ▼                      ▼
┌──────────────────┐   ┌──────────────────┐   ┌────────────────────┐
│ Risk Classification│  │ Dependency Engine │  │ Mitigation Service │
│  Service (LLM)     │  │  (Deterministic)  │  │ (Constrained LLM)  │
└──────────┬─────────┘   └──────────┬─────────┘   └──────────┬─────────┘
           │                        │                        │
           └──────────────┬─────────┴──────────────┬─────────┘
                          ▼                        ▼
                 ┌──────────────────────────┐
                 │     Risk Orchestrator    │
                 └──────────────┬───────────┘
                                ▼
                 ┌──────────────────────────┐
                 │ Notification Service     │
                 └──────────────┬───────────┘
                                ▼
                 ┌──────────────────────────┐
                 │  Realtime Dashboard UI   │
                 └──────────────────────────┘

---

## Modules

- [Signal Ingestion Service](./signal-ingestion.md)
- [Event Bus Architecture](./event-bus.md)
- [Risk Classification Service](./risk-classification.md)
- [Dependency & Risk Engine](./risk-engine.md)
- [Mitigation Planning Service](./mitigation-service.md)
- [Notification Service](./notification-service.md)
- [Data Model & Schemas](./data-model.md)
- [Frontend Dashboard Architecture](./frontend-architecture.md)
- [Deployment & Scalability](./deployment.md)
