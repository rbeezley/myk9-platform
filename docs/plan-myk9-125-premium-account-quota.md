# MYK9-125 Premium Generation Account Quota

## Scope

Complete the remaining acceptance gap in `generate-premium`: a manager must not multiply the paid-generation budget by changing public show IDs. Preserve the existing per-show rolling limiter and add an account-wide rolling limiter for the authenticated user.

## Implementation

1. Update the throttle migration/function to serialize attempts per authenticated user, count both the account-wide and show-scoped windows, and reject when either five-attempt ceiling is exhausted.
2. Keep the existing RPC response contract so the edge function continues to fail closed on malformed limiter responses.
3. Extend edge tests for cross-show exhaustion and concurrent/account-scoped behavior, including that rejected attempts do not invoke generation.
4. Run focused function tests, typecheck/lint as practical, and review the diff for unrelated changes.

## Verification

- Unit tests prove one user's attempts on multiple shows share the account-wide five-attempt budget.
- SQL/source contract coverage proves the account lock and account-scoped count are present.
- Existing authorization tests continue to cover anonymous, non-manager, secretary, club-admin, and site-admin paths.
- Record live disposable-role replay and parallel/cross-show quota evidence before closing the Linear issue; do not run a paid authorized smoke test without operator approval.
