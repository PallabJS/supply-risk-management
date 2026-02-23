import assert from "node:assert/strict";
import test from "node:test";

import { LocalLlmRiskClassifier } from "../../src/modules/risk-classification/local-llm-classifier.js";
import type { StructuredRiskDraft } from "../../src/modules/risk-classification/types.js";
import type { ExternalSignal } from "../../src/modules/signal-ingestion/types.js";

function createSignal(partial: Partial<ExternalSignal> = {}): ExternalSignal {
  return {
    event_id: partial.event_id ?? "evt-llm-1",
    source_type: partial.source_type ?? "NEWS",
    raw_content: partial.raw_content ?? "Major supplier strike expected next week",
    source_reference: partial.source_reference ?? "manual://llm-test",
    geographic_scope: partial.geographic_scope ?? "US-CA",
    timestamp_utc: partial.timestamp_utc ?? new Date().toISOString(),
    ingestion_time_utc: partial.ingestion_time_utc ?? new Date().toISOString(),
    signal_confidence: partial.signal_confidence ?? 0.81
  };
}

function createRiskDraft(partial: Partial<StructuredRiskDraft> = {}): StructuredRiskDraft {
  return {
    event_type: partial.event_type ?? "SUPPLY",
    severity_level: partial.severity_level ?? 4,
    impact_region: partial.impact_region ?? "US-CA",
    expected_duration_hours: partial.expected_duration_hours ?? 72,
    classification_confidence: partial.classification_confidence ?? 0.91,
    model_version: partial.model_version ?? "llm-model-v1",
    ...partial
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

test("local llm classifier calls endpoint and parses structured response", async () => {
  let callCount = 0;
  const classifier = new LocalLlmRiskClassifier({
    endpoint: "http://localhost:11434/classify",
    model: "risk-llm-v1",
    fetchImpl: async (_input, init) => {
      callCount += 1;
      const request = JSON.parse(String(init?.body)) as {
        model: string;
        signal: { event_id: string };
      };
      assert.equal(request.model, "risk-llm-v1");
      assert.equal(request.signal.event_id, "evt-llm-1");

      return successResponse({
        structured_risk: createRiskDraft({
          event_id: request.signal.event_id,
          event_type: "NEWS"
        })
      });
    }
  });

  const output = await classifier.classify(createSignal());
  assert.equal(callCount, 1);
  assert.equal(output.event_id, "evt-llm-1");
  assert.equal(output.event_type, "NEWS");
  assert.equal(output.classification_confidence, 0.91);
});

test("local llm classifier normalizes alias fields from adapter responses", async () => {
  const classifier = new LocalLlmRiskClassifier({
    endpoint: "http://localhost:11434/classify",
    model: "risk-llm-v1",
    fetchImpl: async () =>
      successResponse({
        structured_risk: {
          risk_type: "supply",
          severity: "5",
          region: "US-MX",
          duration_hours: "96",
          confidence: "0.88"
        }
      })
  });

  const output = await classifier.classify(createSignal({ event_id: "evt-llm-alias-1" }));
  assert.equal(output.event_type, "SUPPLY");
  assert.equal(output.severity_level, 5);
  assert.equal(output.impact_region, "US-MX");
  assert.equal(output.expected_duration_hours, 96);
  assert.equal(output.classification_confidence, 0.88);
});

test("local llm classifier parses openai-style choices payload", async () => {
  const classifier = new LocalLlmRiskClassifier({
    endpoint: "http://localhost:11434/classify",
    model: "risk-llm-v1",
    fetchImpl: async () =>
      successResponse({
        choices: [
          {
            message: {
              content:
                "Structured result:\n```json\n{\"riskEventType\":\"weather\",\"severityLevel\":4,\"impactRegion\":\"US-SE\",\"expectedDurationHours\":48,\"classificationConfidence\":0.79}\n```"
            }
          }
        ]
      })
  });

  const output = await classifier.classify(createSignal({ event_id: "evt-llm-choice-1" }));
  assert.equal(output.event_type, "WEATHER");
  assert.equal(output.severity_level, 4);
  assert.equal(output.impact_region, "US-SE");
  assert.equal(output.expected_duration_hours, 48);
  assert.equal(output.classification_confidence, 0.79);
});

test("local llm classifier retries transient http failures", async () => {
  let attempts = 0;
  const classifier = new LocalLlmRiskClassifier({
    endpoint: "http://localhost:11434/classify",
    model: "risk-llm-v1",
    maxRetries: 2,
    retryBaseDelayMs: 1,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) {
        return new Response("rate limited", { status: 429 });
      }
      return successResponse({
        result: createRiskDraft({ event_id: "evt-llm-2" })
      });
    }
  });

  const output = await classifier.classify(createSignal({ event_id: "evt-llm-2" }));
  assert.equal(attempts, 2);
  assert.equal(output.event_id, "evt-llm-2");
});

test("local llm classifier applies bounded queue backpressure", async () => {
  const firstResponse = deferred<Response>();
  let calls = 0;

  const classifier = new LocalLlmRiskClassifier({
    endpoint: "http://localhost:11434/classify",
    model: "risk-llm-v1",
    maxConcurrency: 1,
    maxQueueSize: 1,
    maxRetries: 0,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return firstResponse.promise;
      }
      return successResponse({ result: createRiskDraft() });
    }
  });

  const taskOne = classifier.classify(createSignal({ event_id: "evt-queue-1" }));
  const taskTwo = classifier.classify(createSignal({ event_id: "evt-queue-2" }));
  const taskThree = classifier.classify(createSignal({ event_id: "evt-queue-3" }));

  await assert.rejects(taskThree, /queue is full/i);

  firstResponse.resolve(successResponse({ result: createRiskDraft({ event_id: "evt-queue-1" }) }));
  const [one, two] = await Promise.all([taskOne, taskTwo]);

  assert.equal(one.event_id, "evt-queue-1");
  assert.equal(typeof two.event_type, "string");
  assert.equal(calls, 2);
  assert.equal(classifier.getMetrics().rejectedQueueOverflow, 1);
});

test("local llm classifier rejects malformed payload", async () => {
  const classifier = new LocalLlmRiskClassifier({
    endpoint: "http://localhost:11434/classify",
    model: "risk-llm-v1",
    fetchImpl: async () => successResponse({ id: "resp-1", usage: { prompt_tokens: 12 } })
  });

  await assert.rejects(
    classifier.classify(createSignal({ event_id: "evt-bad-1" })),
    /did not contain a structured risk draft/
  );
});
