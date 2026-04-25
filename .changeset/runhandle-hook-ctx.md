---
"@withboundary/contract": minor
---

Per-call hook context: every `ContractLogger` hook now receives a `runHandle` field — a unique id minted by the engine on each `accept()` invocation. Loggers that maintain per-run scratch state can key it by `runHandle` instead of `contractName`, so concurrent `accept()` calls on the same contract no longer share state.

This is a forward-compatible addition for hook authors: existing loggers that don't read `runHandle` continue to work unchanged. Authors who want per-call isolation can opt into the new field today; the field is required on the hook type so TypeScript surfaces the new option immediately.
