import type { RetryPolicy } from "../contract/types.js";

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  backoff: "none",
  baseMs: 200,
};

export function resolveRetryPolicy(options?: Partial<RetryPolicy>): RetryPolicy {
  return {
    maxAttempts: options?.maxAttempts ?? DEFAULT_RETRY_POLICY.maxAttempts,
    backoff: options?.backoff ?? DEFAULT_RETRY_POLICY.backoff,
    baseMs: options?.baseMs ?? DEFAULT_RETRY_POLICY.baseMs,
  };
}

export function computeRetryDelay(attempt: number, policy: RetryPolicy): number {
  if (attempt <= 1) {
    return 0;
  }

  const retryNumber = attempt - 1;

  switch (policy.backoff) {
    case "none":
      return 0;
    case "linear":
      return policy.baseMs * retryNumber;
    case "exponential":
      return policy.baseMs * Math.pow(2, retryNumber - 1);
    default:
      return 0;
  }
}

export function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
