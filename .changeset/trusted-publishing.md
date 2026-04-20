---
"@withboundary/contract": patch
---

Publish with [npm provenance attestations](https://docs.npmjs.com/generating-provenance-statements) via GitHub Actions OIDC trusted publishing.

Every release now ships with a signed attestation linking the tarball back to the exact commit and workflow that built it in [`withboundary/contract-js`](https://github.com/withboundary/contract-js). Consumers can verify the supply chain themselves with:

```bash
npm audit signatures
```

Also adds the `repository` field to `package.json` so npmjs.com links back to the source repo.

No API or behavior changes.
