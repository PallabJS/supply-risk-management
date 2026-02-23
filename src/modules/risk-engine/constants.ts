export const RiskLevels = Object.freeze({
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL"
});

export type RiskLevel = (typeof RiskLevels)[keyof typeof RiskLevels];

export const VALID_RISK_LEVELS: ReadonlySet<RiskLevel> = new Set(
  Object.values(RiskLevels) as RiskLevel[]
);

export const DEFAULT_RISK_LEVEL_THRESHOLDS = Object.freeze({
  medium: 0.35,
  high: 0.65,
  critical: 0.85
});
