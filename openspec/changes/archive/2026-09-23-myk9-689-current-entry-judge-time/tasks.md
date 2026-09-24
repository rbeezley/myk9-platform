## 1. Behavior

- [x] 1.1 Gate the existing judge-time estimate on loaded, current, nonzero entry counts without changing the formula.
- [x] 1.2 Keep the estimate reactive to entry additions and withdrawals and update the explanatory wording.

## 2. Testing

- [x] 2.1 Add focused tests for zero, unavailable, loading, populated, and changed entry counts.
- [x] 2.2 Run focused Vitest, relevant typecheck, changed-file lint, and code-quality ratchet.

## 3. Delivery

- [x] 3.1 Validate the OpenSpec artifacts and implementation against MYK9-689.
- [x] 3.2 Commit, push, open a PR, resolve adversarial review findings, and verify required CI.
