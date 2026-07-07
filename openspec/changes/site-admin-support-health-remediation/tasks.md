## 1. Dashboard Platform Health Summary

- [x] 1.1 Inspect existing dashboard, health snapshot, support inbox, sync, and deleted-items data access patterns before adding summary code.
- [x] 1.2 Add a compact platform-health summary to `/admin/dashboard` that links to `/admin/health`, `/admin/support`, `/admin/sync`, and `/admin/deleted-items` without duplicating owner workflows.
- [x] 1.3 Render honest degraded/unavailable states for any summary signal that cannot load.
- [x] 1.4 Add focused dashboard summary tests for healthy, warning/fail, stale/unavailable, support-risk, and owner-link states.

## 2. Support Ticket Investigation Links

- [x] 2.1 Inventory support ticket diagnostic shape and existing canonical route helpers before creating any mapping helper.
- [x] 2.2 Implement a typed diagnostics-to-actions helper for recognized route, show, trial, class, entry, dog, user, sync, access, and recovery clues.
- [x] 2.3 Add support inbox UI for investigation actions, copy diagnostics/escalation context, next checks, and no-diagnostics empty state while preserving status/reply actions.
- [x] 2.4 Add focused helper/component tests proving recognized diagnostics map to correct links and unknown diagnostics remain copyable.

## 3. Health Check Remediation Links

- [x] 3.1 Inventory current health snapshot/check parsing and presentation before adding remediation metadata.
- [x] 3.2 Add typed owner/action metadata for known sync, support, recovery, permission, payout, migration, deploy, scheduler, and manual health checks with a safe unknown fallback.
- [x] 3.3 Render failed, warning, stale, unknown, and incomplete checks with owner action and next-step text.
- [x] 3.4 Replace hover-only recent run dots with visible or touch-accessible run history details while keeping all-green state glanceable.
- [x] 3.5 Add focused health metadata/history tests for degraded known keys, unknown fallback, incomplete coverage, and all-green history.

## 4. Access Troubleshooting Trust

- [x] 4.1 Inventory permission data joins and count definitions across roles, permissions, role_permissions, user-role joins, and profile/person labels before patching.
- [x] 4.2 Fix permissions page queries or fallback presentation so normal seeded/admin data does not show unexplained `Unknown User` or `Unknown Role`.
- [x] 4.3 Reconcile or clearly label role-card permission/user counts versus overview counts.
- [x] 4.4 Label `/admin/rbac-test` links as debug-only wherever they are reachable from production admin pages.
- [x] 4.5 Add focused permissions tests for resolved labels, missing-relationship copy, count definitions, and debug-only RBAC links.

## 5. Tracking And Verification

- [x] 5.1 Update `docs/plan-site-admin-support-health-remediation.md` and any active tracking docs to reflect completed implementation phases.
- [x] 5.2 Run focused unit/component tests for changed dashboard, support, health, and permissions files.
- [x] 5.3 Run `pnpm --dir apps/myk9show typecheck`.
- [x] 5.4 Run `pnpm --dir apps/myk9show lint`.
- [x] 5.5 Run admin route-health smoke: `pnpm --dir apps/myk9show test:e2e:clean src/test/e2e/route-health-by-role.spec.ts --grep "Route health: admin" --project=chromium --workers=1 --timeout=90000 --retries=0`.
- [x] 5.6 Run `pnpm openspec validate --changes "site-admin-support-health-remediation"`.

## 6. PR, CI, And Archive Gate

- [x] 6.1 Commit implementation with the OpenSpec artifacts and tracking updates.
- [x] 6.2 Open a PR that includes `Tracked in openspec change: site-admin-support-health-remediation` and the focused test plan.
- [ ] 6.3 Monitor PR checks and address actionable failures.
- [ ] 6.4 After PR review, CI pass, and merge, archive the OpenSpec change.
- [ ] 6.5 Sync `main`, prune refs, delete the local branch, and remove this worktree as final cleanup.

## Validation Profile

- Risk: medium
- Validation: app
- Rationale: This changes multiple site-admin UI flows inside myK9Show, but does not touch DB schema, RLS, payments, auth primitives, shared packages, or offline replication paths.
