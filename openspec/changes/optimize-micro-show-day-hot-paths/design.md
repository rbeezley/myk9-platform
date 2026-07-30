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

### 7. [ADDED] Treat the post-RBAC run as diagnostic, not a capacity ceiling

The post-RBAC run proved the RBAC lifecycle no longer dominates, but 97 workflows failed and the
runner replaced normal connected-device behavior with a hard browser reload every second. The run
therefore remains valid evidence that G9 failed, but it is not a valid ceiling for realistic
show-day behavior and cannot decide whether Micro is adequate.

The corrected scenario keeps the same seed, 100 sessions, 55 ringside sessions, four shards,
ten-minute duration, workload roles, and evaluator thresholds. Its behavioral correction is
explicitly versioned in the evidence: non-scoring devices perform their assigned action and remain
connected, while scoring sessions are distributed across class order instead of moving in
lockstep. This is a new capacity experiment, not a claim that the earlier RBAC-only change fixed
the original hard-reload workload.

### 8. [ADDED] Route show-day invalidation to affected classes

The database Broadcast trigger will continue to emit an advisory show-scoped signal with no entry
or result data. It will encode each affected old/new class UUID in the existing `id` field as
`scope:<uuid>`. The client signal parser will decode that routing metadata. A class or
combined-class page will ignore signals whose class IDs do not intersect the page it renders.

The payload intentionally remains limited to the legacy `table` and `id` keys. During rolling
deployment, already-deployed clients accept that shape and use their existing show-wide fallback;
new clients decode the scope envelope. Older unscoped signals remain valid and also trigger the
show-wide fallback. This prevents either app/database deployment order from leaving a ringside
device stale.

A class that moves between trials keeps the same UUID, so its old/new class IDs cannot identify
both trial scopes. That update therefore emits `reconcile:<uuid>` in the legacy-compatible `id`
field, allowing new clients on each show topic to remove the stale local snapshot before complete
reconciliation while older clients perform their safe full-sync fallback. Hard deletes and the
production `deleted_at` transition use the same reset path.

Alternative considered: put changed entry rows in Broadcast and write them directly into IndexedDB.
That would duplicate the authoritative replication merge/conflict path, increase the data exposed
through the advisory channel, and weaken offline reconciliation.

### 9. [ADDED] Sync only the table path named by a relevant signal

For an entry signal, the at-show adapter will sync the show-scoped authenticated entry view and
then refetch the page from IndexedDB. It will not also sync trials and every class. For a class
signal, it will sync only the trial scope belonging to the affected locally known classes; an
unknown class or old unscoped signal falls back to the complete show sync.

Existing in-flight coalescing remains in place, and offline failures remain non-fatal: cached data
continues to render and the next signal, foreground refresh, background sync, or manual refresh
recovers.

### 10. [ADDED] Subscription attachment is not a data change

`ReplicatedTable.subscribe` will gain an optional `emitCurrent` setting that defaults to the current
behavior. `useAccountTodayEntries` will opt out of the initial snapshot callbacks because its React
Query performs the initial authoritative load itself. Its four table subscriptions will be shared
per query client/user and change notifications will be briefly coalesced, so two hook consumers on
one page do not install duplicate invalidation lifecycles.

Actual replication changes still invalidate the account-today query. Unmounting the final consumer
removes all four subscriptions and any scheduled invalidation.

### 11. [ADDED] Rehearsal failures are operator-actionable

The load runner will record workload kind, current route, normalized error message, and occurrence
count for every failed workflow. Shard aggregation will merge those summaries and the Markdown
evidence will render them. The runner will no longer silently reduce a failure to one integer.

Non-scoring workflows remain mounted until the scenario deadline after completing their assigned
action. Scoring sessions keep the same eight scores per session but rotate their class order by
session so all 55 simulated judges do not hit one class in lockstep.

### 12. [ADDED] Generator health is part of capacity evidence

Each shard will sample the whole runner host, not only the Node coordinator process, because the
Chromium child processes carry most of the browser load. The shard artifact will record host CPU
p95/peak, memory peak, one-minute load peak, Node event-loop delay p95/max, a dedicated Chromium
control-round-trip p95/max/failure count, sample count, context-preparation duration, and
synchronized-start headroom.

The sampler starts before browser-context preparation and stops after all workflows and queue
checks finish. A dedicated blank probe page avoids coupling browser responsiveness to any
particular app route while still traversing Playwright, CDP, and Chromium scheduling. Shard
aggregation preserves each runner independently; it does not average away one saturated runner.
Host sampling and Chromium probing use independent one-second schedules, and every Chromium probe
and cleanup wait is bounded at two seconds so an unresponsive browser cannot prevent the shard
artifact from being written. Evidence records elapsed sampling duration, expected-versus-observed
host coverage, and expected-versus-attempted browser-control coverage; both must reach 80%.
A timed-out probe is retired after its first failure so the sampler does not queue additional CDP
requests behind an operation Chromium has stopped servicing.

The first instrumented run uses explicit diagnostic thresholds: host CPU p95 at least 90%, memory
peak at least 95%, event-loop p95 at least 100 ms, browser-control p95 at least one second, or a
browser-control failure rate of at least 5% identifies a saturated shard. Incomplete or saturated
generator evidence invalidates browser-derived backend-latency attribution and prevents G9 from
passing. The Markdown result names each affected shard and reason.

