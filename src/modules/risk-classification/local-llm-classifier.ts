import type { ExternalSignal, Logger } from "../signal-ingestion/types.js";
import { extractStructuredRiskDraft } from "./draft-normalization.js";
import type { RiskClassifier, StructuredRiskDraft } from "./types.js";

export type LocalLlmInference = (signal: ExternalSignal) => Promise<StructuredRiskDraft>;
type FetchLike = typeof fetch;

interface QueueTask<TValue> {
  run: () => Promise<TValue>;
  resolve: (value: TValue) => void;
  reject: (error: unknown) => void;
}

interface LlmHttpErrorDetails {
  status: number;
  body: string;
}

export interface LocalLlmRiskClassifierOptions {
  endpoint: string;
  model: string;
  apiKey?: string;
  timeoutMs?: number;
  maxConcurrency?: number;
  maxQueueSize?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  name?: string;
  logger?: Logger;
  fetchImpl?: FetchLike;
  inference?: LocalLlmInference;
}

export interface LlmClassifierMetrics {
  inFlight: number;
  queued: number;
  completed: number;
  failed: number;
  rejectedQueueOverflow: number;
}

function createNoopLogger(): Logger {
  return {
    info() {},
    warn() {},
    error() {}
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function jitterDelay(baseDelayMs: number, attempt: number): number {
  const exponential = baseDelayMs * 2 ** (attempt - 1);
  const jitter = Math.random() * baseDelayMs;
  return Math.round(exponential + jitter);
}

function normalizePositiveInt(
  value: number | undefined,
  fallback: number,
  fieldName: string
): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return value;
}

function normalizeNonNegativeInt(
  value: number | undefined,
  fallback: number,
  fieldName: string
): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }
  return value;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function extractJsonCandidate(text: string): string | undefined {
  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }

  return undefined;
}

function collectChoiceTextCandidates(payload: Record<string, unknown>): string[] {
  const candidates: string[] = [];
  const choices = payload.choices;
  if (!Array.isArray(choices)) {
    return candidates;
  }

  for (const choice of choices) {
    if (!isObjectRecord(choice)) {
      continue;
    }

    const directText = asNonEmptyString(choice.text);
    if (directText) {
      candidates.push(directText);
    }

    const message = choice.message;
    if (!isObjectRecord(message)) {
      continue;
    }

    const content = message.content;
    const contentText = asNonEmptyString(content);
    if (contentText) {
      candidates.push(contentText);
      continue;
    }

    if (!Array.isArray(content)) {
      continue;
    }

    for (const item of content) {
      if (!isObjectRecord(item)) {
        continue;
      }

      const part = asNonEmptyString(item.text) ?? asNonEmptyString(item.content);
      if (part) {
        candidates.push(part);
      }
    }
  }

  return candidates;
}

