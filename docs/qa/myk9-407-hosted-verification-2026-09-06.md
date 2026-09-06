# MYK9-407 hosted verification — 2026-09-06

Status: complete — source, deployed execution, carry-forward and authenticated admin UI verified.
Original request: "fix myk9-407".
Existing implementation: PR #2069; verification branch `codex/myk9-407-deployed-cadence`, baseline `f47c47ed7`.
Continue `openspec/changes/repair-admin-health-residual-contract` task 1.4. No new implementation or deployment is required.

## Deployment and source parity

Read-only download of `cron-health-check` from `sojmvhhwsjxmfistvzbe` on September 6 confirms all nine deployed source files are byte-identical to current source, including the corrected shared cadence table. This supersedes September 5's old-bundle comparison.

- Active version: 33; `verify_jwt: false`.
- Updated: 2026-09-06T03:21:06.757Z.
- Bundle SHA-256: `b90e70cd197c73a6fb8f6db4dbf3178a857a0a837b464b31c7bf8e6397c44c4c`.
- Download retained locally at `/private/tmp/myk9-407-rollback-20260906`.
- This task did not deploy, invoke the runner, change ACLs, or rewrite snapshots.

## Hosted execution

Read-only PostgREST query of `system_health_snapshots` selected the latest full run, its first subsequent continuous run, and the latest available run.

| Mode | Snapshot ID | Created at (UTC) |
| --- | --- | --- |
| Full | `beb7ad98-2af3-4e22-baca-c63d356ca849` | 2026-09-06 07:00:06.156432 |
| First continuous after full | `051deaa2-a07c-474a-8809-323ef345145a` | 2026-09-06 07:05:04.854685 |
| Latest sampled continuous | `38acf263-d6b1-4170-960b-f325ed128237` | 2026-09-06 12:40:02.695578 |

In all three snapshots, `anon_grants`, `applied_acl_grants`, and `public_schema_create_acl` have `stale_after_ms = 172800000`, status `ok`, and `checked_at = 2026-09-06T07:00:05.644523+00:00`. Both continuous runs preserve the daily timestamp and verdict.

## Verification and remaining gate

- 65 tests passed across `healthCheckCadence.test.ts` and `_shared/systemHealthChecks.test.ts` (787 ms). These cover registry completeness, identical ACL windows, legacy compatibility, full measurement and carry-forward.
- Replayed the nine downloaded ACL records through the actual UI `parseSnapshot` and `isStale` selectors: all normalize to 48h, retain original timestamps/verdicts, remain fresh now and at 27h, and become stale at 49h.
- Hosted `/admin/health` currently denies access to the browser's Test Exhibitor identity. No role changes or impersonation performed. Requested a site-admin sign-in to finish `/admin/health` and `/admin/dashboard` verification.
- Keep MYK9-407 In Progress until that browser gate is recorded. Then mark task 1.4 complete, reconcile the findings registry and implementation tracker, and close the issue. Do not redeploy the already-correct runner.

## Final browser evidence — 2026-09-06 12:46 UTC

The owner signed in as a site admin. On staging `/admin/dashboard`, Services lists Anon grants, Applied ACL grants, and Public schema CREATE ACL as OK; no ACL freshness item appears in Needs a look. `/admin/health` shows the same three rows OK. Expanding Public schema CREATE ACL shows Last passed Sep 6, 2026, 3:00 AM Eastern, matching the hosted 07:00 UTC daily measurement. No Run now or Resolve action was used. The unrelated payout verification and operator-alert items were preserved.

All MYK9-407 acceptance criteria and the hosted/browser evidence gate now pass. Original fix PR #2069 merged at 2026-09-06T02:40:35Z, commit `bd67e9a44fe7244027432f2ad577ffe8dee17889`. This evidence completes OpenSpec task 1.4; no redeployment or new implementation PR is needed.
