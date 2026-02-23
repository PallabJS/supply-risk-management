export const EventStreams = Object.freeze({
  RAW_INPUT_SIGNALS: "raw-input-signals",
  EXTERNAL_SIGNALS: "external-signals",
  CLASSIFIED_EVENTS: "classified-events",
  RISK_EVALUATIONS: "risk-evaluations",
  MITIGATION_PLANS: "mitigation-plans",
  NOTIFICATIONS: "notifications"
});

export type EventStream = (typeof EventStreams)[keyof typeof EventStreams];
