---
"@withboundary/contract": patch
---

Fix build + lint on TypeScript 6.

- `tsconfig.json`: add `"ignoreDeprecations": "6.0"` to silence `TS5101` for the implicit `baseUrl` that tsup's dts builder emits internally. Will revisit before TS 7.
- `devDependencies`: add `@types/node@^22` so the `examples/live-*.ts` scripts (which read `process.env.*`) pass `tsc --noEmit`. TS 5 was resolving `process` transitively through another dev dep; TS 6's stricter type resolution no longer does.

No runtime or API changes.
