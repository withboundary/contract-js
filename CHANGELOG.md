# @withboundary/contract

## 1.3.0

### Minor Changes

- 5673e32: Rename `INVARIANT_ERROR` failure category to `RULE_ERROR` to align with the public `rules` terminology.

  - `FailureCategory` union: `"INVARIANT_ERROR"` → `"RULE_ERROR"`
  - `verify()` emits `RULE_ERROR` when data passes schema but fails a rule
  - `repair()` generates "rule constraints" language (was "schema constraints")
  - API.md: `check()` parameter renamed `invariants?` → `rules?`, type `Invariant<T>` → `Rule<T>`
  - EXAMPLES.md: `invariants: [...]` config → `rules: [...]` throughout

## 1.2.1

### Patch Changes

- 2758ece: Publish with [npm provenance attestations](https://docs.npmjs.com/generating-provenance-statements) via GitHub Actions OIDC trusted publishing.

  Every release now ships with a signed attestation linking the tarball back to the exact commit and workflow that built it in [`withboundary/contract-js`](https://github.com/withboundary/contract-js). Consumers can verify the supply chain themselves with:

  ```bash
  npm audit signatures
  ```

  Also adds the `repository` field to `package.json` so npmjs.com links back to the source repo.

  No API or behavior changes.

## 1.2.0

### Minor Changes

- 59e244d: Add `model` and `rulesCount` observability fields.

  - `BoundaryLogEvent` gains optional `model?: string` and `rulesCount?: number` so sinks can attribute events to a specific LLM and record the active rule count per run.
  - `ContractOptions` gains optional `model?: string` for a per-call override (`contract.accept(run, { model })`). The value flows through to the logger's `onRunStart` hook context.
  - **Breaking (hook contract):** `ContractLogger.onRunStart` ctx now exposes `rulesCount: number` instead of `hasRules: boolean`, plus an optional `model?: string`. Custom loggers reading `ctx.hasRules` need to switch to `ctx.rulesCount > 0`.
  - `createConsoleLogger` prints the rule count and, when set, the model on each run.

## 1.1.0

### Minor Changes

- 08c803c: Require a `name` on every contract and propagate it through every logger hook.

  - `defineContract({ name, schema, ... })` now requires `name: string`. The runtime throws `TypeError` if it's missing or blank.
  - `enforce(schema, run, options)` now requires `options.name`.
  - Every `ContractLogger<T>` hook context carries `contractName: string`, so loggers can attribute every event to the right contract without holding a separate reference. This is what `@withboundary/sdk` reads to populate `BoundaryLogEvent.contractName`.
  - `createConsoleLogger` prints the contract name in each line: `[boundary] lead-scoring · Run started`.
  - New public type export: `BoundaryLogEvent` — the wire format that observability SDKs ship to Boundary cloud.
  - Renamed `onRunStart` ctx field `hasInvariants` → `hasRules` to match the config key (`rules`). The old name was never aligned and no code relied on it since the dispatcher was untyped.

  This is a type-level breaking change for anyone who had `defineContract({ schema, rules })` without a name. Add `name: "your-contract"` to existing calls — pick something you'd want to see on the Boundary dashboard.

## 1.0.0

### Major Changes

- bc04fb4: Initial release as @withboundary/contract.

  Schema + rules validation, auto-repair, and retry for LLM structured outputs.
