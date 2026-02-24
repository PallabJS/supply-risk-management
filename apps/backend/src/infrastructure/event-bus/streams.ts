export const EventStreams = Object.freeze({
  RAW_INPUT_SIGNALS: "raw-input-signals",
  EXTERNAL_SIGNALS: "external-signals",
  CLASSIFIED_EVENTS: "classified-events",
  RISK_EVALUATIONS: "risk-evaluations",
  MITIGATION_PLANS: "mitigation-plans",
  NOTIFICATIONS: "notifications",
  SHIPMENT_PLANS: "shipment-plans",
  INVENTORY_SNAPSHOTS: "inventory-snapshots",
  AT_RISK_SHIPMENTS: "at-risk-shipments",
  INVENTORY_EXPOSURES: "inventory-exposures"
});

export type EventStream = (typeof EventStreams)[keyof typeof EventStreams];
