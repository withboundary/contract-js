---
"@withboundary/contract": patch
---

Auto-infer `Rule.fields` from the `check` function source when omitted.

`fields` was always optional in the `Rule<T>` type, but backend dashboard grouping and field-aware attribution only worked if users hand-maintained it. Now the engine parses the check function's source and derives the accessed fields automatically for common cases:

```ts
// Before: you had to specify fields to get per-field attribution
rules: [
  { name: "threshold", fields: ["score"], check: (d) => d.score >= 90 }
]

// Now: inference covers the simple cases — same attribution, no boilerplate
rules: [
  { name: "threshold", check: (d) => d.score >= 90 }
]
```

### What gets inferred
- Direct accesses: `(d) => d.score >= 0` → `["score"]`
- Compound: `(d) => d.score > 0 && d.tier !== "cold"` → `["score", "tier"]`
- Optional chaining: `(d) => d?.maybe === 1` → `["maybe"]`
- Destructuring: `({ score, tier }) => …` → `["score", "tier"]` (respects `{ src: alias }` rename)
- Nested access recorded at the top-level field: `(d) => d.items.length > 0` → `["items"]`

### What still needs explicit `fields`
- Helper delegation: `(d) => validate(d)` — the helper is opaque to the parser
- Aliasing: `(d) => { const x = d; return x.y; }` — alias tracking not implemented
- Minified bundles where the param identifier is mangled (rare in Node)

### Backwards compatibility
- `Rule.fields` stays optional and unchanged in the type. Explicit values always win over inference.
- Consumers that omitted `fields` previously got no attribution; now they get inferred attribution when possible. This is additive data on `RuleDefinition.fields` and `RuleIssue.rule.fields` — no wire-format change.
- Inference results are cached per `check` function via a `WeakMap` so the hot path (verify per attempt) doesn't re-parse.
