# API Reference

`@withboundary/contract` is a local acceptance engine for structured LLM output.
It exports a small public surface: `defineContract`, `enforce`, lifecycle
loggers, and engine primitives for custom pipelines.

## `defineContract(config)`

Define a reusable contract with a required name, a Zod schema, optional rules,
retry policy, repair overrides, and logger hooks.

```ts
import { defineContract } from "@withboundary/contract";
import { z } from "zod";

const LeadScore = z.object({
  tier: z.enum(["hot", "warm", "cold"]),
  score: z.number().min(0).max(100),
});

const contract = defineContract({
  name: "lead-scoring",
  schema: LeadScore,
  rules: [
    {
      name: "hot_requires_high_score",
      description: "Hot leads must have a score of at least 70",
      fields: ["tier", "score"],
      check: (lead) =>
        lead.tier !== "hot" ||
        lead.score >= 70 ||
        `tier is "hot" but score is ${lead.score} (minimum 70)`,
    },
  ],
});
```

```ts
function defineContract<T>(config: ContractConfig<T>): DefinedContract<T>;
```

### `ContractConfig<T>`

| Field          | Type                                                  | Description                                                    |
| -------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| `name`         | `string`                                              | Required stable name for logs, traces, and diagnostics.        |
| `schema`       | `z.ZodType<T>`                                        | Zod v3 or v4 schema for the accepted output.                   |
| `rules`        | `Rule<T>[]`                                           | Named deterministic checks beyond the schema.                  |
| `retry`        | `RetryOptions`                                        | Retry policy. Defaults to 3 attempts, no backoff.              |
| `repairs`      | `Partial<Record<FailureCategory, RepairFn \| false>>` | Override or disable repair messages by category.               |
| `instructions` | `{ suffix?: string }`                                 | Add domain-specific text after generated schema instructions.  |
| `onAttempt`    | `AttemptHook`                                         | Synchronous hook fired after each attempt.                     |
| `logger`       | `ContractLogger<T>`                                   | Lifecycle logger for console, Boundary SDK, or custom sinks.   |
| `debug`        | `boolean`                                             | Enables built-in debug output.                                 |
| `model`        | `string`                                              | Metadata label that logger sinks can attach to emitted events. |

### `contract.accept(run, runtimeOptions?)`

Run the acceptance loop. Runtime options merge over the contract definition for
that call only.

```ts
const result = await contract.accept(
  async (attempt) => {
    const res = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: attempt.instructions },
        { role: "user", content: "Score this lead..." },
        ...attempt.repairs,
      ],
    });

    return res.output_text;
  },
  { model: "gpt-4.1-mini" },
);
```

### `ContractAttempt`

The `run` function receives this context on every attempt:

| Field              | Type              | Description                                                              |
| ------------------ | ----------------- | ------------------------------------------------------------------------ |
| `attempt`          | `number`          | Current attempt number, 1-indexed.                                       |
| `maxAttempts`      | `number`          | Maximum attempts for this run.                                           |
| `instructions`     | `string`          | Schema-derived output instructions.                                      |
| `repairs`          | `Message[]`       | Repair messages generated from the previous failure. Empty on attempt 1. |
| `previousError`    | `ContractError`   | Full error state from the previous failed attempt.                       |
| `previousCategory` | `FailureCategory` | Failure category from the previous failed attempt.                       |

## `enforce(schema, run, options)`

One-off shorthand for `defineContract(...).accept(...)`. `options.name` is
required so the run has a stable identity.

```ts
const result = await enforce(LeadScore, runLLM, {
  name: "lead-scoring",
  rules,
});
```

```ts
function enforce<T>(
  schema: ContractSchema<T>,
  run: RunFn,
  options: ContractOptions<T> & { name: string },
): Promise<ContractResult<T>>;
```

## `ContractResult<T>`

Validation failures are returned, not thrown. Your `run` function can throw;
the engine captures that as a `RUN_ERROR` attempt and applies the retry policy.

