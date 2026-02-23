export const RiskEventTypes = Object.freeze({
  WEATHER: "WEATHER",
  NEWS: "NEWS",
  SOCIAL: "SOCIAL",
  TRAFFIC: "TRAFFIC",
  LABOR: "LABOR",
  GEOPOLITICAL: "GEOPOLITICAL",
  SUPPLY: "SUPPLY",
  OTHER: "OTHER"
});

export type RiskEventType = (typeof RiskEventTypes)[keyof typeof RiskEventTypes];

export const VALID_RISK_EVENT_TYPES: ReadonlySet<RiskEventType> = new Set(
  Object.values(RiskEventTypes) as RiskEventType[]
);
