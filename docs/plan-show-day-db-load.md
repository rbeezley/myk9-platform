# Show-day database load: cut per-device reads, then find the Micro ceiling

> **Status:** Active

Linear: MYK9-126 (G9 capacity), MYK9-109 (load gate). Evidence: G9 rehearsal [run 39390552156](https://github.com/rbeezley/myk9-platform/actions/runs/39390552156), 2026-10-20.

## What happened on 2026-10-20

358 connected devices (20 ringside) on Supabase Micro.

- **08:30 UTC:** about 3,760 requests a minute arrived.
- **From 08:30:** PostgREST could not get a pooled connection (`PGRST003`), and queries hit the statement timeout (`57014`).
- **08:35–08:37:** Supavisor checkouts waited 15 s (`ECHECKOUTTIMEOUT`).
- **08:38:05:** Postgres restarted (`pg_postmaster_start_time()`). It probably ran out of memory on the 1 GB machine; the logs don't record the cause.
- **Result:** 25.6% of requests failed, 74.4% availability, 0 of 20 ringside workflows completed.

The "81% CPU" figure is a lower bound, because the sampler reached the database for only 14% of its CPU readings.

## Where the load comes from

### Per-query cost

Measured idle on 2026-10-20, as real users, inside `BEGIN READ ONLY` with RLS applied:

| Read                                                                | Caller                 | Plan     | Execute    | Note                                                                                                         |
| ------------------------------------------------------------------- | ---------------------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| `view_authenticated_entry_results` (and `_replication`), full delta | exhibitor or secretary | 30–40 ms | 250–260 ms | 41 subplans; a per-entry aggregate runs 518 times                                                            |
| Same view, **no changed rows** (a steady-state poll)                | exhibitor or secretary | 20 ms    | 32 ms      | `updated_at` is `GREATEST(...)` over 8 joined tables, so no index helps and the whole view is computed first |
| `get_account_today_entries()`                                       | exhibitor              | <1 ms    | 23 ms      | runs once per signed-in device                                                                               |
| `dogs` delta, staff, unscoped                                       | secretary              | 1 ms     | 5 ms       | cheap alone; slow only under contention                                                                      |
| `classes` delta                                                     | either                 | 1 ms     | 5 ms       | cheap alone                                                                                                  |
| `get_user_permissions`                                              | secretary              | <1 ms    | 2.5 ms     | cheap alone                                                                                                  |

The statement statistics since the 08:38 restart rank by total time:

1. Realtime WAL polling: 37,560 calls, 393 s, 66 million blocks.
2. The `dogs` delta: 376 s.
3. The entry-results view: 219 s, 1.8 s mean.
4. `judge_assignments`: 164 s.
5. `classes`: 115 s.
6. `get_user_permissions`: 107 s.

### Per-device cadence

From the code map (file:line evidence is in the MYK9-126 thread).

**The 60 s sync pass.** Every device runs it, and it is unscoped (`App.tsx:221` gives no `syncScopeId`). It covers 12 tables, each with a row-count query plus a delta read. Every pass also runs non-delta id scans of `dogs`, `dog_registrations` and `clubs`, and re-downloads all unavailable armbands.

**Realtime nudges.** Each `show:{id}:changes` broadcast starts a **full** pass on every subscribed device after only a 400 ms debounce, bypassing the 15 s minimum gap. One score therefore makes every device in the show re-sync all 12 tables at almost the same moment.

**Independent pollers:**

- notification monitor: 30 s, re-reads every class and entry of the show with no delta, and runs even with nothing watched;
- `get_account_today_entries`: re-invalidated on every replica write;
- RBAC: 3 RPCs every 5 min, cache cleared first;
- `usePersonIdentity`: 60 s;
- notifications, favorites and queue places: 30–60 s;
- ringside heartbeat: 30 s.

### The harness models most of this badly

248 of the 358 sessions are virtual readers that make 3 requests a minute (`classes`, the entries view, `dogs`). They make no count queries, RPCs, id scans or pollers. They also poll the entries view, which the real 60 s pass skips, and they let ticks overlap.

So the 2026-10-20 number is neither the real app's ceiling nor a safe overestimate. **Phase 1 fixes the harness first**, otherwise no later number can be trusted.

## Phases

Each phase ships as its own PR and its own test run. A phase is complete only when its tests pass and its measurement is recorded on MYK9-126.

### Phase 1: make the harness measure the real app

- [ ] Virtual readers replay the app's actual sync pass by importing the replication adapters' query builders, not hand-written URLs. Same tables, count queries, scope, in-flight guard and cadence. Replace the fidelity test's hand-written URL with an import of the adapter.
- [ ] Add a `sessions` input to the `Manual G9 Load Rehearsal` workflow (for example 50 / 100 / 200 / 358), keeping the role mix proportional.
- [ ] Record per run: `pg_postmaster_start_time()` before and after (a restart fails the run), Supavisor checkout errors, and `PGRST003` counts from the logs.
- [ ] Tests: unit tests on the adapter-backed virtual reader and the session-count split; one smoke run at `sessions=50`.

### Phase 2: baseline the ceiling on today's code

- [ ] Step-down runs at 100, then 200, on unchanged app code. Stop at the first failing size. This gives the "before" number for every later change.

### Phase 3: client changes, the largest and cheapest wins

No schema change. Ordered by expected load removed per device.

1. [ ] **Nudges sync only what changed.** Route `show:{id}:changes` through the scoped at-show sync, never a full 12-table pass. Add a minimum gap (for example 5 s) and 0–3 s random jitter so devices in one show don't stampede together.
2. [ ] **A slower poll while realtime is up.** While the show channel is `SUBSCRIBED`, stretch the 60 s pass to 3–5 min with jitter. Keep 60 s when offline or unsubscribed, as the offline-first fallback.
3. [ ] **Drop the per-table count query from every pass.** Run it only on the forced 24 h full sync, or when a delta returns a full page.
4. [ ] **Scan dog ids at most hourly**, or only on a count mismatch (`ReplicatedDogsTable.ts:293`).
5. [ ] **Notification monitor:** enable it only with a non-empty watch set, drop `refetchInterval` while realtime is subscribed, and build its snapshot from the replica where possible.
6. [ ] **`get_account_today_entries`:** a longer `staleTime`, and invalidation coalesced to at most every 30 s.
7. [ ] **RBAC and identity:** stop clearing the cache before the 5 min refresh, refresh on focus instead of a timer, and drop identity's `refetchInterval`.
8. [ ] **An `updated_at` delta for armbands**, instead of re-downloading on every sync.

Offline-first guard: every change keeps the replica correct with realtime down. The fallback cadence is only slower, never removed. Read `docs/INTENT.md` for ringside before touching the at-show paths.

Tests:

- unit tests for scheduler gap and jitter, subscribed-versus-fallback cadence, and the count-skip rule;
- the replication suites green, run shuffled;
- one e2e at-show journey;
- then a Phase 2-sized rehearsal comparing requests per device per minute against the baseline.

### Phase 4: database, for whatever still costs too much

1. [ ] **A changed-since check for the entry-results view.** Each empty poll currently computes the whole view. Add a per-show watermark (one row per show, bumped by statement-level triggers on the tables that feed the view's `GREATEST`). The client reads the watermark first, which is one row, and queries the view only when it moved. This is **security-sensitive**: the view enforces release and visibility, so the watermark must reveal nothing, needs an independent review, and needs behavioral SQL tests showing results stay hidden until release (memory: Public Results Release Gate).
2. [ ] **Cut the view's own cost:** collapse the 518 per-entry runs of the profile-tie aggregate into one grouped join, and measure planning time (20–40 ms per call, re-planned on every request under transaction pooling).
3. [ ] **Realtime WAL cost:** check whether the remaining realtime writers (the `ringside_containment_sample` cron, at 78 ms mean) can do less.

Tests: behavioral SQL tests for every view change (visibility parity before and after), `pnpm qa:sql-local`, and the EXPLAIN timings above re-measured and recorded.

### Phase 5: find the ceiling

- [ ] Step up from the Phase 2 baseline (100 → 200 → 358) on the changed code. Record the largest size that passes G9 with no Postgres restart.
- [ ] Record the ceiling on MYK9-126 as "N connected devices (R ringside) on a show of M entries, Micro".
- [ ] Only if a valid run shows Micro is still the limit after Phases 3–4, write up the compute-upgrade option for the owner. Upgrading is the owner's decision.

## Non-goals

- No change to G9 thresholds, or to the mix of roles within a run.
- No compute upgrade inside this plan.
- No removal of the offline fallback poll.