```ts
type ContractResult<T> =
  | {
      ok: true;
      data: T;
      attempts: number;
      raw: string;
      durationMS: number;
    }
  | {
      ok: false;
      error: ContractError;
    };
```

## Rules

Rules are named checks over parsed, typed data. They are the right place for
cross-field math, policy consistency, confidence thresholds, and other business
invariants that schemas cannot express cleanly.

```ts
type Rule<T> = {
  name: string;
  description?: string;
  fields?: string[];
  message?: string;
  check: (data: T) => boolean | string;
};
```

- Return `true` to pass.
- Return `false` to fail with `message` or `"Rule failed"`.
- Return a `string` to fail with that exact repair issue.
- Set `fields` when the rule delegates to helpers or may be minified. Simple
  field reads are inferred automatically.

## `contract.describe()`

Return the flattened schema and rule metadata used by logger sinks.

```ts
const description = contract.describe();
// { schema: SchemaField[], rules: RuleDefinition[] }
```

## `createConsoleLogger(options?)`

Print lifecycle hooks for local debugging.

```ts
import { createConsoleLogger } from "@withboundary/contract";

const logger = createConsoleLogger({
  showInstructions: false,
  showRepairs: true,
  showRawOutput: false,
  showCleanedOutput: true,
});
```

## `ContractLogger<T>`

Logger hooks receive a stable `contractName` and a per-call `runHandle`.
Use `runHandle` for any per-run scratch state so concurrent `accept()` calls
on the same contract instance stay isolated.

```ts
type ContractLogger<T = unknown> = {
  onRunStart?: (ctx: {
    contractName: string;
    runHandle: string;
    maxAttempts: number;
    rulesCount: number;
    model?: string;
  }) => void;
  onAttemptStart?: (ctx: {
    contractName: string;
    runHandle: string;
    attempt: number;
    maxAttempts: number;
    instructions: string;
    repairs: unknown[];
  }) => void;
  onVerifySuccess?: (ctx: {
    contractName: string;
    runHandle: string;
    attempt: number;
    data: T;
    durationMs: number;
  }) => void;
  onVerifyFailure?: (ctx: {
    contractName: string;
    runHandle: string;
    attempt: number;
    category: string;
    issues: string[];
    durationMs: number;
  }) => void;
  onRunSuccess?: (ctx: {
    contractName: string;
    runHandle: string;
    attempts: number;
    data: T;
    totalDurationMs: number;
  }) => void;
  onRunFailure?: (ctx: {
    contractName: string;
    runHandle: string;
    attempts: number;
    category?: string;
    message: string;
    totalDurationMs: number;
  }) => void;
};
```

The exported type includes additional hooks for raw output, cleaned output,
repair generation, and retry scheduling.

## Engine Primitives

### `instructions(schema, options?)`

Generate schema-driven prompt instructions.

```ts
const text = instructions(LeadScore, {
  suffix: "Use conservative scoring when evidence is ambiguous.",
});
```

### `clean(raw)`

Extract and normalize JSON-like LLM output from Markdown fences, surrounding
prose, stringified primitives, and common model formatting.

````ts
clean('```json\n{"score":"85","qualified":"true"}\n```');
// { score: 85, qualified: true }
````

### `verify(data, schema, rules?)`

Validate parsed data with a Zod schema and optional named rules.

```ts
const checked = verify({ tier: "hot", score: 25 }, LeadScore, rules);
```

### `repair(detail, overrides?)`

Turn an attempt failure into messages for the next attempt. Return `false` to
disable repair for a category.

```ts
if (!checked.ok) {
  const messages = repair(checked.error.attempts[0]);
}
```

### `classify(raw, cleaned)`

Categorize failed output as `EMPTY_RESPONSE`, `REFUSAL`, `NO_JSON`,
`TRUNCATED`, `PARSE_ERROR`, `VALIDATION_ERROR`, `RULE_ERROR`, or `RUN_ERROR`.

```ts
const category = classify("I'm sorry, I can't help with that.", null);
```
