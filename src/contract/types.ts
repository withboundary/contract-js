import type { ZodType } from "zod";
import type { ContractLogger } from "../logger/types.js";

export type FailureCategory =
  | "EMPTY_RESPONSE"
  | "REFUSAL"
  | "NO_JSON"
  | "TRUNCATED"
  | "PARSE_ERROR"
  | "VALIDATION_ERROR"
  | "RULE_ERROR"
  | "RUN_ERROR";

export interface Message {
  role: string;
  content: string;
}

// Flat description of a contract's output schema, emitted once per contract
// so the Boundary dashboard can render the contract's shape. Also useful
// standalone via `contract.describe()` — dump to README, OpenAPI, etc.
export interface SchemaField {
  name: string;
  type: string;
  constraints?: string;
}

// Wire shape for a rule's metadata. Emitted alongside `schema` so the backend
// can render a readable rule list and join failure counts by `name`.
export interface RuleDefinition {
  name: string;
  expression?: string;
  description?: string;
  fields?: string[];
}

// Structured failure produced by a single rule. Carries the rule's stable
// name + fields so any consumer (console, Sentry, Datadog, custom logger)
// can attribute the failure without parsing strings.
export interface RuleIssue {
  rule: {
    name: string;
    fields?: string[];
  };
  message: string;
}

// Wire format that @withboundary/sdk sends to the Boundary cloud. Exported
// here (not in the SDK) so the SDK can re-export without duplicating types
// and so anyone building a custom sink has a canonical shape to target.
//
// Fields flagged "capture.X" only appear when the corresponding capture
// policy is enabled on the logger — see @withboundary/sdk's logger options.
export interface BoundaryLogEvent {
  // identity
  contractName: string;
  environment?: string;
  timestamp: string; // ISO 8601

  // run metadata (capture.metadata, default ON)
  attempt: number;
  maxAttempts: number;
  ok: boolean;
  durationMs: number;

  // failure details (capture.errors, default ON)
  category?: FailureCategory;
  issues?: string[];
  // Rule names that failed on this attempt. Lets the backend attribute
  // failures to specific rules (joins to rule_failure_counts.rule_key).
  ruleFailures?: string[];

  // repair context (capture.repairs, default ON)
  repairs?: Message[];

  // raw data (both default OFF — opt-in only)
  input?: unknown;
  output?: unknown;

  // Name of the LLM that produced the output, e.g. "gpt-4o", "claude-haiku".
  // Sourced from the logger default and overridable per call via
  // `contract.accept(run, { model })`.
  model?: string;

  // Contract shape metadata. Emitted on the first event per contract per
  // process — backend COALESCEs into contracts.schema_json and the rules
  // table, so re-sending is safe but wasteful.
  schema?: SchemaField[];
  rules?: RuleDefinition[];
}

export interface AttemptDetail {
  raw: string;
  cleaned: unknown;
  issues: string[];
  // Populated when category === "RULE_ERROR" — structured per-rule failures.
  // Parallel to `issues` (one entry per failed rule) but typed.
  ruleIssues?: RuleIssue[];
  category: FailureCategory;
}

export interface ContractError {
  message: string;
  attempts: AttemptDetail[];
}

export interface ContractAttempt {
  attempt: number;
  maxAttempts: number;
  instructions: string;
  repairs: Message[];
  previousError?: ContractError;
  previousCategory?: FailureCategory;
}

// A rule is a named predicate over the contract's output data.
//
// - `name`        stable machine key. Unique within a contract. Joins to
//                 backend rule_failure_counts.rule_key; never display text.
// - `description` human label for UI, docs, and diffs. This is what the
//                 dashboard renders and what readable rule diffs compare
//                 against. Phrased as a positive statement of what the rule
//                 ensures ("Hot leads must have score > 70"), not as an
//                 error.
// - `check`       the predicate. Return shape:
//                   `true`   → pass
//                   `false`  → fail, use `rule.message` (or "Rule failed")
//                   string   → fail, use the returned string — overrides
//                              `rule.message` for that specific failure so
//                              rules can produce dynamic per-failure text
//                              like `confidence too low: 0.42`
// - `message`     static fallback failure text shown when `check` returns
//                 false. Separate from `description`: description is what
//                 the rule *is*, message is what to *say when it fails*.
// - `fields`      which output fields the rule touches. Powers per-field
//                 grouping in the dashboard and field-aware repair hints.
export interface Rule<T> {
  name: string;
  description?: string;
  check: (data: T) => boolean | string;
  message?: string;
  fields?: string[];
}

export type RepairFn = (detail: AttemptDetail) => Message[];

export interface AttemptEvent {
  number: number;
  ok: boolean;
  raw: string;
  issues: string[];
  durationMS: number;
  category?: FailureCategory;
}

export type AttemptHook = (event: AttemptEvent) => void;

export type RetryBackoff = "none" | "linear" | "exponential";

export interface RetryPolicy {
  maxAttempts: number;
  backoff: RetryBackoff;
  baseMs: number;
}

export interface RetryOptions {
  maxAttempts?: number;
  backoff?: RetryBackoff;
  baseMs?: number;
}

export interface InstructionsOptions {
  suffix?: string;
}

export interface ContractOptions<T = unknown> {
  rules?: Rule<T>[];
  repairs?: Partial<Record<FailureCategory, RepairFn | false>>;
  retry?: RetryOptions;
  instructions?: InstructionsOptions;
  onAttempt?: AttemptHook;
  logger?: ContractLogger<T>;
  debug?: boolean;
  // Optional per-call model label. When set on `accept(run, { model })`,
  // it overrides the logger's default model on that run. Purely metadata —
  // it doesn't affect contract behavior, it just flows into BoundaryLogEvent.
  model?: string;
}

export type RunFn = (attempt: ContractAttempt) => Promise<string | null>;

export type ContractResult<T> = Success<T> | Failure;

export interface Success<T> {
  ok: true;
  data: T;
  attempts: number;
  raw: string;
  durationMS: number;
}

export interface Failure {
  ok: false;
  error: ContractError;
}

export interface DefinedContract<T> {
  accept: (
    run: RunFn,
    runtimeOptions?: ContractOptions<T>,
  ) => Promise<ContractResult<T>>;
  // Standalone introspection — returns the flat schema + rule metadata the
  // contract emits on its first event. Safe to call without running. Cached.
  describe: () => { schema: SchemaField[]; rules: RuleDefinition[] };
}

export interface ContractConfig<T> extends ContractOptions<T> {
  // Human-readable identifier for this contract. Required so every run carries
  // identity end-to-end — it flows through every ContractLogger hook context
  // and lands on the Boundary dashboard's trace records. Pick something you'd
  // want to see in a log line: "lead-scoring", "invoice-extraction",
  // "agent-action-validation".
  name: string;
  schema: ZodType<T>;
}
