# llm-contract

Deterministic reliability boundary for structured LLM output.

LLM outputs are probabilistic.  
Applications require deterministic inputs.

`llm-contract` sits between the model and your application and ensures that only verified structured data crosses that boundary.

The model proposes outputs. The boundary decides what the system accepts.

---

# Why this exists

When LLM output flows directly into application logic, reliability problems appear immediately.

Typical integration today:

```text
LLM → JSON.parse → manual checks → retry
````

Common failures:

* malformed JSON
* schema mismatches
* cross-field contradictions
* truncated responses
* retries that don't converge
* silent incorrect data entering application logic

These problems are normal behavior for probabilistic generators.

`llm-contract` adds a deterministic boundary that decides whether the system accepts the output.

---

# Core idea

The model generates candidates.
The boundary decides what the system accepts.

```text
LLM generation
      ↓
candidate output
      ↓
llm-contract boundary
(clean → verify → classify → repair → retry)
      ↓
accepted structured data → application logic
```

Application code never consumes unchecked model output.

---

# Determinism vs Stability

Language models operate in probabilistic environments.
The same input may produce different outputs across runs.

Trying to force deterministic behavior at the model level leads to:

* brittle prompts
* excessive retries
* fragile pipelines
* hidden reliability bugs

Instead, reliable systems separate two concerns:

| Responsibility | Mechanism                |
| -------------- | ------------------------ |
| generation     | probabilistic models     |
| acceptance     | deterministic boundaries |

The model generates candidate outputs.
The boundary determines whether the system accepts them.

This design does not make the model deterministic.
It makes the **system stable**.

---

# Quickstart

Install:

```bash
npm install llm-contract zod
```

Example:

```ts
import { enforce } from "llm-contract";
import { z } from "zod";

const schema = z.object({
  sentiment: z.enum(["positive", "negative", "neutral"]),
  confidence: z.number().min(0).max(1),
});

const result = await enforce(
  schema,
  async (attempt) => {
    const res = await openai.responses.create({
      model: "gpt-4.1",
      input: [
        { role: "system", content: attempt.instructions },
        { role: "user", content: "Analyze: I love this product" },
        ...attempt.repairs,
      ],
    });

    return res.output_text;
  },
  {
    invariants: [
      (d) => d.confidence > 0.5 || `confidence too low: ${d.confidence}`,
    ],
  }
);

if (!result.ok) {
  console.error(result.error.message);
  console.error(result.error.attempts);
  return;
}

console.log(result.data);
```

---

# Reusable contracts

Define a contract once and reuse it.

```ts
import { defineContract } from "llm-contract";

const sentimentContract = defineContract({
  schema,
  invariants: [
    (d) => d.confidence > 0.5 || `confidence too low: ${d.confidence}`,
  ],
  retry: { maxAttempts: 4, backoff: "linear", baseMs: 150 },
  instructions: { suffix: "Return JSON only." },
});

const result = await sentimentContract.run(async (attempt) => {
  const res = await openai.responses.create({
    model: "gpt-4.1",
    input: [
      { role: "system", content: attempt.instructions },
      { role: "user", content: "Analyze: I love this product" },
      ...attempt.repairs,
    ],
  });

  return res.output_text;
});
```

---

# Contract loop

`llm-contract` wraps model execution with a deterministic acceptance loop.

```text
instructions
  → clean
    → verify(schema + invariants)
      → classify failure
        → repair
          → retry
```

The process continues until:

* valid output is produced
* retry policy is exhausted

Return type:

```ts
Success<T> | Failure
```

---

# Failure model

Each failed attempt is classified.

| Category         | Meaning                     |
| ---------------- | --------------------------- |
| EMPTY_RESPONSE   | model returned nothing      |
| REFUSAL          | safety refusal              |
| NO_JSON          | JSON not detected           |
| TRUNCATED        | incomplete output           |
| PARSE_ERROR      | invalid JSON                |
| VALIDATION_ERROR | schema mismatch             |
| INVARIANT_ERROR  | domain constraint violation |
| RUN_ERROR        | execution error             |

Each category produces targeted repair instructions.

---

# Invariants

Schemas validate structure.
Invariants validate domain correctness.

Example:

```ts
(d) =>
  Math.abs(d.subtotal + d.tax - d.total) < 0.01 ||
  `subtotal (${d.subtotal}) + tax (${d.tax}) != total (${d.total})`
```

This catches outputs that are structurally correct but logically inconsistent.

---

# Observability

Use `onAttempt` to inspect every attempt.

```ts
const result = await enforce(schema, run, {
  onAttempt: (event) => {
    console.log(event.category, event.issues);
  },
});
```

Telemetry includes:

* pass / fail status
* failure category
* issues
* attempt number
* duration

This makes reliability failures observable in production systems.

---

# Debugging the contract loop

Enable readable trace output:

```ts
await enforce(schema, run, {
  debug: true,
});
```

Or use the console logger:

```ts
import { createConsoleLogger } from "llm-contract";

await enforce(schema, run, {
  logger: createConsoleLogger({
    showCleanedOutput: true,
  }),
});
```

Use both intentionally:

| Tool      | Purpose                         |
| --------- | ------------------------------- |
| logger    | human-readable debugging traces |
| onAttempt | structured telemetry            |

---

# Exported primitives

Low-level primitives for custom pipelines.

| Function                          | Purpose                       |
| --------------------------------- | ----------------------------- |
| clean(raw)                        | normalize JSON-like responses |
| verify(data, schema, invariants?) | deterministic validation      |
| classify(raw, cleaned)            | categorize failures           |
| repair(detail, repairs?)          | targeted repair generation    |
| instructions(schema)              | schema-driven instructions    |
| select(state, schema)             | project schema-relevant state |

---

# Non-goals

`llm-contract` is **not**:

* an LLM framework
* an agent runtime
* an orchestration system
* a replacement for prompt engineering

It focuses on one problem:

**reliable structured output boundaries**

---

# Documentation

* Overview
* Quickstart
* How It Works
* Core API
* Invariants
* Failure Model
* Observability
* Examples

Docs:

[https://operatorstack.github.io/llm-contract/](https://operatorstack.github.io/llm-contract/)

---

# Examples

* `examples/extraction.ts`
* `examples/classification.ts`
* `examples/scoring.ts`
* `examples/deterministic-boundaries.ts`
* `examples/integration-langfuse.ts`
* `examples/integration-otel.ts`
* `examples/integration-vercel-ai.ts`

---

# Status

This library is in active development.

Breaking changes may happen between releases while APIs and behavior continue to evolve.

Core contract loop is stable, but interfaces and defaults may change as failure patterns are refined.

---

# License

MIT
