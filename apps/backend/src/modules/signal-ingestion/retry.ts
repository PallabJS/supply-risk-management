export interface RetryContext {
  attempt: number;
  attempts: number;
  delayMs: number;
  error: unknown;
}

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  onRetry?: (context: RetryContext) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeAttempts(attempts?: number): number {
  if (!Number.isFinite(attempts)) {
    return 3;
  }
  return Math.max(1, Math.trunc(attempts ?? 3));
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

export async function withRetry<T>(
  task: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const attempts = normalizeAttempts(options.attempts);
  const baseDelayMs = options.baseDelayMs ?? 100;
  const onRetry = options.onRetry ?? (() => {});

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        break;
      }
      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      onRetry({
        attempt,
        attempts,
        delayMs,
        error,
      });
      await sleep(delayMs);
    }
  }

  throw normalizeError(lastError);
}
