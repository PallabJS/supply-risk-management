import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import type { ExternalSignal } from "../../modules/signal-ingestion/types.js";
import type { RiskClassificationLlmAdapterConfig } from "./config.js";
import {
  QueueOverflowError,
  RiskClassificationLlmAdapterService,
  type AdapterClassifyRequest
} from "./service.js";

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

function parseClassifyRequest(payload: unknown): AdapterClassifyRequest {
  if (!isObjectRecord(payload)) {
    throw new Error("Request body must be an object");
  }

  const signalValue = payload.signal;
  if (!isObjectRecord(signalValue)) {
    throw new Error('Request field "signal" must be an object');
  }

  const signal = signalValue as unknown as ExternalSignal;
  if (typeof signal.event_id !== "string" || signal.event_id.trim() === "") {
    throw new Error('Signal field "event_id" is required');
  }

  return {
    signal,
    ...(typeof payload.model === "string" ? { model: payload.model } : {}),
    ...(typeof payload.instructions === "string"
      ? { instructions: payload.instructions }
      : {})
  };
}

function classifyErrorToResponse(error: unknown): JsonResponse {
  if (error instanceof QueueOverflowError) {
    return {
      statusCode: 503,
      body: {
        error: "QUEUE_FULL",
        message: error.message
      }
    };
  }

  return {
    statusCode: 502,
    body: {
      error: "UPSTREAM_CLASSIFICATION_FAILED",
      message: toMessage(error)
    }
  };
}

export interface RiskClassificationLlmAdapterServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createRiskClassificationLlmAdapterServer(
  config: RiskClassificationLlmAdapterConfig,
  service = new RiskClassificationLlmAdapterService({ config })
): RiskClassificationLlmAdapterServer {
  const server = createServer(async (req, res) => {
    try {
      const method = req.method ?? "GET";
      const url = req.url ?? "/";

      if (method === "GET" && url === "/health") {
        respondJson(res, {
          statusCode: 200,
          body: {
            status: "ok",
            service: "risk-classification-llm-adapter",
            upstream_base_url: config.upstreamBaseUrl,
            metrics: service.getMetrics()
          }
        });
        return;
      }

      if (method !== "POST" || url !== "/classify") {
        respondJson(res, {
          statusCode: 404,
          body: {
            error: "NOT_FOUND",
            message: "Only POST /classify and GET /health are supported"
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

      let classifyRequest: AdapterClassifyRequest;
      try {
        classifyRequest = parseClassifyRequest(payload);
      } catch (error) {
        respondJson(res, {
          statusCode: 400,
          body: {
            error: "INVALID_CLASSIFY_REQUEST",
            message: toMessage(error)
          }
        });
        return;
      }

      try {
        const structuredRisk = await service.classify(classifyRequest);
        respondJson(res, {
          statusCode: 200,
          body: {
            structured_risk: structuredRisk
          }
        });
      } catch (error) {
        respondJson(res, classifyErrorToResponse(error));
      }
    } catch (error) {
      respondJson(res, {
        statusCode: 500,
        body: {
          error: "ADAPTER_INTERNAL_ERROR",
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
          console.log(
            `[llm-adapter] listening on http://${host}:${port} -> ${config.upstreamBaseUrl}`
          );
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
