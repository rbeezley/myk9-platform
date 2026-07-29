## 1. Baseline and Test Contracts

- [x] 1.1 Record the failing G9 baseline, measured hot statements, unchanged workload contract, and
      remote RBAC table/index/function inventory used by this change
- [x] 1.2 Add failing `PermissionChecker` tests for same-user in-flight coalescing, five-minute
      result reuse, failed-load exclusion, per-user isolation, explicit invalidation, and exact
      `scope_type`/`scope_id` mapping
- [x] 1.3 Add failing hook/context tests proving `useRBAC()` reuses auth-context state, starts no
      independent timer/network load, and automatic RBAC refresh uses a five-minute cadence
- [x] 1.4 Add a failing migration source contract for direct indexed auth-identity predicates,
      preserved function signatures/security/grants, and removal of the `people` join

## 2. Client Hot-Path Consolidation

- [x] 2.1 Implement complete-access in-flight coalescing and five-minute successful-result caching
      in `PermissionChecker`, and correct its private scoped-permission response mapping
- [x] 2.2 Expose the auth context's existing detailed RBAC state and last-refresh value without
      creating a second source of truth
- [x] 2.3 Refactor `useRBAC()` and compatibility helpers to consume shared auth-context state while
      preserving permission, scope, admin-action, refresh, and fail-closed behavior
- [x] 2.4 Change only the automatic RBAC refresh to five minutes and ensure explicit refresh/role
      mutation bypasses the cache; leave account-suspension polling unchanged

## 3. Database Hot-Path Optimization

- [x] 3.1 Add an additive migration recreating the four RBAC lookup functions around
      `user_roles.auth_user_id` while preserving outputs, filters, inheritance, security attributes,
      and least-privilege grants
- [x] 3.2 Make the migration source contract pass and document rollback to the migration 065
      definitions

## 4. Local Verification

- [x] 4.1 Run focused `PermissionChecker`, `useRBAC`, `AuthContext`, and migration-contract tests
- [x] 4.2 Run myK9Show TypeScript checking and the narrowest relevant lint/build checks
- [x] 4.3 Run OpenSpec validation and independent implementation review; resolve all blocking
      findings

## 5. Remote Verification and Capacity Decision

- [ ] 5.1 After explicit approval, push the migration and verify remote roles/permissions/
      role-permissions inventory, authenticated/anonymous grants, seeded result equivalence, and
      before/after `EXPLAIN (ANALYZE, BUFFERS)` evidence
- [ ] 5.2 After explicit approval, create the PR; run required CI and independent PR review
- [ ] 5.3 After explicit approval, merge the PR and verify the normal main-branch deployment
- [ ] 5.4 After a separate explicit load-window approval, rerun unchanged G9 on Micro, restore the
      canonical fixture/grant state, and record the complete pass/fail evidence
- [ ] 5.5 Update MYK9-109 and launch-readiness tracking only with approved evidence; close the issue
      only if its acceptance criteria pass
- [ ] 5.6 Archive this OpenSpec change after merge and complete branch/worktree cleanup
