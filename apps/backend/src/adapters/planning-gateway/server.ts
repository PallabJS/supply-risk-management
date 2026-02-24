import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import { EventStreams } from "../../infrastructure/event-bus/streams.js";
import type { InventorySnapshot, ShipmentPlan } from "../../modules/planning-impact/types.js";
import type { PlanningGatewayConfig } from "./config.js";
import { PlanningGatewayService } from "./service.js";

function respondJson(
  res: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>
): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function isAuthorized(req: IncomingMessage, authToken: string | undefined): boolean {
  if (!authToken) {
    return true;
  }
  const header = req.headers.authorization;
  return header === `Bearer ${authToken}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function parsePositiveNumber(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return fallback;
  }
  return numeric;
}

function parseString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

async function readJsonBody(
  req: IncomingMessage,
  maxRequestBytes: number
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxRequestBytes) {
      throw new Error(`Request exceeds max size (${maxRequestBytes} bytes)`);
    }
    chunks.push(buf);
  }

  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) {
    throw new Error("Request body must not be empty");
  }
  return JSON.parse(text) as unknown;
}

function asArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (isRecord(payload) && Array.isArray(payload.records)) {
    return payload.records;
  }
  return [payload];
}

function normalizeShipmentPlan(payload: unknown): ShipmentPlan {
  if (!isRecord(payload)) {
    throw new Error("Shipment record must be an object");
  }

  const shipmentId = parseString(payload.shipment_id);
  if (!shipmentId) throw new Error("shipment_id is required");

  const poNumber = parseString(payload.po_number || payload.po);
  const sku = parseString(payload.sku);
  const laneId = parseString(payload.lane_id || payload.route_id);
  const warehouseId = parseString(payload.warehouse_id || payload.warehouse);
  const plannedEta = parseString(payload.planned_eta_utc || payload.planned_eta);

  if (!poNumber || !sku || !laneId || !warehouseId || !plannedEta) {
    throw new Error("po_number, sku, lane_id, warehouse_id, planned_eta_utc are required");
  }

  return {
    shipment_id: shipmentId,
    po_number: poNumber,
    sku,
    lane_id: laneId,
    warehouse_id: warehouseId,
    planned_eta_utc: new Date(plannedEta).toISOString(),
    unit_revenue_inr: parsePositiveNumber(payload.unit_revenue_inr, 1)
  };
}

function normalizeInventorySnapshot(payload: unknown): InventorySnapshot {
  if (!isRecord(payload)) {
    throw new Error("Inventory snapshot must be an object");
  }

  const sku = parseString(payload.sku);
  const warehouseId = parseString(payload.warehouse_id || payload.warehouse);
  if (!sku || !warehouseId) {
    throw new Error("sku and warehouse_id are required");
  }

  return {
    sku,
    warehouse_id: warehouseId,
    on_hand_units: parsePositiveNumber(payload.on_hand_units, 0),
    in_transit_units: parsePositiveNumber(payload.in_transit_units, 0),
    daily_demand_units: parsePositiveNumber(payload.daily_demand_units, 1),
    safety_stock_units: parsePositiveNumber(payload.safety_stock_units, 0)
  };
}

export function createPlanningGatewayServer(
  config: PlanningGatewayConfig,
  service: PlanningGatewayService
) {
  const server = createServer(async (req, res) => {
    try {
      if (!isAuthorized(req, config.authToken)) {
        respondJson(res, 401, { error: "UNAUTHORIZED" });
        return;
      }

      const method = req.method ?? "GET";
      const url = req.url ?? "/";

      if (method === "GET" && url === "/health") {
        respondJson(res, 200, {
          status: "ok",
          service: "planning-gateway",
          streams: [EventStreams.SHIPMENT_PLANS, EventStreams.INVENTORY_SNAPSHOTS]
        });
        return;
      }

      if (method !== "POST") {
        respondJson(res, 404, { error: "NOT_FOUND" });
        return;
      }

      const payload = await readJsonBody(req, config.maxRequestBytes);
      const records = asArray(payload);
      if (records.length === 0 || records.length > config.maxRecordsPerRequest) {
        respondJson(res, 400, { error: "INVALID_RECORD_COUNT" });
        return;
      }

      if (url === "/shipments" || url === "/v1/shipments") {
        const shipments = records.map(normalizeShipmentPlan);
        await service.ingestShipments(shipments);
        respondJson(res, 202, { accepted: shipments.length, stream: EventStreams.SHIPMENT_PLANS });
        return;
      }

      if (url === "/inventory" || url === "/v1/inventory") {
        const snapshots = records.map(normalizeInventorySnapshot);
        await service.ingestInventory(snapshots);
        respondJson(res, 202, {
          accepted: snapshots.length,
          stream: EventStreams.INVENTORY_SNAPSHOTS
        });
        return;
      }

      respondJson(res, 404, { error: "NOT_FOUND" });
    } catch (error) {
      respondJson(res, 500, {
        error: "PLANNING_GATEWAY_INTERNAL_ERROR",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return {
    async start(): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(config.port, config.host, () => {
          server.off("error", reject);
          console.log(`[planning-gateway] listening on http://${config.host}:${config.port}`);
          resolve();
        });
      });
    },
    async stop(): Promise<void> {
      if (!server.listening) return;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  };
}
