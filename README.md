# @boundary/contract

Make LLM outputs correct, not just valid.

Schema validation catches structural errors. `@boundary/contract` goes further — it enforces domain rules, auto-repairs failures, and retries until the output is actually correct. Your application code never sees unchecked model output.

```
LLM generates candidate → contract validates → repairs failures → retries → accepted data
```

## Install

```bash
npm install @boundary/contract zod
```

## Quick example

```ts
import { enforce } from "@boundary/contract";
import { z } from "zod";

const schema = z.object({
  sentiment: z.enum(["positive", "negative", "neutral"]),
  confidence: z.number().min(0).max(1),
});

const result = await enforce(schema, async (attempt) => {
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: attempt.instructions },
      { role: "user", content: "Analyze: I love this product" },
      ...attempt.repairs,
    ],
  });

  return res.choices[0].message.content;
}, {
  rules: [
    (d) => d.confidence > 0.5 || `confidence too low: ${d.confidence}`,
  ],
});

if (result.ok) {
  console.log(result.data); // { sentiment: "positive", confidence: 0.92 }
} else {
  console.error(result.error);
}
```

`enforce` handles the full loop: prompt generation, output cleaning, schema + rule validation, failure classification, targeted repair, and retry. You provide the LLM call.

## Reusable contracts

Define a contract once, use it across your application:

```ts
import { defineContract } from "@boundary/contract";

const sentiment = defineContract({
  schema,
  rules: [
    (d) => d.confidence > 0.5 || `confidence too low: ${d.confidence}`,
  ],
  retry: { maxAttempts: 4, backoff: "linear", baseMs: 150 },
  instructions: { suffix: "Return JSON only." },
});

const result = await sentiment.accept(async (attempt) => {
  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 256,
    system: attempt.instructions,
    messages: [
      { role: "user", content: "Analyze: I love this product" },
      ...attempt.repairs,
    ],
  });

  return res.content[0].text;
});
```

## Rules

Schemas validate structure. Rules validate domain correctness.

```ts
rules: [
  // Cross-field consistency
  (d) => Math.abs(d.subtotal + d.tax - d.total) < 0.01
    || `subtotal (${d.subtotal}) + tax (${d.tax}) != total (${d.total})`,

  // Business logic
  (d) => d.endDate > d.startDate || "end date must be after start date",

  // Range check
  (d) => d.score >= 1 && d.score <= 10 || `score ${d.score} out of range`,
]
```

Rules are sync, deterministic, and cheap. A rule returns `true` if it passes, or a string describing what's wrong. The string becomes part of the repair prompt — the model sees exactly what to fix.

## How it works

When the model produces output, the contract runs a deterministic acceptance loop:

```
instructions → clean → verify (schema + rules) → classify failure → repair → retry
```

1. **Instructions** — auto-generated from your Zod schema, telling the model exactly what to produce
2. **Clean** — normalizes raw output (strips markdown fences, coerces types, extracts JSON from prose)
3. **Verify** — validates against the schema and rules
4. **Classify** — categorizes failures (parse error, schema mismatch, rule violation, truncation, refusal, etc.)
5. **Repair** — generates targeted fix instructions based on the failure category
6. **Retry** — feeds repair context back to the model for the next attempt

The loop continues until the output passes or the retry policy is exhausted.

## Failure categories

Each failed attempt is classified:

| Category | Meaning |
|----------|---------|
| `EMPTY_RESPONSE` | Model returned nothing |
| `REFUSAL` | Safety refusal detected |
| `NO_JSON` | No JSON found in output |
| `TRUNCATED` | Incomplete/cut-off output |
| `PARSE_ERROR` | Invalid JSON |
| `VALIDATION_ERROR` | Schema mismatch |
| `INVARIANT_ERROR` | Rule violation |
| `RUN_ERROR` | Execution error |

Each category produces different repair instructions, so the model gets specific feedback — not a generic "try again."

## Result type

```ts
type ContractResult<T> =
  | { ok: true; data: T; attempts: number; raw: string; durationMs: number }
  | { ok: false; error: ContractError }
```

No exceptions. Pattern match on `ok` and handle both cases.

## Observability

```ts
const result = await enforce(schema, run, {
  onAttempt: (event) => {
    console.log(event.attempt, event.category, event.durationMs);
    // Send to your telemetry system
  },
});
```

For human-readable debugging:

```ts
import { createConsoleLogger } from "@boundary/contract";

const result = await enforce(schema, run, {
  logger: createConsoleLogger({ showCleanedOutput: true }),
});
```

## Engine primitives

For custom pipelines, the individual steps are exported:

| Function | Purpose |
|----------|---------|
| `clean(raw)` | Normalize raw LLM output to JSON |
| `verify(data, schema, rules?)` | Validate against schema + rules |
| `classify(raw, cleaned)` | Categorize a failure |
| `repair(detail)` | Generate repair messages |
| `instructions(schema)` | Generate schema-driven prompt instructions |

## Works with any LLM

`@boundary/contract` is model-agnostic. You make the LLM call, the contract validates the output. Works with OpenAI, Anthropic, Google, Mistral, local models — anything that returns text.

## License

MIT

## Links

- [Documentation](https://docs.withboundary.com)
- [Examples](./examples)
