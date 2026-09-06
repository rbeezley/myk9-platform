# Plan: Fix nightly review findings

> **Status:** Active — metadata reconciled 2026-09-05.
> Richard owns reconciliation: existing historical implementation/status is preserved below; closure evidence is not independently established in this pass. Keep active pending that evidence.


## Scope

Fix the three unresolved findings from the 2026-07-20 nightly commit review:

1. Allow Turnstile network connections in both production CSP definitions.
2. Prevent bulk role replacement from preserving legacy global secretary/club-admin grants when narrowing to club scopes.
3. Ensure cold secretary entry hydration does not return incomplete class/trial joins.

## Testing phase

- Add failing regression coverage for each behavior at its existing public seam.
- Run the focused myK9Show tests for CSP, bulk role actions, secretary replication, and related changed files.
- Run myK9Show typecheck/lint and the full relevant test suite; stop any test runner that hangs beyond the repository's 60-second limit.
- Review the final diff for scope and confirm the worktree is clean apart from intentional changes.
