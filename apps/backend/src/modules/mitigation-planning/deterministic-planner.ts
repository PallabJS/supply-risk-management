import { deterministicUuidFromSeed } from "../risk-engine/schema.js";
import type { RiskEvaluation } from "../risk-engine/types.js";
import type { MitigationAction, MitigationPlan, MitigationPlanner } from "./types.js";

export class DeterministicMitigationPlanner implements MitigationPlanner {
  readonly name = "mitigation-planner-v1";

  async createPlan(riskEvaluation: RiskEvaluation): Promise<MitigationPlan> {
    const laneId = riskEvaluation.impacted_lanes[0] || "general-india";
    const delayHours = Math.max(
      2,
      Math.round(
        riskEvaluation.expected_duration_hours * (0.4 + riskEvaluation.risk_score * 0.6)
      )
    );

    const recommendedActions = buildActions(riskEvaluation, laneId, delayHours);
    const mitigationConfidence = Math.max(
      0.4,
      Math.min(
        0.98,
        Number(
          (
            0.5 +
            riskEvaluation.lane_relevance_score * 0.3 +
            riskEvaluation.classification_confidence * 0.2
          ).toFixed(4)
        )
      )
    );

    return {
      mitigation_id: deterministicUuidFromSeed(`mitigation:${riskEvaluation.risk_id}`),
      risk_id: riskEvaluation.risk_id,
      classification_id: riskEvaluation.classification_id,
      lane_id: laneId,
      risk_level: riskEvaluation.risk_level,
      predicted_delay_hours: delayHours,
      mitigation_confidence: mitigationConfidence,
      recommended_actions: recommendedActions,
      created_at_utc: new Date().toISOString()
    };
  }
}

function buildActions(
  riskEvaluation: RiskEvaluation,
  laneId: string,
  delayHours: number
): MitigationAction[] {
  const laneLabel = laneId === "mumbai-bangalore" ? "Mumbai -> Bangalore" : laneId;

  const baseActions: MitigationAction[] = [
    {
      action_id: deterministicUuidFromSeed(`${riskEvaluation.risk_id}:reroute`),
      title: "Activate alternate route",
      description: `Use alternate corridor for ${laneLabel} to bypass impacted region (${riskEvaluation.impact_region}).`,
      estimated_cost_inr: 18000,
      expected_delay_reduction_hours: Math.max(2, Math.round(delayHours * 0.45)),
      priority: 1
    },
    {
      action_id: deterministicUuidFromSeed(`${riskEvaluation.risk_id}:split`),
      title: "Split shipment by criticality",
      description:
        "Move critical SKUs immediately and defer non-critical SKUs to reduce SLA breach risk.",
      estimated_cost_inr: 9000,
      expected_delay_reduction_hours: Math.max(1, Math.round(delayHours * 0.25)),
      priority: 2
    }
  ];

  switch (riskEvaluation.event_type) {
    case "WEATHER":
      baseActions.push({
        action_id: deterministicUuidFromSeed(`${riskEvaluation.risk_id}:weather-buffer`),
        title: "Stage buffer inventory at Bangalore DC",
        description:
          "Dispatch interim replenishment to Bangalore distribution center before weather window worsens.",
        estimated_cost_inr: 14000,
        expected_delay_reduction_hours: Math.max(1, Math.round(delayHours * 0.2)),
        priority: 3
      });
      break;
    case "TRAFFIC":
      baseActions.push({
        action_id: deterministicUuidFromSeed(`${riskEvaluation.risk_id}:time-window`),
        title: "Shift movement to off-peak window",
        description:
          "Reschedule line-haul departure to night window and lock appointment at destination.",
        estimated_cost_inr: 6000,
        expected_delay_reduction_hours: Math.max(1, Math.round(delayHours * 0.2)),
        priority: 3
      });
      break;
    case "LABOR":
      baseActions.push({
        action_id: deterministicUuidFromSeed(`${riskEvaluation.risk_id}:carrier`),
        title: "Switch to backup carrier",
        description: "Activate pre-approved backup carrier network for affected zone.",
        estimated_cost_inr: 22000,
        expected_delay_reduction_hours: Math.max(2, Math.round(delayHours * 0.35)),
        priority: 3
      });
      break;
    default:
      baseActions.push({
        action_id: deterministicUuidFromSeed(`${riskEvaluation.risk_id}:control-tower`),
        title: "Increase control tower monitoring",
        description:
          "Move this shipment to 2-hour ETA monitoring and trigger escalation on further slippage.",
        estimated_cost_inr: 2500,
        expected_delay_reduction_hours: Math.max(1, Math.round(delayHours * 0.1)),
        priority: 3
      });
      break;
  }

  return baseActions;
}
