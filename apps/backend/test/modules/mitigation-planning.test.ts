import assert from "node:assert/strict";
import test from "node:test";

import { EventStreams } from "../../src/infrastructure/event-bus/streams.js";
import { DeterministicMitigationPlanner } from "../../src/modules/mitigation-planning/deterministic-planner.js";
import { MitigationPlanningService } from "../../src/modules/mitigation-planning/service.js";
import type { RiskEvaluation } from "../../src/modules/risk-engine/types.js";

function createRiskEvaluation(partial: Partial<RiskEvaluation> = {}): RiskEvaluation {
  return {
    risk_id: partial.risk_id ?? "risk-1",
    classification_id: partial.classification_id ?? "cls-1",
    event_type: partial.event_type ?? "WEATHER",
    impact_region: partial.impact_region ?? "Maharashtra",
    expected_duration_hours: partial.expected_duration_hours ?? 24,
    classification_confidence: partial.classification_confidence ?? 0.8,
    factory_id: partial.factory_id ?? "factory-1",
    supplier_id: partial.supplier_id ?? "supplier-1",
    inventory_coverage_days: partial.inventory_coverage_days ?? 8,
    operational_criticality: partial.operational_criticality ?? 0.82,
    severity_weight: partial.severity_weight ?? 0.8,
    risk_score: partial.risk_score ?? 0.74,
    risk_level: partial.risk_level ?? "HIGH",
    impacted_lanes: partial.impacted_lanes ?? ["mumbai-bangalore"],
    lane_relevance_score: partial.lane_relevance_score ?? 0.86,
    estimated_revenue_exposure: partial.estimated_revenue_exposure ?? 180000,
    evaluation_timestamp_utc: partial.evaluation_timestamp_utc ?? new Date().toISOString()
  };
}

test("creates mitigation plan with lane-specific actions", async () => {
  const planner = new DeterministicMitigationPlanner();
  const plan = await planner.createPlan(createRiskEvaluation());

  assert.equal(plan.lane_id, "mumbai-bangalore");
  assert.ok(plan.predicted_delay_hours > 0);
  assert.ok(plan.recommended_actions.length >= 2);
  assert.ok(plan.recommended_actions.some((a) => a.title.includes("alternate route")));
});

test("falls back to operational lane for India-wide risks", async () => {
  const planner = new DeterministicMitigationPlanner();
  const plan = await planner.createPlan(
    createRiskEvaluation({
      impacted_lanes: [],
      impact_region: "India",
      event_type: "NEWS"
    })
  );

  assert.equal(plan.lane_id, "mumbai-bangalore");
  assert.ok(
    plan.recommended_actions[0]?.description.includes("Mumbai -> Bangalore")
  );
  assert.ok(plan.recommended_actions.some((a) => a.title.includes("Lock backup capacity")));
});

test("publishes mitigation plan to stream", async () => {
  const published: unknown[] = [];
  const service = new MitigationPlanningService({
    eventPublisher: {
      async publish(_stream, message) {
        published.push(message);
        return {
          id: "1-0",
          stream: EventStreams.MITIGATION_PLANS,
          message,
          published_at_utc: new Date().toISOString()
        };
      }
    },
    planner: new DeterministicMitigationPlanner()
  });

  const decision = await service.createAndPublish(createRiskEvaluation());
  assert.equal(decision.mitigationPlan.risk_id, "risk-1");
  assert.equal(published.length, 1);
});
