import type { ExternalSignal } from "../../modules/signal-ingestion/types.js";
import { extractStructuredRiskDraft } from "../../modules/risk-classification/draft-normalization.js";
import type { StructuredRiskDraft } from "../../modules/risk-classification/types.js";
import type { RiskClassificationLlmAdapterConfig } from "./config.js";

type FetchLike = typeof fetch;

interface QueueTask<TValue> {
  run: () => Promise<TValue>;
  resolve: (value: TValue) => void;
  reject: (error: unknown) => void;
}

export interface AdapterClassifyRequest {
  model?: string;
  instructions?: string;
  signal: ExternalSignal;
}

export interface AdapterMetrics {
  requests_total: number;
  requests_failed: number;
  requests_in_flight: number;
  queue_depth: number;
  queue_overflow_rejections: number;
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

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
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

function parseUnknownJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}

function extractChoiceContent(response: unknown): string {
  if (!isObjectRecord(response)) {
    throw new Error("LLM response is not an object");
  }

  const choices = response.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0];
    if (isObjectRecord(first)) {
      const message = first.message;
      if (isObjectRecord(message)) {
        const content = message.content;
        if (typeof content === "string") {
          return content;
        }
        if (Array.isArray(content)) {
          const textParts = content
            .map((item) => {
              if (!isObjectRecord(item)) {
                return undefined;
              }
              return asNonEmptyString(item.text) ?? asNonEmptyString(item.content);
            })
            .filter((part): part is string => typeof part === "string");

          if (textParts.length > 0) {
            return textParts.join("\n");
          }
        }
      }
    }
  }

  const outputText = asNonEmptyString(response.output_text) ?? asNonEmptyString(response.text);
  if (outputText) {
    return outputText;
  }

  throw new Error("LLM response did not include text content");
}

function buildSystemPrompt(): string {
  return [
    "You classify supply chain risk events.",
    "Return only JSON with fields from StructuredRiskDraft.",
    "Do not include markdown, prose, or code fences."
  ].join(" ");
}

function buildUserPrompt(signal: ExternalSignal, instructions?: string): string {
  const userInstructions = asNonEmptyString(instructions);
  return [
    userInstructions ?? "Classify this signal for supply-chain risk.",
    "Input signal JSON:",
    JSON.stringify(signal)
  ].join("\n");
}

function isHttpRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function retryDelayMs(attempt: number): number {
  const base = 200;
  const jitter = Math.random() * 100;
  return Math.round(base * 2 ** (attempt - 1) + jitter);
}

export class QueueOverflowError extends Error {
  constructor(maxQueueSize: number) {
    super(`Adapter queue is full (maxQueueSize=${maxQueueSize})`);
    this.name = "QueueOverflowError";
  }
}

export interface RiskClassificationLlmAdapterServiceOptions {
  config: RiskClassificationLlmAdapterConfig;
  fetchImpl?: FetchLike;
}

export class RiskClassificationLlmAdapterService {
  private readonly config: RiskClassificationLlmAdapterConfig;
  private readonly fetchImpl: FetchLike;

  private readonly queue: QueueTask<StructuredRiskDraft>[] = [];
  private inFlight = 0;
  private totalRequests = 0;
  private failedRequests = 0;
  private queueOverflows = 0;

  constructor(options: RiskClassificationLlmAdapterServiceOptions) {
    this.config = options.config;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  getMetrics(): AdapterMetrics {
    return {
      requests_total: this.totalRequests,
      requests_failed: this.failedRequests,
      requests_in_flight: this.inFlight,
      queue_depth: this.queue.length,
      queue_overflow_rejections: this.queueOverflows
    };
  }

  async classify(request: AdapterClassifyRequest): Promise<StructuredRiskDraft> {
    this.totalRequests += 1;
    try {
      return await this.schedule(() => this.classifyWithRetry(request));
    } catch (error) {
      this.failedRequests += 1;
      throw error;
    }
  }

  private schedule(task: () => Promise<StructuredRiskDraft>): Promise<StructuredRiskDraft> {
    if (this.inFlight < this.config.maxConcurrency) {
      return this.runTask(task);
    }

    if (this.queue.length >= this.config.maxQueueSize) {
      this.queueOverflows += 1;
      return Promise.reject(new QueueOverflowError(this.config.maxQueueSize));
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ run: task, resolve, reject });
    });
  }

  private runTask(task: () => Promise<StructuredRiskDraft>): Promise<StructuredRiskDraft> {
    this.inFlight += 1;
    return task().finally(() => {
      this.inFlight -= 1;
      this.drainQueue();
    });
  }

  private drainQueue(): void {
    if (this.inFlight >= this.config.maxConcurrency) {
      return;
    }

    const next = this.queue.shift();
    if (!next) {
      return;
    }

    this.runTask(next.run).then(next.resolve, next.reject);
  }

  private async classifyWithRetry(request: AdapterClassifyRequest): Promise<StructuredRiskDraft> {
    const maxAttempts = 3;
    let attempt = 1;

    while (true) {
      try {
        return await this.invokeUpstream(request);
      } catch (error) {
        if (attempt >= maxAttempts) {
          throw error;
        }

        const status = this.extractStatusCode(error);
        if (typeof status === "number" && !isHttpRetryableStatus(status)) {
          throw error;
        }

        await sleep(retryDelayMs(attempt));
        attempt += 1;
      }
    }
  }

  private extractStatusCode(error: unknown): number | undefined {
    if (!isObjectRecord(error)) {
      return undefined;
    }
    const status = error.status;
    return typeof status === "number" ? status : undefined;
  }

  private async invokeUpstream(request: AdapterClassifyRequest): Promise<StructuredRiskDraft> {
    const model = asNonEmptyString(request.model) ?? this.config.defaultModel;
    const url = `${stripTrailingSlash(this.config.upstreamBaseUrl)}/v1/chat/completions`;

    const headers: Record<string, string> = {
      "content-type": "application/json"
    };

    if (this.config.upstreamApiKey) {
      headers.authorization = `Bearer ${this.config.upstreamApiKey}`;
    }

    const body = {
      model,
      temperature: 0,
      response_format: {
        type: "json_object"
      },
      messages: [
        {
          role: "system",
          content: buildSystemPrompt()
        },
        {
          role: "user",
          content: buildUserPrompt(request.signal, request.instructions)
        }
      ]
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.config.requestTimeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const payload = await response.text();
        const error = new Error(`Upstream LLM returned HTTP ${response.status}`) as Error & {
          status: number;
          payload: string;
        };
        error.status = response.status;
        error.payload = payload;
        throw error;
      }

      const raw = (await response.json()) as unknown;
      const content = extractChoiceContent(raw);

      try {
        return extractStructuredRiskDraft(parseUnknownJson(content));
      } catch {
        const candidate = extractJsonCandidate(content);
        if (!candidate) {
          throw new Error("Unable to parse JSON from upstream LLM response content");
        }
        return extractStructuredRiskDraft(parseUnknownJson(candidate));
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        const timeoutError = new Error(
          `Upstream LLM timed out after ${this.config.requestTimeoutMs}ms`
        ) as Error & { status: number };
        timeoutError.status = 408;
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
