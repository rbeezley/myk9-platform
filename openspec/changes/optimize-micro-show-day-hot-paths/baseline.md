# Supabase Micro G9 Baseline

Recorded: 2026-07-29

## Capacity run

- Workflow run:
  <https://github.com/rbeezley/myk9-platform/actions/runs/30483398212>
- Compute tier: Supabase Micro
- Workload: four synchronized shards, 100 configured sessions, at least 50 ringside sessions,
  canonical `514|504|0` fixture
- Peak observed sessions: 71/100
- Peak observed ringside sessions: 54/55
- Throughput: 904.1 requests/second
- Requests: 587,052 total; 3,265 failed
- Workflow failures: 88
- Error rate: 0.5711%
- Availability: 99.4289% (target at least 99.5%)
- Scoring p95: 161,152.87 ms (target at most 200 ms)
- API p95: 38,430.95 ms (target at most 200 ms)
- Page p95: 15,999.76 ms (informational)
- Scoring: 114 attempts, 55 retries, 4 successes, 14 exhausted
- Replication queue maximum/final: 1/0

The database postmaster start time reset to `2026-07-29 19:38:52.477169+00` during the load
window, and `pg_stat_database` counters reset from 27,508,934 commits / 431,134,043 rollbacks to
3,388 / 9,478. This proves a database restart occurred; it does not by itself prove the restart
mechanism.

## Post-restart hot statements

| Statement                                     | Calls | Total time | Mean time |
| --------------------------------------------- | ----: | ---------: | --------: |
| `get_user_permissions` PostgREST wrapper      |   544 |     24.3 s |   44.7 ms |
| `people` profile read                         |    84 |      6.0 s |   71.8 ms |
| `get_effective_permissions` PostgREST wrapper |    69 |      4.1 s |   59.0 ms |
| `waitlist_entries` read                       |    44 |      1.5 s |         — |
| dog registrations read                        |    54 |     1.09 s |         — |

Only one post-restart scoring RPC remained in statistics, at 588.5 ms. The app source showed that
`AuthContext` refreshed complete RBAC state every minute while every `useRBAC()` consumer mounted
another complete load and five-minute timer.

## Remote pre-change RBAC inventory

- 7 roles
- 52 permissions
- 119 role-permission links
- 22 user-role rows, 21 active
- 6 user-role rows with no denormalized auth UUID; all six belong to people who also have no auth
  identity, so there is no denormalization drift for an authenticated person
- `user_roles_auth_user_id_idx` exists as a btree index
- All four client RBAC lookup functions are `STABLE`, `SECURITY DEFINER`, use an empty search path,
  deny anonymous execution, allow authenticated execution, join `people`, and do not use the
  denormalized auth predicate
- Representative current permission lookup: 49 rows, 0.288–0.351 ms execution, 116–119 shared
  buffers. The plan joins `people`; it scans the 22-row `user_roles` table because that is cheaper
  than an index at the current cardinality.

The reproducible read-only inventory is in `remote-inventory.sql`.

## Remote post-change verification

Migration `20260729160000_optimize_rbac_auth_lookup.sql` was applied to project
`sojmvhhwsjxmfistvzbe` on 2026-07-29.

- All four functions remain `STABLE`, `SECURITY DEFINER`, and fixed to an empty search path.
- Anonymous execution remains denied and authenticated execution remains granted.
- All four functions use `user_roles.auth_user_id` directly and no longer join `people`.
- Representative secretary/exhibitor comparison against the legacy people-join queries found zero
  differences across 98 permission rows, 6 role rows, and 114 effective-permission rows.
- `user_has_permission` matched the legacy predicate for all 116 direct, inherited, scoped, and
  missing-permission probes.
- The representative direct-auth plan returned the same 49 rows in 0.226 ms with 114 shared-buffer
  hits and no `people` join. PostgreSQL still chose a sequential scan of the 22-row `user_roles`
  table because it is cheaper at this cardinality; the auth-identity index remains applicable.

The reproducible read-only post-change check is in `remote-verification.sql`.

## Comparative rerun contract

The post-change result must use the same Micro tier, canonical fixture, four-shard topology,
100-session workload, ringside minimum, duration, workflow mix, evaluator, and thresholds. A
lighter workload or compute upgrade is a different experiment and cannot prove this optimization
fixed the baseline.
