# llm-contract

Typed contracts for LLM calls. Validate, repair, retry.

You call the LLM however you want. `llm-contract` enforces a typed contract on the output — cleaning, validating, and auto-repairing until you get structured data back or a clear error.

**One dependency.** Works with any LLM provider. No wrappers, no framework.

## The problem

Every LLM call in your codebase has some version of this:

```typescript
const raw = response.choices[0].message.content;
const cleaned = raw.replace(/```json\n?/g, "").replace(/```/g, "").trim();
const parsed = JSON.parse(cleaned);
if (!["positive", "negative", "neutral"].includes(parsed.sentiment)) { throw ... }
return parsed as SomeType; // hope for the best
```

Hand-written prompt instructions. Fragile markdown stripping. Incomplete validation. No retries. Fake type safety via `as` casts. Different in every file.

## The fix

```typescript
import { enforce } from "llm-contract";
import { z } from "zod";

const result = await enforce(
  z.object({
    sentiment: z.enum(["positive", "negative", "neutral"]),
    confidence: z.number().min(0).max(1),
  }),
  async (attempt) => {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: attempt.prompt },
        { role: "user", content: "Analyze: 'I love this product'" },
        ...attempt.fixes,
      ],
    });
    return res.choices[0].message.content;
  },
);

if (result.ok) {
  result.data; // { sentiment: "positive", confidence: 0.95 } — fully typed
}
```

- `attempt.prompt` — auto-generated from your Zod schema
- `attempt.fixes` — repair messages on retry, telling the model exactly what was wrong
- `result.data` — typed from the schema, validated at runtime, no casts
- Markdown fences, prose wrapping, string-typed numbers — all handled automatically
- 3 retries by default, zero config

## Install

```bash
npm install llm-contract zod
```

## API

### `enforce(schema, run, options?)`

The main entrypoint. Runs your function, cleans the output, validates against the schema, retries with repair on failure.

```typescript
function enforce<T>(
  schema: ZodType<T>,
  run: (attempt: AttemptContext) => Promise<string | null>,
  options?: EnforceOptions<T>,
): Promise<Result<T>>
```

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `schema` | `ZodType<T>` | Zod schema defining the expected output shape |
| `run` | `(attempt) => Promise<string \| null>` | Your LLM call. Receives attempt context, returns raw output |
| `options` | `EnforceOptions<T>` | Optional config (see below) |

**AttemptContext** (passed to your `run` function):

| Field | Type | Description |
|-------|------|-------------|
| `prompt` | `string` | Auto-generated prompt instructions from the schema |
| `fixes` | `Message[]` | Repair messages from previous failed attempt (empty on first try) |
| `number` | `number` | Current attempt number (1-indexed) |
| `previousError` | `ContractError?` | Error details from the previous attempt |

**EnforceOptions:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxAttempts` | `number` | `3` | Maximum number of attempts |
| `backoff` | `"none" \| "linear" \| "exponential"` | `"none"` | Delay strategy between retries |
| `backoffBaseMS` | `number` | `200` | Base delay in milliseconds |
| `invariants` | `Array<(data: T) => true \| string>` | `[]` | Custom validation rules beyond the schema |
| `onAttempt` | `(event: AttemptEvent) => void` | — | Hook called after each attempt |

**Result:**

```typescript
type Result<T> = 
  | { ok: true; data: T; attempts: number }
  | { ok: false; error: ContractError }
```

---

### `clean(raw)`

Extracts and normalizes JSON from raw LLM output.

```typescript
function clean(raw: string | null | undefined): unknown
```

Handles:
- Markdown fences (`` ```json ``, `` ```JSON ``, bare `` ``` ``)
- Prose wrapping ("Here is the result: {...} Let me know!")
- Type coercion (`"85"` → `85`, `"true"` → `true`)
- Null/empty input

```typescript
clean('```json\n{"score": 85}\n```');           // { score: 85 }
clean('Here you go: {"score": "85"}');           // { score: 85 }
clean('{"active": "true", "count": "3"}');       // { active: true, count: 3 }
```

---

### `check(data, schema, invariants?)`

Validates data against a Zod schema and optional invariants.

```typescript
function check<T>(
  data: unknown,
  schema: ZodType<T>,
  invariants?: Invariant<T>[],
): Result<T>
```

```typescript
check({ name: "Alice", age: 30 }, Schema);
// { ok: true, data: { name: "Alice", age: 30 } }

check({ name: "Alice", age: -5 }, Schema);
// { ok: false, error: { attempts: [{ issues: ["age: Number must be greater than or equal to 0"] }] } }
```

---

### `fix(error)`

Converts a `ContractError` into repair messages for the next attempt.

```typescript
function fix(error: ContractError): Message[]
```

```typescript
fix(checkResult.error);
// [{ role: "user", content: "Your previous response had validation errors:\n- age: ..." }]
```

---

### `select(state, schema)`

Projects a state object down to only the fields defined in the schema. Prevents sending unnecessary data (PII, secrets) to the LLM.

```typescript
function select<T>(
  state: Record<string, unknown>,
  schema: ZodType<T>,
): Record<string, unknown>
```

```typescript
select(
  { name: "Alice", email: "a@co.com", ssn: "123-45-6789", passwordHash: "..." },
  z.object({ name: z.string(), email: z.string() }),
);
// { name: "Alice", email: "a@co.com" }
```

---

### `prompt(schema)`

Generates a prompt instruction string from a Zod schema.

```typescript
function prompt(schema: ZodType): string
```

Used internally by `enforce` to populate `attempt.prompt`. You can also use it directly if you're building prompts manually.

## Examples

See the [examples/](./examples) folder for runnable demos:

- **[sentiment.ts](./examples/sentiment.ts)** — simplest enforce example
- **[invoice.ts](./examples/invoice.ts)** — nested schema extraction
- **[classification.ts](./examples/classification.ts)** — enum output with invariants
- **[fallback.ts](./examples/fallback.ts)** — cheap model → expensive model
- **[primitives.ts](./examples/primitives.ts)** — using clean/check/fix/select individually

See [EXAMPLES.md](./EXAMPLES.md) for detailed before/after comparisons.

## Design

`llm-contract` treats every LLM call as an isolated, stateless step: typed input in, validated output out, no shared history. Pure functions, not chat threads.

The library provides five composable primitives that form a contract pipeline:

```
select → prompt → [your LLM call] → clean → check
                                       ↑       |
                                       └─ fix ←┘  (on failure)
```

You own the call. The library owns the contract.

## License

MIT
