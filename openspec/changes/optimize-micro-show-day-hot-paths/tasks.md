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

- [x] 5.1 After explicit approval, push the migration and verify remote roles/permissions/
      role-permissions inventory, authenticated/anonymous grants, seeded result equivalence, and
      before/after `EXPLAIN (ANALYZE, BUFFERS)` evidence
- [x] 5.2 After explicit approval, create the PR; run required CI and independent PR review
- [x] 5.3 After explicit approval, merge the PR and verify the normal main-branch deployment
- [x] 5.4 After a separate explicit load-window approval, rerun unchanged G9 on Micro, restore the
      canonical fixture/grant state, and record the complete pass/fail evidence
- [x] 5.5 Update MYK9-109 and launch-readiness tracking only with approved evidence; close the issue
      only if its acceptance criteria pass
- [ ] 5.6 Archive this OpenSpec change after merge and complete branch/worktree cleanup

## 6. Post-RBAC Failure Diagnosis

- [x] 6.1 Record the complete failed post-RBAC G9 run, cleanup state, platform peaks, and hot
      statement deltas
- [x] 6.2 Trace the remaining load to show-wide Broadcast → full-sync fan-out, mount-time
      account-entry invalidations, hard-reload amplification, lockstep scoring class order, and
      missing workflow failure details
- [x] 6.3 Update the comparative evidence contract so the failed hard-reload run remains diagnostic
      and the corrected realistic behavior is explicitly a new experiment

## 7. Red Tests for the Remaining Storm Paths

- [x] 7.1 Add failing signal/migration contracts for affected old/new class routing,
      move/delete reconciliation, and backward-compatible unscoped signals
- [x] 7.2 Add failing at-show tests proving unrelated-class signals do not sync, entry signals avoid
      trial/class pulls, class signals use the narrow known trial scope, and unknown scope falls
      back safely
- [x] 7.3 Add failing replication/account-today tests proving subscription attachment does not
      invalidate, duplicate hook consumers share subscriptions, actual changes coalesce, and final
      unmount cleans up
- [x] 7.4 Add failing load-runner/metrics tests proving passive sessions stay connected, scoring
      starts are distributed across classes, and workflow failure details survive shard aggregation

## 8. Realtime and Startup Containment

- [x] 8.1 Add optional non-emitting replication subscriptions without changing the default
      initial-snapshot behavior used by existing consumers
- [x] 8.2 Share and coalesce the account-today invalidation lifecycle per query client/user
- [x] 8.3 Preserve class routing metadata from Broadcast and filter at-show refreshes to relevant
      single/combined class pages
- [x] 8.4 Implement table-specific at-show sync with complete-sync fallback for old, unknown, or
      incompatible signals
- [x] 8.5 Add the additive Broadcast migration and source contract without applying it remotely

## 9. Realistic and Diagnosable G9 Behavior

- [x] 9.1 Keep non-scoring devices mounted after their action instead of reloading every second
- [x] 9.2 Rotate scoring session class order while preserving eight scores/session and the bounded
      five-session OCC contention fixture
- [x] 9.3 Capture bounded workload/route/error summaries in shard artifacts, aggregate evidence,
      and rendered Markdown

## 10. Full Verification and Follow-up PR

- [x] 10.1 Run focused replication, account-today, at-show realtime, migration-contract, load
      runner, metrics, shard aggregation, and evidence tests
- [x] 10.2 Run package and myK9Show typechecks, relevant lint/build checks, and OpenSpec validation
- [x] 10.3 Run independent implementation review and resolve all blocking findings
- [x] 10.4 After explicit approval, commit, push, open a MYK9-109 follow-up PR, and run CI/review
- [x] 10.5 After explicit approval, merge the PR and verify the main-branch app deployment
- [x] 10.6 After separate explicit approval, apply/verify the Broadcast migration, run corrected G9
      on Micro, restore the fixture/grant state, and update MYK9-109 with complete evidence
- [x] 10.7 Close G9/MYK9-109 only on a complete pass; otherwise keep the failing dimensions open
      and archive/cleanup only when the change's implementation and evidence gates are satisfied

## 11. MYK9-126 Evidence Contract

- [x] 11.1 Record the corrected-behavior G9 failure, including CPU/connection headroom, latency,
      workflow timeouts, query deltas, and the ambiguity in the old active-session counter
- [x] 11.2 Add failing contracts for whole-runner CPU/memory/load, event-loop delay, Chromium
      responsiveness, preparation duration, synchronized-start headroom, and per-shard preservation
- [x] 11.3 Add failing contracts proving configured/prepared/started/completed/failed/peak-active
      lifecycle counts reconcile without early workflow failures reducing open-session concurrency
- [x] 11.4 Update the evidence renderer and evaluator to fail closed on missing generator or
      preparation evidence without weakening any existing G9 target

## 12. Generator and Session Instrumentation

- [x] 12.1 Implement a bounded runner sampler that covers context preparation through workflow
      completion and measures the whole runner host plus a dedicated Chromium control probe
- [x] 12.2 Record the session lifecycle independently from workflow success and source gate
      concurrency from prepared/open browser contexts
- [x] 12.3 Preserve every shard's generator/lifecycle evidence through artifact aggregation and
      render it in JSON/Markdown evidence
- [x] 12.4 Update the manual workflow and README contracts so topology, headroom evidence, and the
      unchanged 100-session/55-ringside workload cannot drift silently

## 13. Local Verification

- [x] 13.1 Run focused sampler, lifecycle, evaluation, shard aggregation, evidence, and workflow
      contract tests
- [x] 13.2 Run the load unit suite, myK9Show typecheck, relevant lint/build checks, and OpenSpec
      validation
- [x] 13.3 Run independent implementation review and resolve all blocking findings

## 14. Valid Generator Comparison and Remaining Latency

- [ ] 14.1 After explicit approval, commit, push, open the MYK9-126 PR, and run CI/review
- [ ] 14.2 After explicit approval, merge the PR and verify the main-branch deployment
- [ ] 14.3 After a separate explicit load-window approval, run instrumented four-runner G9 on
      Micro and restore the canonical fixture/grant state
- [ ] 14.4 If generator saturation is confirmed, distribute the unchanged 100 sessions across
      additional free runners and record an apples-to-apples comparison
- [ ] 14.5 With valid generator evidence, profile and remediate the remaining entries/scoring/
      entry-results/account-today backend long tail and page-readiness timeouts
- [ ] 14.6 Rerun full G9 on Micro; record a defensible ceiling or schedule a compute upgrade only if
      generator-separated evidence requires it
- [ ] 14.7 Keep G9/MYK9-109 open on any failing dimension; update MYK9-126 and archive/cleanup only
      after its implementation and evidence gates are satisfied
