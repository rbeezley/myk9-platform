## 1. Diagnosis and behavior

- [x] 1.1 Reproduce or isolate the premium publish failure and record the root cause in code/tests.
- [x] 1.2 Replace caller-supplied URLs with an atomically persisted trusted path and exact public URL, plus append-only versioned PDF storage policy.
- [x] 1.3 Add server-issued publish versions and rollback-compatible invalidation so stale attempts cannot overwrite newer published state.
- [x] 1.4 Route every existing publish surface through one per-show attempt coordinator with complete validated retry identity.
- [x] 1.5 Parse real Edge Function error bodies into specific plain-English guidance with actionable header recovery and a safe generic fallback.

## 2. Testing

- [x] 2.1 Add regression coverage for the app/database transition matrix, exact path+URL trust, append-only storage, PDF constraints, stale-attempt rejection, successful publish, partial-progress retry, every caller, production error shapes, and clear success/error states.
- [x] 2.2 Run focused shuffled Vitest (six runs), behavioral SQL registration test, app/test typecheck, changed-file lint, formatting check, and code-quality ratchet. Behavioral SQL itself is registered for CI but was not run locally.

## 3. Delivery

- [x] 3.1 Validate the OpenSpec artifacts and implementation against MYK9-694.
- [ ] 3.2 Commit/push the coherent batch, then resolve the parent-coordinated adversarial review findings and verify required PR CI before merge.
