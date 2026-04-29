# @withboundary/contract

[![npm version](https://img.shields.io/npm/v/@withboundary/contract.svg)](https://www.npmjs.com/package/@withboundary/contract)
[![license](https://img.shields.io/npm/l/@withboundary/contract.svg)](https://github.com/withboundary/contract-js/blob/main/LICENSE)

Make LLM output correct before it crosses into your system.

`@withboundary/contract` is a local TypeScript engine for accepting structured
LLM output. It cleans model responses, validates them with Zod, checks your
domain rules, and gives the model targeted repair instructions when an attempt
fails.

It does not call Boundary. It does not proxy your LLM traffic. It does not send
telemetry. The only network calls are the ones you write in your `run` function.

## Install

```bash
npm install @withboundary/contract zod
```

```bash
pnpm add @withboundary/contract zod
```

## Quickstart

```ts
import { enforce } from "@withboundary/contract";
import { z } from "zod";

const LeadScore = z.object({
  tier: z.enum(["hot", "warm", "cold"]),
  score: z.number().min(0).max(100),
  reason: z.string(),
});

const result = await enforce(
  LeadScore,
  async (attempt) => {
    const res = await openai.responses.create({
      model: "gpt-4.1",
      input: [
        { role: "system", content: attempt.instructions },
        { role: "user", content: "Score this lead: ACME, 500 employees..." },
        ...attempt.repairs,
      ],
    });

    return res.output_text;
  },
  {
    name: "lead-scoring",
    rules: [
      {
        name: "hot_requires_high_score",
        description: "Hot leads must have a score of at least 70",
        check: (lead) =>
          lead.tier !== "hot" ||
          lead.score >= 70 ||
          `tier is "hot" but score is ${lead.score} (minimum 70)`,
      },
    ],
  },
);

if (result.ok) {
  result.data;
  // typed as { tier: "hot" | "warm" | "cold"; score: number; reason: string }
}
```

If the model returns this:

```json
{ "tier": "hot", "score": 25, "reason": "Strong fit" }
```

the schema passes, but the rule fails. The contract returns a repair message
through `attempt.repairs`, retries your `run` function, and accepts only an
output that satisfies the schema and every rule.

## Why Use It

Schema validation catches wrong types. Contracts catch wrong decisions.

| Problem                           | What the contract does                          |
| --------------------------------- | ----------------------------------------------- |
| JSON wrapped in Markdown or prose | `clean()` extracts and parses the JSON          |
| `"85"` returned as a string       | Primitive coercion normalizes common LLM output |
| Schema mismatch                   | Zod issues become targeted repair messages      |
| Cross-field business rule failure | Named rules reject and explain the issue        |
| Transient model failure           | The retry loop gives the model precise context  |

## Define Once

Use `defineContract` when the same contract runs in more than one place.

```ts
import { defineContract } from "@withboundary/contract";

const leadContract = defineContract({
  name: "lead-scoring",
  schema: LeadScore,
  rules: [
    {
      name: "hot_requires_high_score",
      description: "Hot leads must have a score of at least 70",
      check: (lead) =>
        lead.tier !== "hot" ||
        lead.score >= 70 ||
        `tier is "hot" but score is ${lead.score} (minimum 70)`,
    },
  ],
  retry: { maxAttempts: 4 },
});

const result = await leadContract.accept(runLLM, {
  model: "gpt-4.1-mini",
});
```

Each `accept()` call is independent. Logger hooks receive both the stable
`contractName` and a per-call `runHandle`, so observability sinks can isolate
concurrent runs of the same contract instance.

## Rules

Rules are named deterministic checks over parsed, typed data.

```ts
rules: [
  {
    name: "invoice_math_consistent",
    description: "Subtotal plus tax must equal total",
    fields: ["subtotal", "tax", "total"],
    check: (invoice) =>
      Math.abs(invoice.subtotal + invoice.tax - invoice.total) < 0.01 ||
      `subtotal + tax does not equal total`,
  },
  {
    name: "line_items_required",
    description: "Invoices must include at least one line item",
    check: (invoice) => invoice.lineItems.length > 0 || "invoice has no line items",
  },
];
```

`check` returns `true` to pass. Return a string to fail with a repair message.
`fields` is optional; the engine infers simple field reads from the function
source. Set it explicitly when a rule delegates to helpers or is minified.

## Result Shape

`enforce` and `accept` never throw for validation failure. They return a
discriminated union:

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

Your `run` function can still throw. Thrown errors are captured as `RUN_ERROR`
attempts and can be retried like other categories.

## Observability

For local debugging:

```ts
import { createConsoleLogger } from "@withboundary/contract";

const result = await enforce(schema, runLLM, {
  name: "invoice-extraction",
  logger: createConsoleLogger({ showCleanedOutput: true }),
});
```

For production observability, pair with the optional cloud/custom-sink SDK:

```ts
import { createBoundaryLogger } from "@withboundary/sdk";

const logger = createBoundaryLogger({
  apiKey: process.env.BOUNDARY_API_KEY,
  environment: "production",
});

const contract = defineContract({
  name: "invoice-extraction",
  schema,
  rules,
  logger,
});
```

Installing only `@withboundary/contract` keeps everything in process. Nothing is
sent to Boundary unless you add `@withboundary/sdk` and pass a logger.

## Engine Primitives

The core pieces are exported for custom pipelines:

| Function                        | Purpose                                                       |
| ------------------------------- | ------------------------------------------------------------- |
| `clean(raw)`                    | Extract and normalize JSON-like LLM output                    |
| `verify(data, schema, rules?)`  | Validate parsed data with schema and rules                    |
| `classify(raw, cleaned)`        | Categorize empty, refusal, no JSON, truncated, parse failures |
| `repair(detail, overrides?)`    | Build repair messages for the next attempt                    |
| `instructions(schema)`          | Generate schema-driven prompt instructions                    |
| `createConsoleLogger(options?)` | Print contract lifecycle hooks for debugging                  |

## Works With Any Model

Boundary owns the acceptance boundary. You own the provider call. Use OpenAI,
Anthropic, Gemini, Mistral, local models, or any function that returns text.

## Security Model

- No fetch, HTTP client, API key, analytics, or background worker in this
  package.
- No prompt interception. The model call happens inside your `run` function.
- No hidden persistence. Failed attempts are returned to your code in
  `ContractResult`.
- Optional observability lives in a separate package, `@withboundary/sdk`.

## Links

- [Documentation](https://docs.withboundary.com)
- [Examples](https://github.com/withboundary/contract-js/tree/main/examples)
- [Example guide](./EXAMPLES.md)
- [API reference](./API.md)
- [Issues](https://github.com/withboundary/contract-js/issues)

MIT