function extractDraftFromResponse(payload: unknown): StructuredRiskDraft {
  if (!isObjectRecord(payload)) {
    throw new Error("LLM response payload must be an object");
  }

  const candidates: unknown[] = [
    payload.structured_risk,
    payload.structuredRisk,
    payload.result,
    payload.data,
    payload.classification,
    payload.risk,
    payload
  ];

  for (const candidate of candidates) {
    if (!isObjectRecord(candidate)) {
      continue;
    }

    try {
      return extractStructuredRiskDraft(candidate);
    } catch {
      continue;
    }
  }

  const textCandidates: string[] = [
    asNonEmptyString(payload.output_text),
    asNonEmptyString(payload.text),
    asNonEmptyString(payload.content),
    ...collectChoiceTextCandidates(payload)
  ].filter((value): value is string => typeof value === "string");

  for (const candidate of textCandidates) {
    if (typeof candidate !== "string" || candidate.trim() === "") {
      continue;
    }

    const jsonCandidates = [candidate, extractJsonCandidate(candidate)].filter(
      (value): value is string => typeof value === "string"
    );

    for (const jsonCandidate of jsonCandidates) {
      const parsed = parseJson(jsonCandidate);
      if (!isObjectRecord(parsed)) {
        continue;
      }

      try {
        return extractStructuredRiskDraft(parsed);
      } catch {
        continue;
      }
    }
  }

  throw new Error("LLM response did not contain a structured risk draft");
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function isLlmHttpError(error: unknown): error is Error & LlmHttpErrorDetails {
  if (!(error instanceof Error)) {
    return false;
  }
  if (!("status" in error)) {
    return false;
  }
  return typeof (error as { status: unknown }).status === "number";
}

function isRetryableError(error: unknown): boolean {
  if (isLlmHttpError(error)) {
    return isRetryableStatus(error.status);
  }

  if (!(error instanceof Error)) {
    return false;
  }

  if (error.name === "AbortError") {
    return true;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("socket") ||
    message.includes("timeout") ||
    message.includes("network")
  );
}

function createHttpError(status: number, body: string): Error & LlmHttpErrorDetails {
  const error = new Error(`LLM request failed with status ${status}`) as Error &
    LlmHttpErrorDetails;
  error.status = status;
  error.body = body;
  return error;
}

function buildRequestBody(signal: ExternalSignal, model: string): string {
  return JSON.stringify({
    model,
    response_format: "structured-risk-draft-v1",
    signal,
    instructions:
      "Classify supply-chain risk and return only JSON fields for StructuredRiskDraft."
  });
}

export class LocalLlmRiskClassifier implements RiskClassifier {
  readonly name: string;

  private readonly endpoint: string | undefined;
  private readonly model: string;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;
  private readonly maxConcurrency: number;
  private readonly maxQueueSize: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly logger: Logger;
  private readonly fetchImpl: FetchLike;
  private readonly inference: LocalLlmInference | undefined;

  private inFlight = 0;
  private readonly queue: QueueTask<StructuredRiskDraft>[] = [];
  private completed = 0;
  private failed = 0;
  private rejectedQueueOverflow = 0;

  constructor(inference: LocalLlmInference, name?: string);
  constructor(options: LocalLlmRiskClassifierOptions);
  constructor(
    optionsOrInference: LocalLlmRiskClassifierOptions | LocalLlmInference,
    legacyName = "local-llm-classifier"
  ) {
    if (typeof optionsOrInference === "function") {
      this.inference = optionsOrInference;
      this.endpoint = undefined;
      this.model = "inference-adapter";
      this.apiKey = undefined;
      this.timeoutMs = 10_000;
      this.maxConcurrency = 8;
      this.maxQueueSize = 500;
      this.maxRetries = 2;
      this.retryBaseDelayMs = 100;
      this.name = legacyName;
      this.logger = createNoopLogger();
      this.fetchImpl = fetch;
      return;
    }

    const options = optionsOrInference;
    if (!options.endpoint || options.endpoint.trim() === "") {
      throw new Error("LocalLlmRiskClassifier requires a non-empty endpoint");
    }
    if (!options.model || options.model.trim() === "") {
      throw new Error("LocalLlmRiskClassifier requires a non-empty model");
    }

    this.endpoint = options.endpoint;
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.timeoutMs = normalizePositiveInt(options.timeoutMs, 8_000, "timeoutMs");
    this.maxConcurrency = normalizePositiveInt(
      options.maxConcurrency,
      8,
      "maxConcurrency"
    );
    this.maxQueueSize = normalizePositiveInt(options.maxQueueSize, 500, "maxQueueSize");
    this.maxRetries = normalizeNonNegativeInt(options.maxRetries, 2, "maxRetries");
    this.retryBaseDelayMs = normalizePositiveInt(
      options.retryBaseDelayMs,
      150,
      "retryBaseDelayMs"
    );
    this.name = options.name ?? "local-llm-classifier";
    this.logger = options.logger ?? createNoopLogger();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.inference = options.inference;
  }

  getMetrics(): LlmClassifierMetrics {
    return {
      inFlight: this.inFlight,
      queued: this.queue.length,
      completed: this.completed,
      failed: this.failed,
      rejectedQueueOverflow: this.rejectedQueueOverflow
    };
  }

  async classify(signal: ExternalSignal): Promise<StructuredRiskDraft> {
    return this.schedule(() => this.classifyWithRetry(signal));
  }

  private schedule(task: () => Promise<StructuredRiskDraft>): Promise<StructuredRiskDraft> {
    if (this.inFlight < this.maxConcurrency) {
      return this.runTask(task);
    }

    if (this.queue.length >= this.maxQueueSize) {
      this.rejectedQueueOverflow += 1;
      return Promise.reject(
        new Error(
          `LLM classification queue is full (maxQueueSize=${this.maxQueueSize}); applying backpressure`
        )
      );
    }

    return new Promise((resolve, reject) => {
      this.queue.push({
        run: task,
        resolve,
        reject
      });
    });
  }

  private runTask(task: () => Promise<StructuredRiskDraft>): Promise<StructuredRiskDraft> {
    this.inFlight += 1;
    return task()
      .then((result) => {
        this.completed += 1;
        return result;
      })
      .catch((error) => {
        this.failed += 1;
        throw error;
      })
      .finally(() => {
        this.inFlight -= 1;
        this.drainQueue();
      });
  }

  private drainQueue(): void {
    if (this.inFlight >= this.maxConcurrency) {
      return;
    }
    const next = this.queue.shift();
    if (!next) {
      return;
    }

    this.runTask(next.run).then(next.resolve, next.reject);
  }

  private async classifyWithRetry(signal: ExternalSignal): Promise<StructuredRiskDraft> {
    const maxAttempts = this.maxRetries + 1;
    let attempt = 1;

    while (true) {
      try {
        return await this.invokeClassifier(signal);
      } catch (error) {
        if (attempt >= maxAttempts || !isRetryableError(error)) {
          throw error;
        }

        const delayMs = jitterDelay(this.retryBaseDelayMs, attempt);
        this.logger.warn("llm classification request failed, retrying", {
          event_id: signal.event_id,
          attempt,
          max_attempts: maxAttempts,
          delayMs,
          error: error instanceof Error ? error.message : String(error)
        });
        await sleep(delayMs);
        attempt += 1;
      }
    }
  }

  private async invokeClassifier(signal: ExternalSignal): Promise<StructuredRiskDraft> {
    if (this.inference) {
      return this.inference(signal);
    }
    if (!this.endpoint) {
      throw new Error("LocalLlmRiskClassifier endpoint is not configured");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        "content-type": "application/json"
      };
      if (typeof this.apiKey === "string" && this.apiKey.trim() !== "") {
        headers.authorization = `Bearer ${this.apiKey}`;
      }

      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers,
        body: buildRequestBody(signal, this.model),
        signal: controller.signal
      });

      if (!response.ok) {
        const body = await response.text();
        throw createHttpError(response.status, body);
      }

      const payload = (await response.json()) as unknown;
      return extractDraftFromResponse(payload);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`LLM request timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
