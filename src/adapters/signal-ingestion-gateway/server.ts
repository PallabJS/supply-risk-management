import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { EventStreams } from "../../infrastructure/event-bus/streams.js";
import type { RawExternalSignal } from "../../modules/signal-ingestion/types.js";
import type { SignalIngestionGatewayConfig } from "./config.js";
import { SignalIngestionGatewayService } from "./service.js";

interface JsonResponse {
  statusCode: number;
  body: Record<string, unknown>;
}

function respondJson(res: ServerResponse, response: JsonResponse): void {
  res.statusCode = response.statusCode;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(response.body));
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function toMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isAuthorized(req: IncomingMessage, authToken: string | undefined): boolean {
  if (!authToken) {
    return true;
  }

  const header = req.headers.authorization;
  return header === `Bearer ${authToken}`;
}

async function readJsonBody(
  req: IncomingMessage,
  maxRequestBytes: number
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bufferChunk.length;
    if (total > maxRequestBytes) {
      throw new Error(`Request body exceeds max size (${maxRequestBytes} bytes)`);
    }
    chunks.push(bufferChunk);
  }

  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim() === "") {
    throw new Error("Request body must not be empty");
  }

  return JSON.parse(text) as unknown;
}

function assertSignalObjects(
  values: unknown[],
  maxSignalsPerRequest: number
): RawExternalSignal[] {
  if (values.length === 0) {
    throw new Error("At least one signal is required");
  }
  if (values.length > maxSignalsPerRequest) {
    throw new Error(`Too many signals in request (max ${maxSignalsPerRequest})`);
  }

  return values.map((value) => {
    if (!isObjectRecord(value)) {
      throw new Error("Each signal must be an object");
    }
    return value as RawExternalSignal;
  });
}

function parseSignalsPayload(
  payload: unknown,
  maxSignalsPerRequest: number
): RawExternalSignal[] {
  if (Array.isArray(payload)) {
    return assertSignalObjects(payload, maxSignalsPerRequest);
  }

  if (!isObjectRecord(payload)) {
    throw new Error("Request body must be an object or array");
  }

  const signals = payload.signals;
  if (Array.isArray(signals)) {
    return assertSignalObjects(signals, maxSignalsPerRequest);
  }

  if (isObjectRecord(payload.signal)) {
    return assertSignalObjects([payload.signal], maxSignalsPerRequest);
  }

  return assertSignalObjects([payload], maxSignalsPerRequest);
}

export interface SignalIngestionGatewayServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createSignalIngestionGatewayServer(
  config: SignalIngestionGatewayConfig,
  service: SignalIngestionGatewayService
): SignalIngestionGatewayServer {
  const server = createServer(async (req, res) => {
    try {
      const method = req.method ?? "GET";
      const url = req.url ?? "/";

      if (!isAuthorized(req, config.authToken)) {
        respondJson(res, {
          statusCode: 401,
          body: {
            error: "UNAUTHORIZED",
            message: "Valid bearer token is required"
          }
        });
        return;
      }

      if (method === "GET" && url === "/health") {
        respondJson(res, {
          statusCode: 200,
          body: {
            status: "ok",
            service: "signal-ingestion-gateway",
            raw_input_stream: EventStreams.RAW_INPUT_SIGNALS,
            metrics: service.getMetrics()
          }
        });
        return;
      }

      if (method !== "POST" || (url !== "/signals" && url !== "/v1/signals")) {
        respondJson(res, {
          statusCode: 404,
          body: {
            error: "NOT_FOUND",
            message: "Only POST /signals, POST /v1/signals, and GET /health are supported"
          }
        });
        return;
      }

      let payload: unknown;
      try {
        payload = await readJsonBody(req, config.maxRequestBytes);
      } catch (error) {
        respondJson(res, {
          statusCode: 400,
          body: {
            error: "INVALID_REQUEST_BODY",
            message: toMessage(error)
          }
        });
        return;
      }

      let signals: RawExternalSignal[];
      try {
        signals = parseSignalsPayload(payload, config.maxSignalsPerRequest);
      } catch (error) {
        respondJson(res, {
          statusCode: 400,
          body: {
            error: "INVALID_SIGNAL_PAYLOAD",
            message: toMessage(error)
          }
        });
        return;
      }

      try {
        const published = await service.publishSignals(signals);
        respondJson(res, {
          statusCode: 202,
          body: {
            accepted: published.length,
            ids: published.map((record) => record.id),
            raw_input_stream: EventStreams.RAW_INPUT_SIGNALS
          }
        });
      } catch (error) {
        respondJson(res, {
          statusCode: 502,
          body: {
            error: "PUBLISH_FAILED",
            message: toMessage(error)
          }
        });
      }
    } catch (error) {
      respondJson(res, {
        statusCode: 500,
        body: {
          error: "INGESTION_GATEWAY_INTERNAL_ERROR",
          message: toMessage(error)
        }
      });
    }
  });

  return {
    async start(): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(config.port, config.host, () => {
          server.off("error", reject);
          const address = server.address() as AddressInfo | null;
          const host = address?.address ?? config.host;
          const port = address?.port ?? config.port;
          console.log(`[signal-gateway] listening on http://${host}:${port}`);
          resolve();
        });
      });
    },
    async stop(): Promise<void> {
      if (!server.listening) {
        return;
      }

      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
}
