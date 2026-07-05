## 1. Regression Coverage

- [x] 1.1 Add a focused unit test proving `getUserEntries` falls back to the authenticated view when the local entry replica is empty.
- [x] 1.2 Add a focused unit test proving offline/unreachable view keeps the local empty result.

## 2. Core Implementation

- [x] 2.1 Update `getUserEntries` to verify the authenticated view for empty account-level local entry results.
- [x] 2.2 Preserve existing local-first behavior for hydrated local entry results, missing relation fallback, and scored-result visibility.

## 3. Terminology Cleanup

- [x] 3.1 Rename global replication provider scope terminology from `licenseKey` to `syncScopeId`.
- [x] 3.2 Rename touched table sync parameters/comments so the code describes sync scope rather than licensing.

## 4. Verification

- [x] 4.1 Run focused entries search tests.
- [x] 4.2 Run focused replication provider tests.
- [x] 4.3 Run OpenSpec validation for `fix-account-entry-sync-scope`.
- [x] 4.4 Run myK9Show app typecheck.
- [x] 4.5 Run monorepo typecheck and lint.

## 5. Shipping

- [x] 5.1 Update tracking docs if this closes or adds a tracked launch-readiness item.
- [ ] 5.2 Create PR, wait for CI/review, and merge after approval.
