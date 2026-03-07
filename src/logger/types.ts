export type RetryBackoffMode = "none" | "linear" | "exponential";

export interface ConsoleLoggerOptions {
  prefix?: string;
  showInstructions?: boolean;
  showRepairs?: boolean;
  showRawOutput?: boolean;
  showCleanedOutput?: boolean;
  showSuccessData?: boolean;
  maxStringLength?: number;
}

export type ContractLogger<T = unknown> = {
  onRunStart?: (ctx: {
    maxAttempts: number;
    hasInvariants: boolean;
    retry: {
      maxAttempts: number;
      backoff: RetryBackoffMode;
      baseMs: number;
    };
  }) => void;
  onAttemptStart?: (ctx: {
    attempt: number;
    maxAttempts: number;
    instructions: string;
    repairs: Array<unknown>;
  }) => void;
  onRawOutput?: (ctx: {
    attempt: number;
    raw: string;
  }) => void;
  onCleanedOutput?: (ctx: {
    attempt: number;
    cleaned: unknown;
  }) => void;
  onVerifySuccess?: (ctx: {
    attempt: number;
    data: T;
    durationMs: number;
  }) => void;
  onVerifyFailure?: (ctx: {
    attempt: number;
    category: string;
    issues: string[];
    durationMs: number;
  }) => void;
  onRepairGenerated?: (ctx: {
    attempt: number;
    category: string;
    repairMessage: string;
  }) => void;
  onRetryScheduled?: (ctx: {
    attempt: number;
    nextAttempt: number;
    category: string;
    delayMs: number;
  }) => void;
  onRunSuccess?: (ctx: {
    attempts: number;
    data: T;
    totalDurationMs: number;
  }) => void;
  onRunFailure?: (ctx: {
    attempts: number;
    category?: string;
    message: string;
    totalDurationMs: number;
  }) => void;
};
