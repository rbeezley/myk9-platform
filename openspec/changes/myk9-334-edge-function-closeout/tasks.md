## 1. Implementation and focused tests

- [x] 1.1 Add assertion-first unsupported-email tests, remove four dead types/templates and recipient fallback, and pass supported authorization/recipient regression tests.
- [x] 1.2 Add and run cron outcome tests for lookup failure, success, retryable delivery errors, observability failures, and dedupe; wire best-effort monitoring and alerts without changing auth or state transitions.
- [x] 1.3 Extract the existing no-subscription persistence branch and test the exact unique conflict target, stale-row retirement, and failure short-circuit before profile downgrade.

## 2. Verification

- [x] 2.1 Register edge tests in both configs; run focused tests with six shuffled seeds, edge typecheck, formatting/diff checks, and broader existing edge tests. Record any blockers honestly.
- [x] 2.2 Run independent review, fix findings, and validate OpenSpec; preserve existing batch plan and record completed versus externally owned/deferred scope.

## 3. Shared-system gates and close-out

- [x] 3.1 After explicit approval, publish PR with scope, issue, checks, risks, and this change name; obtain green CI/review and approval to merge. PR #1982 merged as `df598effe` with all required checks green.
- [x] 3.2 After explicit approval, deploy only the three reviewed functions to remote sojmvhhwsjxmfistvzbe without Docker and verify downloaded live source parity. Cron v56 (9 files), webhook v90 (25 files), email v74 (10 files): exact source/dependency matches.
- [x] 3.3 After approval and all acceptance evidence, update MYK9-334 with PR/merge/deployment/tests and Done; retain deferred items as open. Completion evidence posted to Linear.
- [ ] 3.4 Resolve the requested spec-sync/archive choice, publish the documentation close-out, and perform final scoped worktree cleanup. The merged implementation branch is already deleted; unrelated local-main work is preserved.
