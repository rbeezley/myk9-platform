## Context

The valid G9 baseline ran 100 browser sessions, including 54 ringside sessions, against Supabase
Micro. The database restarted near the end of the run. After restart, the hottest surviving
statements were the `get_user_permissions` and `get_effective_permissions` PostgREST wrappers.

The client currently has two overlapping RBAC lifecycles:

- `AuthContext` loads all access data on sign-in and every minute.
- Every `useRBAC()` consumer separately loads the same access data on mount and every five minutes.

Each access load executes three RPCs sequentially. The current database functions also join
`user_roles` through `people` to translate an auth UUID even though migration 156 already maintains
and indexes `user_roles.auth_user_id` for this exact lookup. The account-suspension profile poll is
a separate security behavior and remains unchanged.

This is not a UX-facing change and adds no product surface. Core show-day records still use the
existing replication-backed reads and mutation manager; RBAC remains an online auth-adjacent path.

## Goals / Non-Goals

**Goals:**

- Give each app instance one authoritative RBAC lifecycle.
- Coalesce concurrent access loads and bound automatic permission refresh to five minutes.
- Use the indexed auth UUID already present on `user_roles`.
- Preserve exact authorization, scope, inheritance, fail-closed, and explicit-refresh behavior.
- Establish with focused tests and an unchanged G9 rerun whether Micro meets the launch gate.

**Non-Goals:**

- Changing scoring, OCC, replication, or offline durability.
- Changing suspension polling, RLS policies, roles, grants, or permission assignments.
- Weakening the G9 workload or thresholds.
- Adding a circuit breaker or upgrading compute.

## Decisions

### 1. `AuthContext` owns current-user access state

`useRBAC()` will adapt the access state and actions already exposed by `AuthContext` instead of
starting its own fetch and interval. `AuthContext` will expose the detailed role/scoped-permission
values already held internally so existing consumers keep their current return type.

Alternative considered: retain both lifecycles and rely only on a service cache. That masks most
network duplication but leaves two timers, two loading/error states, and avoidable complexity.

### 2. Coalesce and cache complete access loads in `PermissionChecker`

The service will keep a per-user completed result and in-flight promise for five minutes. Calls for
the same user during an active load await the same promise. Explicit refresh and role mutations
clear the user's cache before loading again. Failed loads are never cached.

This is defense in depth for non-React callers and Strict Mode remounts; it is not the primary state
owner. The existing single-permission cache remains separate.

Alternative considered: a global React Query conversion. That would be a broader auth refactor and
is unnecessary to remove the measured duplicate work.

### 3. Preserve one refresh authority at a five-minute cadence

`AuthContext` will refresh RBAC automatically every five minutes. Explicit refreshes after role
changes bypass the cache. Server-side RLS/RPC authorization remains authoritative between refreshes,
so stale client state can expose a control briefly but cannot grant a forbidden database action.
The one-minute account-suspension profile check is untouched.

Alternative considered: Realtime role subscriptions. They add connection/channel load to the exact
capacity path under investigation and are not needed for this bounded optimization.

### 4. Rewrite RBAC functions around `user_roles.auth_user_id`

An additive migration will recreate `get_user_permissions`, `get_user_roles`,
`get_effective_permissions`, and `user_has_permission` with their current signatures, return
shapes, `SECURITY DEFINER`, `STABLE`, empty `search_path`, and authenticated grants. Only the
auth-identity lookup changes: the functions filter `user_roles.auth_user_id` directly and remove
the `people` join.

The migration will not add an index speculatively. Migration 156 already created
`user_roles_auth_user_id_idx`; before deployment, remote inventory and `EXPLAIN (ANALYZE, BUFFERS)`
must confirm that index exists, the new predicate is indexable, and the `people` join is gone.
PostgreSQL may correctly prefer a sequential scan while `user_roles` has only a few dozen rows;
the plan choice will be recorded rather than artificially forced.

Alternative considered: a new combined JSON RPC. It could remove extra round trips, but it expands
the API contract and duplicates existing functions before the simpler measured bottleneck is tested.

### 5. [ADDED] Align the client mapping with the preserved SQL return contract

The current SQL returns `scope_type` and `scope_id`, while the private client interface still names
obsolete `club_id` and `show_id` fields. The implementation will correct that private mapping and
pin it with a value-sensitive test. This is required to preserve the database's existing scope
semantics through the hook consolidation; it does not change the public RPC.

Alternative considered: preserve the stale private field names. That would knowingly flatten
scoped grants to global in client state and would make authorization-equivalence claims false.

### 6. Compare with the exact G9 baseline

The post-deployment run will reuse the same seed, 100-session composition, four shards, duration,
Micro tier, and evaluator thresholds. A changed workload cannot establish that these optimizations
fixed the baseline failure.

## Risks / Trade-offs

- [Client permissions can be up to five minutes old] → Database authorization stays authoritative;
  role mutations and operator refreshes invalidate immediately; suspension polling is unchanged.
- [A cache could retain a transient or cross-user result] → Key by auth UUID, do not cache failures,
  clear on user change/sign-out, reject responses from invalidated request generations, keep async
  point checks out of the authoritative snapshot, and test user isolation and invalidation.
- [Function recreation could alter security semantics] → Preserve signatures, security attributes,
  grants, filters, output columns, scope logic, and inherited `:manage` expansion; add SQL source
  contracts and compare remote results for seeded secretary/exhibitor identities.
- [Correcting stale scope field names changes a previously incorrect client result] → Pin the
  actual SQL output contract first and test show-, club-, and global-scope mapping explicitly;
  server authorization remains unchanged.
- [The database may still fail G9] → Record that result honestly; only then revisit compute sizing
  or a separately reviewed availability control.
- [Remote query plans differ from local/source expectations] → Inventory indexes and capture
  before/after `EXPLAIN (ANALYZE, BUFFERS)` on the remote project before rerunning load.

## Migration Plan

1. Add red-to-green client tests for shared loading, five-minute cadence, invalidation, user
   isolation, and fail-closed behavior.
2. Add the function-rewrite migration plus source-contract tests.
3. Run focused tests, typecheck, migration lint/source checks, and OpenSpec verification locally.
4. After explicit approval, push the migration to the remote Supabase project and verify function
   grants, result equivalence, indexes, and query plans.
5. Deploy the merged app through the normal main-branch path.
6. After a separate explicit load-window approval, run unchanged G9 on Micro and restore the
   canonical fixture/grant state.

Rollback:

- Revert the app commit to restore the previous RBAC lifecycle.
- Recreate the four functions from migration 065 if the direct predicate changes results or plans.
- No data rows or columns are transformed, so rollback requires no data recovery.

## Open Questions

None. Whether Micro is sufficient remains an evidence question answered by the unchanged G9 rerun.
