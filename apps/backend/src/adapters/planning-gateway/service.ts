import { EventStreams } from "../../infrastructure/event-bus/streams.js";
import type { EventPublisher } from "../../infrastructure/event-bus/types.js";
import type { PlanningStateStore } from "../../modules/planning-impact/state-store.js";
import type { InventorySnapshot, ShipmentPlan } from "../../modules/planning-impact/types.js";

export interface PlanningGatewayServiceOptions {
  eventPublisher: EventPublisher;
  planningStateStore: PlanningStateStore;
}

export class PlanningGatewayService {
  private readonly eventPublisher: EventPublisher;
  private readonly planningStateStore: PlanningStateStore;

  constructor(options: PlanningGatewayServiceOptions) {
    this.eventPublisher = options.eventPublisher;
    this.planningStateStore = options.planningStateStore;
  }

  async ingestShipments(shipments: ShipmentPlan[]): Promise<void> {
    await this.planningStateStore.upsertShipments(shipments);
    for (const shipment of shipments) {
      await this.eventPublisher.publish(EventStreams.SHIPMENT_PLANS, shipment);
    }
  }

  async ingestInventory(snapshots: InventorySnapshot[]): Promise<void> {
    await this.planningStateStore.upsertInventory(snapshots);
    for (const snapshot of snapshots) {
      await this.eventPublisher.publish(EventStreams.INVENTORY_SNAPSHOTS, snapshot);
    }
  }
}
