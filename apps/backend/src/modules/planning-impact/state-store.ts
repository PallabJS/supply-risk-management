import type { AppRedisClient } from "../../infrastructure/redis/client.js";
import type { InventorySnapshot, ShipmentPlan } from "./types.js";

const SHIPMENTS_HASH_KEY = "planning:shipments";
const INVENTORY_HASH_KEY = "planning:inventory";

function inventoryKey(sku: string, warehouseId: string): string {
  return `${sku}:${warehouseId}`;
}

function laneKey(laneId: string): string {
  return `planning:lane:${laneId}`;
}

export class PlanningStateStore {
  constructor(private readonly redis: AppRedisClient) {}

  async upsertShipments(shipments: ShipmentPlan[]): Promise<void> {
    for (const shipment of shipments) {
      await this.redis.hSet(
        SHIPMENTS_HASH_KEY,
        shipment.shipment_id,
        JSON.stringify(shipment),
      );
      await this.redis.sAdd(laneKey(shipment.lane_id), shipment.shipment_id);
    }
  }

  async upsertInventory(snapshots: InventorySnapshot[]): Promise<void> {
    for (const snapshot of snapshots) {
      await this.redis.hSet(
        INVENTORY_HASH_KEY,
        inventoryKey(snapshot.sku, snapshot.warehouse_id),
        JSON.stringify(snapshot),
      );
    }
  }

  async getShipmentsByLane(laneId: string): Promise<ShipmentPlan[]> {
    const ids = await this.redis.sMembers(laneKey(laneId));
    if (ids.length === 0) {
      return [];
    }

    const items = await Promise.all(
      ids.map((id) => this.redis.hGet(SHIPMENTS_HASH_KEY, id)),
    );

    return items
      .filter((value): value is string => typeof value === "string")
      .map((value) => JSON.parse(value) as ShipmentPlan);
  }

  async getInventory(
    sku: string,
    warehouseId: string,
  ): Promise<InventorySnapshot | undefined> {
    const value = await this.redis.hGet(
      INVENTORY_HASH_KEY,
      inventoryKey(sku, warehouseId),
    );
    if (!value) {
      return undefined;
    }
    return JSON.parse(value) as InventorySnapshot;
  }
}
