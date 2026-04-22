---
"@withboundary/contract": patch
---

Drop Node 18 support. Bump minimum `engines.node` to `>=20` and remove Node 18 from the CI matrix (now Node 20/22/24).

Node 18 LTS went end-of-life on 2025-04-30. Vitest 4+ and its `rolldown` dependency already use APIs that only exist in Node 20+ (e.g. `node:util.styleText`), so Node 18 was effectively unsupported at the dev/tooling level already — this just formalizes it for consumers.

No runtime behavior change; no API change. Users on Node 20+ are unaffected.
