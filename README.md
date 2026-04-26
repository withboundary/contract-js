# @withboundary/contract

[![npm version](https://img.shields.io/npm/v/@withboundary/contract.svg)](https://www.npmjs.com/package/@withboundary/contract)
[![license](https://img.shields.io/npm/l/@withboundary/contract.svg)](https://github.com/withboundary/contract/blob/main/LICENSE)

Your LLM already returns valid JSON.
That doesn't mean it's correct.

`@withboundary/contract` enforces **domain correctness** — not just structure.
It validates outputs against your rules, fixes failures automatically, and retries until the result is actually usable.

No more:

- silent logic errors
- invalid business decisions
- brittle retry loops

## Why this exists

LLM outputs fail in ways JSON validation can't catch:

```json
{
  "tier": "hot",
  "score": 25
}
```

Valid JSON. Wrong for your system.

Your logic requires: _hot leads must have score > 70._

Schema validation passes. Your system breaks.

Without a contract, this enters your system.
With `@withboundary/contract`, it is rejected and repaired automatically.

## Install

```bash
npm install @withboundary/contract zod
```

## Quick example

```ts
import { enforce } from "@withboundary/contract";
import { z } from "zod";

const schema = z.object({
  tier: z.enum(["hot", "warm", "cold"]),
  score: z.number(),
});

const result = await enforce(schema, runLLM, {
  name: "lead-scoring",
  rules: [
    {
      name: "hot_requires_high_score",
      description: "Hot leads must have a score of at least 70",
      check: (lead) =>
        lead.tier !== "hot" || lead.score >= 70
          || `tier is "hot" but score is ${lead.score} (minimum 70 for hot)`,
    },
  ],
});

if (result.ok) {
  result.data; // guaranteed correct
}
```

```ts
async function runLLM(attempt) {
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: attempt.instructions },
      { role: "user", content: "Score this lead..." },
      ...attempt.repairs,
    ],
  });

  return res.choices[0].message.content;
}
```

`result.data` is guaranteed to satisfy your schema **and** your rules.

## Correctness is just a function

Schemas validate structure. Rules define what _correct_ means for your domain. Each rule is a named, deterministic check — `name` joins to per-rule failure attribution, `description` is the positive statement of the invariant, `check` returns `true` to pass or a string to fail.

```ts
rules: [
  {
    name: "invoice_math_consistent",
    description: "Subtotal plus tax must equal total within a cent",
    check: (invoice) =>
      Math.abs(invoice.subtotal + invoice.tax - invoice.total) < 0.01
        || `subtotal + tax != total`,
  },
  {
    name: "hot_requires_high_score",
    description: "Hot leads must have a score of at least 70",
    check: (lead) =>
      lead.tier !== "hot" || lead.score >= 70
        || `hot leads require score > 70`,
  },
  {
    name: "end_after_start",
    description: "End date is strictly after start date",
    check: (range) => range.endDate > range.startDate || "end date must be after start date",
  },
]
```

The string a failed `check` returns becomes part of the repair prompt — the model sees exactly what to fix. `fields` is auto-inferred from the check function source; supply it explicitly only if you minify or your check delegates to a helper.

## What it does

The model proposes an output.
The contract decides if your system accepts it.

If it fails:

1. The error is classified
2. A targeted repair is generated
3. The model retries with context

This repeats until the output is correct or retries are exhausted.

### Failure categories

| Category | Meaning |
|----------|---------|
| `EMPTY_RESPONSE` | Model returned nothing |
| `REFUSAL` | Safety refusal detected |
| `NO_JSON` | No JSON found in output |
| `TRUNCATED` | Incomplete/cut-off output |
| `PARSE_ERROR` | Invalid JSON |
| `VALIDATION_ERROR` | Schema mismatch |
| `RULE_ERROR` | Rule violation |
| `RUN_ERROR` | Execution error |

Each category produces different repair instructions, so the model gets specific feedback — not a generic "try again."

## Result type

```ts
type ContractResult<T> =
  | { ok: true; data: T; attempts: number; raw: string; durationMs: number }
  | { ok: false; error: ContractError }
```

No exceptions. Pattern match on `ok`.

## Reusable contracts

Define once, reuse everywhere:

```ts
import { defineContract } from "@withboundary/contract";

const leadContract = defineContract({
  name: "lead-scoring",
  schema,
  rules: [
    {
      name: "hot_requires_high_score",
      description: "Hot leads must have a score of at least 70",
      check: (lead) =>
        lead.tier !== "hot" || lead.score >= 70
          || `hot leads require score > 70`,
    },
  ],
  retry: { maxAttempts: 4 },
});

const result = await leadContract.accept(runLLM);
```

## Observability

Every attempt is structured.

```ts
const result = await enforce(schema, runLLM, {
  onAttempt: (event) => {
    console.log(event.attempt, event.category, event.durationMs);
  },
});
```

You know:

- why it failed
- which rule was violated
- how many retries it took

For human-readable debugging:

```ts
import { createConsoleLogger } from "@withboundary/contract";

const result = await enforce(schema, runLLM, {
  logger: createConsoleLogger({ showCleanedOutput: true }),
});
```

For production observability — acceptance rate, top failing rules, repair patterns, latency across every contract run — pair with [`@withboundary/sdk`](https://github.com/withboundary/sdk-js):

```ts
import { createBoundaryLogger } from "@withboundary/sdk";

defineContract({
  // ...
  logger: createBoundaryLogger({ apiKey: process.env.BOUNDARY_API_KEY }),
});
```

It's optional. The contract engine is fully usable without it.

## Use cheaper models safely

Correctness is enforced by the contract — not the model.

Run smaller models, retry when needed, and only escalate if necessary. The contract is the safety net.

## Engine primitives

For custom pipelines, the individual steps are exported:

| Function | Purpose |
|----------|---------|
| `clean(raw)` | Normalize raw LLM output to JSON |
| `verify(data, schema, rules?)` | Validate against schema + rules |
| `classify(raw, cleaned)` | Categorize a failure |
| `repair(detail)` | Generate repair messages |
| `instructions(schema)` | Generate schema-driven prompt instructions |

## When not to use

- Fully unstructured text (creative writing, essays)
- Tasks without clear correctness criteria

This works best when "correct" can be defined.

## Works with any LLM

Model-agnostic. Works with any provider that returns text — OpenAI, Anthropic, Google, Mistral, local models.

## Versioning

Follows [semver](https://semver.org). Breaking API changes ship in major releases; new options and types ship in minor releases; bug fixes ship in patches. The optional companion package `@withboundary/sdk` declares this package as a peer dependency in the `^1.4.0` range — bump the engine and the SDK together at the major boundary.

## License

MIT

## Links

- [Documentation](https://docs.withboundary.com)
- [Examples](./examples)
- [Issues](https://github.com/withboundary/contract-js/issues)

---

**Stop trusting LLM output. Start verifying it.**
