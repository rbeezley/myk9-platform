## 1. Diagnosis and behavior

- [x] 1.1 Reproduce or isolate the premium publish failure and record the root cause in code/tests.
- [x] 1.2 Fix the failing canonical publish path while preserving stable-artifact, per-show latch, and safe-retry behavior.
- [x] 1.3 Show specific plain-English guidance for known missing required data/configuration and a safe generic retry for unknown failures.

## 2. Testing

- [x] 2.1 Add regression coverage for successful publish, proven failure, partial-progress retry, duplicate-submit protection, permissions/configuration where relevant, and clear success/error states.
- [x] 2.2 Run focused Vitest, relevant typecheck, changed-file lint, and code-quality ratchet.

## 3. Delivery

- [x] 3.1 Validate the OpenSpec artifacts and implementation against MYK9-694.
- [ ] 3.2 Commit, push, open a PR, resolve adversarial review findings, and verify required CI.