The G9 evaluator fails closed when any shard lacks generator evidence or reports incomplete
session preparation. Resource measurements are diagnostic on the first instrumented run: the
evidence renderer identifies sustained runner pressure, but backend thresholds remain unchanged.
If the four-runner experiment shows generator saturation, the same 100 sessions will be
distributed across additional free public runners and compared without changing the workload,
duration, roles, or thresholds.

### 13. [ADDED] Session concurrency means open browser sessions

The previous `concurrentSessions` counter incremented after each ramp delay and decremented as soon
as a workflow completed or failed. That measured overlapping workflow lifetime, not the browser
sessions that had already been prepared and remained open. A fast failure could therefore turn
100 open contexts into a reported peak of 73.

The corrected evidence records configured assignments; prepared/open contexts at synchronized
start; workflows started, completed, and failed; high-resolution epoch start/finish intervals;
peak simultaneously active workflows; and the same lifecycle counts for ringside sessions.
Aggregation merges the intervals from every runner and calculates the cross-runner peak with a
half-open interval sweep, rather than summing shard-local maxima that may occur at different times.

`concurrentSessions` remains the gate-compatible field but is sourced from prepared/open contexts.
`ringsideSessions` is likewise sourced from prepared ringside contexts. The lifecycle breakdown
makes failures visible instead of using them to falsify the concurrency measurement.

### 14. [ADDED] Latency remediation follows a valid measurement

The latest corrected-behavior run kept Supabase CPU below 61% and connections at 37/60, but API and
scoring p95 still failed while all four two-vCPU runners produced similar page timeouts. The first
MYK9-126 implementation therefore makes generator validity measurable before changing database or
page behavior again.

After the instrumented four-runner comparison:

- if generator headroom is insufficient, preserve the exact 100-session workload and fan it out
  across more free runners before attributing browser-observed p95 to Supabase;
- if generator headroom is clean, profile the entries replica query, ringside wrapper,
  authenticated entry-results read, and account-today fan-out from the same run;
- in either case, use workflow-stage evidence to reproduce submit-button, dog-card, run-schedule,
  and Show Desk readiness failures under a bounded focused test before changing app code.

This sequencing avoids optimizing a timing artifact and avoids buying compute while Micro retains
measured CPU and connection headroom.

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
- [A scoped signal crosses a rolling deployment] → Keep the payload limited to legacy `table` and
  `id` keys; old clients accept it and full-sync, while new clients decode the scoped ID envelope.
- [A class moves between trials, is deleted, or is absent locally] → Emit a `reconcile:<uuid>`
  envelope for trial moves and hard/soft deletes, remove the stale local snapshot, and fall back to
  complete show sync whenever one trial scope cannot be resolved.
- [Realtime refresh becomes stale or starves] → Preserve the leading debounce, one trailing refresh
  during an in-flight sync, foreground full refresh, and the independent periodic replication pass.
- [Shared account-entry subscriptions leak] → Reference-count them by query client/user, cancel
  scheduled invalidation, and unsubscribe all tables when the final consumer unmounts.
- [Correcting the harness changes the comparison] → Label the prior run diagnostic and the
  corrected behavior as a new experiment while keeping the G9 concurrency and thresholds intact.
- [Host metrics vary across GitHub runner images] → Record raw per-shard evidence, use portable
  Node/OS counters with explicit missing-data failures, and compare topology only within the same
  workflow and workload contract.
- [The browser probe perturbs the load] → Use one dedicated blank page per runner at a low sampling
  cadence and record the probe count/failures.
- [Prepared contexts could be mistaken for successful work] → Keep concurrency and workflow
  success as separate required fields; a prepared session does not erase its workflow failure.

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
7. Add red-to-green contracts for scoped Broadcast payloads, relevant-class filtering,
   table-specific sync, non-emitting account subscriptions, shared invalidation, connected-session
   behavior, distributed scoring class order, and failure-detail aggregation.
8. Deploy the merged app and, after separate explicit approval, apply the additive Broadcast
   migration.
9. After a separate load-window approval, run the corrected G9 scenario on Micro and restore the
   canonical fixture/grant state.
10. Add assertion-first contracts for generator telemetry, per-shard preservation, and the
    configured/prepared/started/completed/failed session lifecycle.
11. Run an instrumented four-runner G9 comparison after merge and deployment.
12. Only if the generator evidence shows saturation, distribute the unchanged workload across more
    free runners; otherwise proceed directly to the measured backend/page hot paths.

Rollback:

- Revert the app commit to restore the previous RBAC lifecycle.
- Recreate the four functions from migration 065 if the direct predicate changes results or plans.
- Revert the app commit and restore the prior Broadcast function definition if scoped routing or
  table-specific refresh regresses ringside freshness.
- No data rows or columns are transformed, so rollback requires no data recovery.

## Open Questions

None. Whether Micro is sufficient remains an evidence question answered by the corrected G9 rerun.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: This changes show-day realtime/replication behavior, a shared replication API,
  a database trigger function, and the launch-blocking distributed capacity harness.
