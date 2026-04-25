import type { RuleDefinition, RuleIssue, SchemaField } from "../contract/types.js";

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

// Every hook ctx carries two identifiers:
//   - `contractName`: the name passed to defineContract — stable across
//     every call, suitable for attribution to a specific contract.
//   - `runHandle`: a per-call unique id minted by the engine on every
//     accept() invocation. Lets loggers key their per-run scratch state
//     by-call instead of by-name, so concurrent accept() calls on the
//     same contract don't collide in shared maps.
export interface RunHookContextBase {
  contractName: string;
  runHandle: string;
}

export type ContractLogger<T = unknown> = {
  onRunStart?: (ctx: RunHookContextBase & {
    maxAttempts: number;
    rulesCount: number;
    // Per-call model override (from `accept(run, { model })`). When absent,
    // loggers should fall back to their own default.
    model?: string;
    retry: {
      maxAttempts: number;
      backoff: RetryBackoffMode;
      baseMs: number;
    };
    // Populated on the first run per contract per process — the flat schema
    // and rule metadata. Sinks that persist contract shape (e.g. the Boundary
    // SDK) forward these; most loggers can ignore them.
    schema?: SchemaField[];
    rules?: RuleDefinition[];
  }) => void;
  onAttemptStart?: (ctx: RunHookContextBase & {
    attempt: number;
    maxAttempts: number;
    instructions: string;
    repairs: Array<unknown>;
  }) => void;
  onRawOutput?: (ctx: RunHookContextBase & {
    attempt: number;
    raw: string;
  }) => void;
  onCleanedOutput?: (ctx: RunHookContextBase & {
    attempt: number;
    cleaned: unknown;
  }) => void;
  onVerifySuccess?: (ctx: RunHookContextBase & {
    attempt: number;
    data: T;
    durationMs: number;
  }) => void;
  onVerifyFailure?: (ctx: RunHookContextBase & {
    attempt: number;
    category: string;
    issues: string[];
    // Structured per-rule failures, populated when category === "RULE_ERROR".
    // Standalone consumers can use these to attribute failures without
    // parsing strings; the SDK forwards them as `ruleFailures` on events.
    ruleIssues?: RuleIssue[];
    durationMs: number;
  }) => void;
  onRepairGenerated?: (ctx: RunHookContextBase & {
    attempt: number;
    category: string;
    repairMessage: string;
  }) => void;
  onRetryScheduled?: (ctx: RunHookContextBase & {
    attempt: number;
    nextAttempt: number;
    category: string;
    delayMs: number;
  }) => void;
  onRunSuccess?: (ctx: RunHookContextBase & {
    attempts: number;
    data: T;
    totalDurationMs: number;
  }) => void;
  onRunFailure?: (ctx: RunHookContextBase & {
    attempts: number;
    category?: string;
    message: string;
    totalDurationMs: number;
  }) => void;
};
