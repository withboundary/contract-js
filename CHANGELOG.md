# @withboundary/contract

## 1.5.1

### Patch Changes

- 3c253a2: Add manual release workflow dispatch so maintainers can run the release pipeline on demand.
- Complete `runHandle` coverage on terminal verification-failure logger contexts. `onRunFailure` now receives the same per-call handle as the preceding run, attempt, and verification hooks when a run stops after a validation or rule failure.

## 1.5.0

### Minor Changes

- Per-call hook context: every `ContractLogger` hook now receives a `runHandle` field — a unique id minted by the engine on each `accept()` invocation. Loggers that maintain per-run scratch state can key it by `runHandle` instead of `contractName`, so concurrent `accept()` calls on the same contract no longer share state.

  This is a forward-compatible addition for hook authors: existing loggers that don't read `runHandle` continue to work unchanged. Authors who want per-call isolation can opt into the new field today; the field is required on the hook type so TypeScript surfaces the new option immediately.

## 1.4.1

### Patch Changes

- 60cc6eb: Drop Node 18 support. Bump minimum `engines.node` to `>=20` and remove Node 18 from the CI matrix (now Node 20/22/24).

  Node 18 LTS went end-of-life on 2025-04-30. Vitest 4+ and its `rolldown` dependency already use APIs that only exist in Node 20+ (e.g. `node:util.styleText`), so Node 18 was effectively unsupported at the dev/tooling level already — this just formalizes it for consumers.

  No runtime behavior change; no API change. Users on Node 20+ are unaffected.

- 44ed274: Auto-infer `Rule.fields` from the `check` function source when omitted.

  `fields` was always optional in the `Rule<T>` type, but backend dashboard grouping and field-aware attribution only worked if users hand-maintained it. Now the engine parses the check function's source and derives the accessed fields automatically for common cases:

  ```ts
  // Before: you had to specify fields to get per-field attribution
  rules: [{ name: "threshold", fields: ["score"], check: (d) => d.score >= 90 }];

  // Now: inference covers the simple cases — same attribution, no boilerplate
  rules: [{ name: "threshold", check: (d) => d.score >= 90 }];
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

- 4a73021: Fix build + lint on TypeScript 6.
  - `tsconfig.json`: add `"ignoreDeprecations": "6.0"` to silence `TS5101` for the implicit `baseUrl` that tsup's dts builder emits internally. Will revisit before TS 7.
  - `devDependencies`: add `@types/node@^22` so the `examples/live-*.ts` scripts (which read `process.env.*`) pass `tsc --noEmit`. TS 5 was resolving `process` transitively through another dev dep; TS 6's stricter type resolution no longer does.

  No runtime or API changes.

## 1.4.0

### Minor Changes

- af935fb: Support both Zod v3 and Zod v4 schemas.

  `defineContract({ schema })` now accepts schemas from either zod major. Previously the package hard-pinned `zod@^3.23.0`; consumers who upgraded their own `zod` to v4 saw type errors because v3 and v4 `ZodType` are not cross-assignable.
  - **peerDependency**: `"zod": "^3.25.0 || ^4.0.0"` (moved out of `dependencies`). Users on zod `<3.25` should bump to `3.25+` to get the subpath exports this package uses internally (`zod/v3` and `zod/v4/core`).
  - Internal schema introspection (used by `instructions()` and `select()`) is centralized in a new `zodCompat` adapter and dispatches on a property-based runtime probe (`"_zod" in schema`), so `instanceof`-based class identity across duplicated `node_modules` copies is no longer a concern.
  - New public type `ContractSchema<T> = z3.ZodType<T> | z4.$ZodType<T>` replaces the internal `ZodType<T>` in `ContractConfig`, `enforce`, and `runContract` signatures. User code that passes `z.object(...)` inline continues to work unchanged.
  - No behavior or wire-format changes. No breaking changes to existing zod-3 users.

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
