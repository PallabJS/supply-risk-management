export interface SupplyLaneProfile {
  lane_id: string;
  origin_city: string;
  destination_city: string;
  trigger_terms: string[];
}

export const SUPPLY_LANES: readonly SupplyLaneProfile[] = Object.freeze([
  {
    lane_id: "mumbai-bangalore",
    origin_city: "Mumbai",
    destination_city: "Bangalore",
    trigger_terms: [
      "mumbai",
      "maharashtra",
      "thane",
      "navi mumbai",
      "pune",
      "bangalore",
      "bengaluru",
      "karnataka",
      "tumkur",
      "hosur"
    ]
  }
]);

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

export function resolveImpactedLanes(impactRegion: string): string[] {
  const normalizedRegion = normalize(impactRegion);
  if (!normalizedRegion) {
    return [];
  }

  const lanes: string[] = [];
  for (const lane of SUPPLY_LANES) {
    if (lane.trigger_terms.some((term) => normalizedRegion.includes(term))) {
      lanes.push(lane.lane_id);
    }
  }
  return lanes;
}

export function computeLaneRelevanceScore(
  impactRegion: string,
  impactedLanes: string[]
): number {
  const normalizedRegion = normalize(impactRegion);
  if (impactedLanes.includes("mumbai-bangalore")) {
    if (normalizedRegion.includes("mumbai") || normalizedRegion.includes("bangalore")) {
      return 0.95;
    }
    if (normalizedRegion.includes("maharashtra") || normalizedRegion.includes("karnataka")) {
      return 0.8;
    }
    return 0.65;
  }
  return 0.15;
}
