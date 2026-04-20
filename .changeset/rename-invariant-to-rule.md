---
"@withboundary/contract": minor
---

Rename `INVARIANT_ERROR` failure category to `RULE_ERROR` to align with the public `rules` terminology.

- `FailureCategory` union: `"INVARIANT_ERROR"` → `"RULE_ERROR"`
- `verify()` emits `RULE_ERROR` when data passes schema but fails a rule
- `repair()` generates "rule constraints" language (was "schema constraints")
- API.md: `check()` parameter renamed `invariants?` → `rules?`, type `Invariant<T>` → `Rule<T>`
- EXAMPLES.md: `invariants: [...]` config → `rules: [...]` throughout
