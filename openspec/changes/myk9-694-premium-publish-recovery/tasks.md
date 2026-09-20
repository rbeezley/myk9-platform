## 1. Diagnosis and behavior

- [x] 1.1 Reproduce or isolate the premium publish failure and record the root cause in code/tests.
- [x] 1.2 Replace caller-supplied URLs with a persisted trusted storage path and append-only PDF storage policy.
- [x] 1.3 Add server-issued publish versions so stale attempts cannot overwrite newer published state.
- [x] 1.4 Route every existing publish surface through one per-show attempt coordinator and preserve safe retry identity.
- [x] 1.5 Parse real Edge Function error bodies into specific plain-English guidance with a safe generic fallback.

## 2. Testing

- [x] 2.1 Add regression coverage for path trust, append-only storage, PDF constraints, stale-attempt rejection, successful publish, partial-progress retry, every caller, production error shapes, and clear success/error states.
- [x] 2.2 Run focused Vitest, behavioral SQL registration, relevant typecheck, changed-file lint, and code-quality ratchet.

## 3. Delivery

- [x] 3.1 Validate the OpenSpec artifacts and implementation against MYK9-694.
- [ ] 3.2 Commit, push, open a PR, resolve adversarial review findings, and verify required CI.
