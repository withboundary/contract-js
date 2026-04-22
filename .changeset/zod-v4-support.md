---
"@withboundary/contract": minor
---

Support both Zod v3 and Zod v4 schemas.

`defineContract({ schema })` now accepts schemas from either zod major. Previously the package hard-pinned `zod@^3.23.0`; consumers who upgraded their own `zod` to v4 saw type errors because v3 and v4 `ZodType` are not cross-assignable.

- **peerDependency**: `"zod": "^3.25.0 || ^4.0.0"` (moved out of `dependencies`). Users on zod `<3.25` should bump to `3.25+` to get the subpath exports this package uses internally (`zod/v3` and `zod/v4/core`).
- Internal schema introspection (used by `instructions()` and `select()`) is centralized in a new `zodCompat` adapter and dispatches on a property-based runtime probe (`"_zod" in schema`), so `instanceof`-based class identity across duplicated `node_modules` copies is no longer a concern.
- New public type `ContractSchema<T> = z3.ZodType<T> | z4.$ZodType<T>` replaces the internal `ZodType<T>` in `ContractConfig`, `enforce`, and `runContract` signatures. User code that passes `z.object(...)` inline continues to work unchanged.
- No behavior or wire-format changes. No breaking changes to existing zod-3 users.
