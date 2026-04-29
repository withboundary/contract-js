---
"@withboundary/contract": patch
---

Complete `runHandle` coverage on terminal verification-failure logger contexts. `onRunFailure` now receives the same per-call handle as the preceding run, attempt, and verification hooks when a run stops after a validation or rule failure.
