import assert from "node:assert/strict";
import test from "node:test";

import { loadRiskClassificationLlmAdapterConfig } from "../../src/adapters/risk-classification-llm-adapter/config.js";
import {
  QueueOverflowError,
  RiskClassificationLlmAdapterService
} from "../../src/adapters/risk-classification-llm-adapter/service.js";
import type { ExternalSignal } from "../../src/modules/signal-ingestion/types.js";

function createSignal(partial: Partial<ExternalSignal> = {}): ExternalSignal {
  return {
    event_id: partial.event_id ?? "evt-adapter-1",
    source_type: partial.source_type ?? "NEWS",
    raw_content: partial.raw_content ?? "Port shutdown expected due to weather",
    source_reference: partial.source_reference ?? "manual://adapter-test",
    geographic_scope: partial.geographic_scope ?? "US-CA",
    timestamp_utc: partial.timestamp_utc ?? new Date().toISOString(),
    ingestion_time_utc: partial.ingestion_time_utc ?? new Date().toISOString(),
    signal_confidence: partial.signal_confidence ?? 0.86
  };
}

function successResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
}

function deferred<TValue>() {
  let resolve: (value: TValue | PromiseLike<TValue>) => void = () => {};
  let reject: (reason?: unknown) => void = () => {};
  const promise = new Promise<TValue>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

test("loads llm adapter config defaults", () => {
  const config = loadRiskClassificationLlmAdapterConfig({});

  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 8088);
  assert.equal(config.upstreamBaseUrl, "http://localhost:11434");
  assert.equal(config.defaultModel, "llama3.1:8b");
  assert.equal(config.requestTimeoutMs, 15000);
  assert.equal(config.maxConcurrency, 8);
  assert.equal(config.maxQueueSize, 500);
  assert.equal(config.maxRequestBytes, 262144);
});

test("adapter service parses structured risk from json response", async () => {
  const service = new RiskClassificationLlmAdapterService({
    config: loadRiskClassificationLlmAdapterConfig({
      LLM_ADAPTER_UPSTREAM_BASE_URL: "http://localhost:11434"
    }),
    fetchImpl: async (_input, init) => {
      const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(payload.model, "model-a");

      return successResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                event_type: "NEWS",
                severity_level: 4,
                impact_region: "US-CA",
                expected_duration_hours: 24,
                classification_confidence: 0.82,
                model_version: "model-a"
              })
            }
          }
        ]
      });
    }
  });

  const result = await service.classify({
    model: "model-a",
    signal: createSignal({ event_id: "evt-adapter-json" })
  });

  assert.equal(result.event_type, "NEWS");
  assert.equal(result.severity_level, 4);
  assert.equal(result.classification_confidence, 0.82);
});

test("adapter service normalizes aliased draft fields", async () => {
  const service = new RiskClassificationLlmAdapterService({
    config: loadRiskClassificationLlmAdapterConfig({
      LLM_ADAPTER_UPSTREAM_BASE_URL: "http://localhost:11434"
    }),
    fetchImpl: async () =>
      successResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                riskType: "geopolitical",
                severity: "4",
                region: "EU-DE",
                duration_hours: "60",
                confidence: "84",
                model: "llama3.1:8b"
              })
            }
          }
        ]
      })
  });

  const result = await service.classify({
    signal: createSignal({ event_id: "evt-adapter-normalized-1" })
  });

  assert.equal(result.event_type, "GEOPOLITICAL");
  assert.equal(result.severity_level, 4);
  assert.equal(result.impact_region, "EU-DE");
  assert.equal(result.expected_duration_hours, 60);
  assert.equal(result.classification_confidence, 0.84);
  assert.equal(result.model_version, "llama3.1:8b");
});

test("adapter service parses fenced json from response text", async () => {
  const service = new RiskClassificationLlmAdapterService({
    config: loadRiskClassificationLlmAdapterConfig({
      LLM_ADAPTER_UPSTREAM_BASE_URL: "http://localhost:11434"
    }),
    fetchImpl: async () => {
      return successResponse({
        choices: [
          {
            message: {
              content:
                "```json\n{\"event_type\":\"SUPPLY\",\"severity_level\":5,\"impact_region\":\"GLOBAL\",\"expected_duration_hours\":72,\"classification_confidence\":0.9}\n```"
            }
          }
        ]
      });
    }
  });

  const result = await service.classify({ signal: createSignal({ event_id: "evt-fenced-1" }) });
  assert.equal(result.event_type, "SUPPLY");
  assert.equal(result.severity_level, 5);
  assert.equal(result.impact_region, "GLOBAL");
});

test("adapter service applies queue overflow backpressure", async () => {
  const first = deferred<Response>();
  let callCount = 0;

  const service = new RiskClassificationLlmAdapterService({
    config: loadRiskClassificationLlmAdapterConfig({
      LLM_ADAPTER_MAX_CONCURRENCY: "1",
      LLM_ADAPTER_MAX_QUEUE_SIZE: "1"
    }),
    fetchImpl: async () => {
      callCount += 1;
      if (callCount === 1) {
        return first.promise;
      }
      return successResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                event_type: "NEWS",
                severity_level: 3,
                impact_region: "US-CA",
                expected_duration_hours: 12,
                classification_confidence: 0.71
              })
            }
          }
        ]
      });
    }
  });

  const one = service.classify({ signal: createSignal({ event_id: "evt-q-1" }) });
  const two = service.classify({ signal: createSignal({ event_id: "evt-q-2" }) });
  const three = service.classify({ signal: createSignal({ event_id: "evt-q-3" }) });

  await assert.rejects(three, QueueOverflowError);

  first.resolve(
    successResponse({
      choices: [
        {
          message: {
            content: JSON.stringify({
              event_type: "NEWS",
              severity_level: 4,
              impact_region: "US-CA",
              expected_duration_hours: 20,
              classification_confidence: 0.81
            })
          }
        }
      ]
    })
  );

  const [resultOne, resultTwo] = await Promise.all([one, two]);
  assert.equal(typeof resultOne.event_type, "string");
  assert.equal(typeof resultTwo.event_type, "string");
  assert.equal(service.getMetrics().queue_overflow_rejections, 1);
});
