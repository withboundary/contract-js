import type { RetryPolicy } from "./types.js";

export const DEFAULT_POLICY: RetryPolicy = {
  maxAttempts: 3,
  backoff: "none",
  backoffBaseMS: 200,
};

export function resolvePolicy(
  options?: Partial<RetryPolicy>,
): RetryPolicy {
  return {
    maxAttempts: options?.maxAttempts ?? DEFAULT_POLICY.maxAttempts,
    backoff: options?.backoff ?? DEFAULT_POLICY.backoff,
    backoffBaseMS: options?.backoffBaseMS ?? DEFAULT_POLICY.backoffBaseMS,
  };
}

export function computeDelay(
  attempt: number,
  policy: RetryPolicy,
): number {
  if (attempt <= 1) {
    return 0;
  }

  const retryNumber = attempt - 1;

  switch (policy.backoff) {
    case "none":
      return 0;
    case "linear":
      return policy.backoffBaseMS * retryNumber;
    case "exponential":
      return policy.backoffBaseMS * Math.pow(2, retryNumber - 1);
    default:
      return 0;
  }
}

export function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}
