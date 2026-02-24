import assert from "node:assert/strict";
import test from "node:test";

import { EventStreams } from "../../src/infrastructure/event-bus/streams.js";
import { RiskEngineService } from "../../src/modules/risk-engine/service.js";
import type {
  ClassifiedRiskInput,
  RiskEvaluator
} from "../../src/modules/risk-engine/types.js";

function createClassifiedRisk(
  partial: Partial<ClassifiedRiskInput> = {}
): ClassifiedRiskInput {
  const base: ClassifiedRiskInput = {
    classification_id: partial.classification_id ?? "cls-1",
    event_id: partial.event_id ?? "evt-1",
    event_type: partial.event_type ?? "NEWS",
    severity_level: partial.severity_level ?? 4,
    impact_region: partial.impact_region ?? "US-CA",
    expected_duration_hours: partial.expected_duration_hours ?? 48,
    classification_confidence: partial.classification_confidence ?? 0.86,
    model_version: partial.model_version ?? "risk-classification-v1",
    processed_at_utc: partial.processed_at_utc ?? new Date().toISOString()
  };

  return {
    ...base,
    ...(partial.factory_id ? { factory_id: partial.factory_id } : {}),
    ...(partial.supplier_id ? { supplier_id: partial.supplier_id } : {}),
    ...(typeof partial.inventory_coverage_days === "number"
      ? { inventory_coverage_days: partial.inventory_coverage_days }
      : {}),
    ...(typeof partial.operational_criticality === "number"
      ? { operational_criticality: partial.operational_criticality }
      : {}),
    ...(typeof partial.estimated_daily_revenue === "number"
      ? { estimated_daily_revenue: partial.estimated_daily_revenue }
      : {})
  };
}

test("evaluates and publishes risk evaluation with deterministic defaults", async () => {
  const published: unknown[] = [];
  const service = new RiskEngineService({
    eventPublisher: {
      async publish(_stream, message) {
        published.push(message);
        return {
          id: "1-0",
          stream: EventStreams.RISK_EVALUATIONS,
          message,
          published_at_utc: new Date().toISOString()
        };
      }
    },
    evaluationVersion: "risk-engine-v1",
    dailyRevenueBaseline: 500_000
  });

  const decision = await service.evaluateAndPublish(createClassifiedRisk());
  assert.equal(published.length, 1);
  assert.equal(decision.riskEvaluation.classification_id, "cls-1");
  assert.equal(decision.riskEvaluation.event_type, "NEWS");
  assert.ok(decision.riskEvaluation.risk_score >= 0);
  assert.ok(decision.riskEvaluation.risk_score <= 1);
  assert.ok(decision.riskEvaluation.estimated_revenue_exposure > 0);
});

test("produces deterministic risk id and score for same classification input", async () => {
  const service = new RiskEngineService({
    eventPublisher: {
      async publish(_stream, message) {
        return {
          id: "1-0",
          stream: EventStreams.RISK_EVALUATIONS,
          message,
          published_at_utc: new Date().toISOString()
        };
      }
    },
    evaluationVersion: "risk-engine-v1"
  });

  const risk = createClassifiedRisk({ classification_id: "cls-deterministic" });
  const first = await service.evaluateRisk(risk);
  const second = await service.evaluateRisk(risk);

  assert.equal(first.riskEvaluation.risk_id, second.riskEvaluation.risk_id);
  assert.equal(first.riskEvaluation.risk_score, second.riskEvaluation.risk_score);
});

test("normalizes custom evaluator draft into full risk evaluation schema", async () => {
  const customEvaluator: RiskEvaluator = {
    name: "custom-evaluator",
    async evaluate() {
      return {
        risk_score: 0.91,
        risk_level: "CRITICAL",
        estimated_revenue_exposure: 1250000
      };
    }
  };

  const service = new RiskEngineService({
    eventPublisher: {
      async publish(_stream, message) {
        return {
          id: "1-0",
          stream: EventStreams.RISK_EVALUATIONS,
          message,
          published_at_utc: new Date().toISOString()
        };
      }
    },
    evaluator: customEvaluator
  });

  const decision = await service.evaluateRisk(createClassifiedRisk({ classification_id: "cls-2" }));
  assert.equal(decision.evaluatorName, "custom-evaluator");
  assert.equal(decision.riskEvaluation.classification_id, "cls-2");
  assert.equal(decision.riskEvaluation.risk_level, "CRITICAL");
  assert.equal(decision.riskEvaluation.risk_score, 0.91);
  assert.equal(decision.riskEvaluation.estimated_revenue_exposure, 1250000);
});

test("retries risk-evaluation publish on transient failures", async () => {
  let attempts = 0;
  const service = new RiskEngineService({
    eventPublisher: {
      async publish(_stream, message) {
        attempts += 1;
        if (attempts < 3) {
          throw new Error("synthetic publish failure");
        }
        return {
          id: "1-0",
          stream: EventStreams.RISK_EVALUATIONS,
          message,
          published_at_utc: new Date().toISOString()
        };
      }
    },
    maxPublishAttempts: 3,
    retryDelayMs: 1
  });

  await service.evaluateAndPublish(createClassifiedRisk());
  assert.equal(attempts, 3);
});

test("marks Mumbai to Bangalore lane relevance for Indian weather disruption", async () => {
  const service = new RiskEngineService({
    eventPublisher: {
      async publish(_stream, message) {
        return {
          id: "1-0",
          stream: EventStreams.RISK_EVALUATIONS,
          message,
          published_at_utc: new Date().toISOString()
        };
      }
    }
  });

  const decision = await service.evaluateRisk(
    createClassifiedRisk({
      event_type: "WEATHER",
      impact_region: "Maharashtra"
    })
  );

  assert.ok(decision.riskEvaluation.impacted_lanes.includes("mumbai-bangalore"));
  assert.ok(decision.riskEvaluation.lane_relevance_score >= 0.6);
});
