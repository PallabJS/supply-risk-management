import assert from "node:assert/strict";
import test from "node:test";

import { EventStreams } from "../../src/infrastructure/event-bus/streams.js";
import { NotificationService } from "../../src/modules/notification/service.js";
import type { MitigationPlan } from "../../src/modules/mitigation-planning/types.js";

function createMitigationPlan(partial: Partial<MitigationPlan> = {}): MitigationPlan {
  return {
    mitigation_id: partial.mitigation_id ?? "mitigation-1",
    risk_id: partial.risk_id ?? "risk-1",
    classification_id: partial.classification_id ?? "cls-1",
    lane_id: partial.lane_id ?? "mumbai-bangalore",
    risk_level: partial.risk_level ?? "HIGH",
    predicted_delay_hours: partial.predicted_delay_hours ?? 10,
    mitigation_confidence: partial.mitigation_confidence ?? 0.82,
    recommended_actions: partial.recommended_actions ?? [
      {
        action_id: "a-1",
        title: "Activate alternate route",
        description: "Use alternate route",
        estimated_cost_inr: 10000,
        expected_delay_reduction_hours: 4,
        priority: 1
      }
    ],
    created_at_utc: partial.created_at_utc ?? new Date().toISOString()
  };
}

test("publishes notification for high risk mitigation plan", async () => {
  const published: unknown[] = [];
  const service = new NotificationService({
    eventPublisher: {
      async publish(_stream, message) {
        published.push(message);
        return {
          id: "1-0",
          stream: EventStreams.NOTIFICATIONS,
          message,
          published_at_utc: new Date().toISOString()
        };
      }
    }
  });

  const decision = await service.notify(createMitigationPlan());
  assert.equal(decision.shouldNotify, true);
  assert.equal(published.length, 1);
});

test("skips notification for low-risk mitigation plan", async () => {
  const service = new NotificationService({
    eventPublisher: {
      async publish(_stream, message) {
        return {
          id: "1-0",
          stream: EventStreams.NOTIFICATIONS,
          message,
          published_at_utc: new Date().toISOString()
        };
      }
    }
  });

  const decision = await service.notify({
    ...createMitigationPlan({
      mitigation_id: "mitigation-2",
      risk_level: "LOW"
    }),
    risk_score: 0.2,
    lane_relevance_score: 0.1
  });

  assert.equal(decision.shouldNotify, false);
});
