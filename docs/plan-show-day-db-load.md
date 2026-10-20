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

## Validation Profile

- Risk: high
- Validation: full
- Rationale: Phases 3 and 4 touch the offline replication scheduler, ringside sync paths and a visibility-enforcing view, and every rehearsal is a write to the shared Supabase project.

## How the rehearsals run [ADDED]

Every rehearsal reseeds and loads the shared project (`sojmvhhwsjxmfistvzbe`), so it is a shared-system write and never runs unattended or inside an orchestrated run:

- The owner asks for each run in chat and approves the `load-rehearsal` environment gate on GitHub; the agent cannot approve it.
- Run in a window where nobody is walking staging; it is slow for the whole load and for about 10 minutes after.
- Before dispatch: CI idle (the 16-runner headroom check), `pg_stat_activity` quiet, and no `PGRST003` or `57014` lines in the last 15 minutes of logs. A run that follows another by less than 30 minutes measures the previous run's tail.
- A run that restarts Postgres (`pg_postmaster_start_time()` moved) is a FAIL with no numbers, and the next run waits until the owner confirms the project is healthy in the dashboard.
- If cleanup fails to restore the fixture, the next run's reseed resets it; the operator reseed in `seed-reset` is the manual path. The cleanup's own failure reporting is #3139.
- Kill switch: cancelling the workflow run stops the shards; the `cleanup` job still runs (`if: always()`), so a cancelled run leaves no load behind.

## Phases

Each phase ships as its own PR and its own test run. A phase is complete only when its tests pass and its measurement is recorded on MYK9-126.

**Pass criteria for a run** are the README targets G9 already evaluates: p95 API < 200 ms, page loads < 3 s, error rate < 5%, > 100 req/s, plus no Postgres restart, platform-sampler resource coverage ≥ 80% and connection coverage ≥ 80% (a run below either coverage figure is "no verdict", because its CPU and connection numbers are floors, as on 2026-10-20), and generator evidence HEALTHY on every runner. [ADDED]

**Reverting a phase.** Phase 3 lands behind per-change flags in `config/features.ts` (one flag each for scoped nudges, the slower subscribed cadence, the count cadence and the dog-id cadence), defaulting ON, so a rehearsal can A/B a single change and a regression can be turned off by a flag flip plus Deploy myK9Show rather than a revert PR. Phase 4's migration carries a written rollback (the previous view and function definitions, copied from the latest migration that defines them). [ADDED]

**What reaches production.** The rehearsal builds `main` on the runners, so it measures merged code before it is deployed. Production changes only on Deploy myK9Show, which the owner runs; a migration reaches the database only on `supabase db push`, which the owner requests. Each phase's PR says which of the two it needs. [ADDED]

### Phase 1: make the harness measure the real app

- [ ] Virtual readers replay the app's actual sync pass by importing the replication adapters' query builders, not hand-written URLs. Same tables, count queries, scope, in-flight guard and cadence. Replace the fidelity test's hand-written URL with an import of the adapter.
- [ ] Add a `sessions` input to the `Manual G9 Load Rehearsal` workflow (for example 50 / 100 / 200 / 358), keeping the role mix proportional.
- [ ] Record per run: `pg_postmaster_start_time()` before and after (a restart fails the run), Supavisor checkout errors, and `PGRST003` counts from the logs.
- [ ] Tests: unit tests on the adapter-backed virtual reader and the session-count split; one smoke run at `sessions=50`. The smoke run is a shared-system write under the rules above, so it needs the owner's request and gate approval like any rehearsal. [EXPANDED]
- [ ] Keep the virtual reader's in-flight guard: a tick that starts while the previous sync is still running is skipped and counted, so a slow database cannot make the harness send more than the app would. The README's 140 s syncs against a 60 s cadence came from the missing guard. [ADDED]
- [ ] Make the platform sampler survive an outage: sample over the admin pooler on port 6543 with a 5 s statement timeout and a retry, and report coverage as a first-class number so a low-coverage run reads "no verdict" rather than "81% CPU". [ADDED]

### Phase 2: baseline the ceiling on today's code

- [ ] Step-down runs at 100, then 200, on unchanged app code. Stop at the first failing size. This gives the "before" number for every later change.
- [ ] If 100 fails, step down to 50, then 25. The first passing size is the baseline; "below 25" means the problem is not load and the run is investigated as an incident first. [ADDED]
- [ ] Each size is one run. A second run at the same size happens only when the first is "no verdict" (sampler coverage or generator evidence), never to get a better number. [ADDED]

### Phase 3: client changes, the largest and cheapest wins

No schema change. Ordered by expected load removed per device.

1. [ ] **Nudges sync only what changed.** Route `show:{id}:changes` through the scoped at-show sync, never a full 12-table pass. Add a minimum gap (for example 5 s) and 0–3 s random jitter so devices in one show don't stampede together.
2. [ ] **A slower poll while realtime is up.** While the show channel is `SUBSCRIBED`, stretch the 60 s pass to 3–5 min with jitter. Keep 60 s when offline or unsubscribed, as the offline-first fallback.
3. [ ] **Run the per-table count query less often, not never.** [EXPANDED] The count is not decoration: `syncReplicatedTable.ts:154-185` compares it with the local rows to detect a partial replica (MYK9-752) and a server-side hard delete (MYK9-775), and triggers the full sync that repairs both. Removing it regresses deletion detection by up to 24 h. Instead run it on every Nth pass (for example every 10 minutes, and always on the first pass after a reconnect), and always when a delta returns a full page. Pin in a test that a hard delete on the server is still reflected on the device within the new interval, and that a pending local create still never counts (MYK9-752).
4. [ ] **Scan dog ids at most hourly**, or only on a count mismatch (`ReplicatedDogsTable.ts:293`).
5. [ ] **Notification monitor:** enable it only with a non-empty watch set, drop `refetchInterval` while realtime is subscribed, and build its snapshot from the replica where possible.
6. [ ] **`get_account_today_entries`:** a longer `staleTime`, and invalidation coalesced to at most every 30 s.
7. [ ] **RBAC and identity:** stop clearing the cache before the 5 min refresh, refresh on focus instead of a timer, and drop identity's `refetchInterval`.
8. [ ] **An `updated_at` delta for armbands**, instead of re-downloading on every sync.

Offline-first guard: every change keeps the replica correct with realtime down. The fallback cadence is only slower, never removed. Read `docs/INTENT.md` for ringside before touching the at-show paths.

Edge cases each change must handle: [ADDED]

- **Channel state flaps.** A device whose realtime channel drops and rejoins must fall back to the 60 s cadence within one tick of the drop, and must run one immediate pass on rejoin (it may have missed nudges). Test with a mocked channel status sequence `SUBSCRIBED → CLOSED → SUBSCRIBED`.
- **A device with several shows.** A secretary with two shows open gets nudges from both; the minimum gap is per show, the jitter is per device.
- **Tab hidden, then shown.** `syncPassScheduler.ts` already skips hidden tabs; a tab shown after a long hide runs one pass immediately, not a burst for every skipped tick.
- **The 60 s replication buffer** (`parseUpdatedAt.ts:34` holds `since` back by 60 s) still applies with a slower cadence, so a longer interval never widens a gap in the delta.
- **Clock skew.** Jitter and gaps are measured on the device's monotonic clock, never compared with server timestamps.
- **The 24 h forced full sync** keeps its current schedule under every cadence change.

Failure modes: a sync that throws keeps the old cadence (no backoff doubling, which the package has constants for but never used); a nudge that arrives during an in-flight pass marks the pass dirty and runs one more pass after it, not a parallel one. [ADDED]

Tests:

- unit tests for scheduler gap and jitter, subscribed-versus-fallback cadence, the count cadence rule, and the edge cases above;
- the replication suites green, run shuffled six times or more, since the scheduler carries module-scope state;
- one e2e at-show journey, and the existing offline e2e (airplane mode) to show the fallback still syncs;
- then a Phase 2-sized rehearsal comparing requests per device per minute against the baseline, with each change's flag toggled in turn if the aggregate did not move as expected.

### Phase 4: database, for whatever still costs too much

1. [ ] **A changed-since check for the entry-results view.** Each empty poll currently computes the whole view. Give the client a cheap "has anything in this show changed since T" question to ask before it queries the view. [EXPANDED] Two designs, in order of preference:
   - **Preferred: a `SECURITY DEFINER` function `entry_results_changed_since(show_id, since)`** that returns a boolean from `max(updated_at)` on each of the view's feed tables, scoped by show, through indexes on `(show_id, updated_at)` where they are missing. Eight index lookups, no new table, no trigger, nothing on the write path. It must restate the caller's show access (memory: Definer RPC Drops RLS), be `REVOKE`d from `anon` and `PUBLIC`, and be called only by the authenticated replication path.
   - **Fallback only if the function is not cheap enough: a per-show watermark row.** Not a statement-level trigger that `UPDATE`s one row per show on every write: 55 ringside scorers writing `entries` for the same show would serialise on that row, which is the OCC conflict storm (memory: Ringside OCC Conflict Storm) moved into the database. If this design is needed, the bump must never be a row lock in the scoring transaction (for example `pg_notify` consumed by a cron, or an `INSERT`-only log with a periodic collapse).
   - **Leak budget, stated:** either design tells an authenticated caller "something in this show changed after T". It must not tell them _what_: no row ids, no counts, no distinction between a released and an unreleased score. Results visibility still comes only from the view. This is **security-sensitive**: the view enforces release and visibility, so the change needs the `independent` review floor (Codex) and behavioral SQL tests showing results stay hidden until release (memory: Public Results Release Gate) and that the new function returns the same answer for an exhibitor who can and cannot see a given entry.
2. [ ] **Cut the view's own cost:** collapse the 518 per-entry runs of the profile-tie aggregate into one grouped join, and measure planning time (20–40 ms per call, re-planned on every request under transaction pooling). Copy from the LATEST migration that defines the view (`20261014214300_myk9_1162_held_entries.sql` as of 2026-10-20), carry the inline `WITH (security_invoker = …)` clause, replace the star with the explicit column list the live view returns, and `CREATE OR REPLACE` rather than `DROP` so the ACL survives (memory: `replace-view-reloptions`, `select-star-reexpands`). [EXPANDED]
3. [ ] **Realtime WAL cost:** the top statement since the restart is Supabase's own `realtime.list_changes` poll (37,560 calls, 393 s). Its cost scales with WAL volume and with the number of subscriptions, not with our query shapes. Measure it per run; reduce it only by writing less (the `ringside_containment_sample` cron at 78 ms mean, and any table published in `supabase_realtime` that no client subscribes to: today `shows`, `show_announcements`, `show_messages`). Remove a table from the publication only after `realtime.subscription` shows no subscribers for it across a show day (memory: Realtime Publication). [EXPANDED]

Migration mechanics (memory: DB Push & Verify): [ADDED]

- One migration per PR, version picked against `origin/main` and the linked database with `pnpm qa:migrations:guard`, pushed only on the owner's request after the merge.
- Every new function: `REVOKE ALL … FROM PUBLIC, anon` and an explicit `GRANT EXECUTE … TO authenticated`; verify with `pg_proc.proacl` after the push, not from the migration text.
- Any new index is `CREATE INDEX CONCURRENTLY` in its own migration, since `entries` is written during shows.
- Regenerate `database.types.ts` in the same PR or the next one.
- Rollback for each migration is written in its header: the previous definition, copied, not re-derived.

Tests: behavioral SQL tests for every view and function change (visibility parity before and after, with a mutation check that a deliberately wrong visibility default fails a named assertion), `pnpm qa:sql-local`, the EXPLAIN timings above re-measured as the same users and recorded, and a ringside write-contention check: 55 concurrent `ringside_update_entry` calls on one show against the local stack, before and after, with the `40001` count unchanged. [EXPANDED]

### Phase 5: find the ceiling

- [ ] Step up from the Phase 2 baseline (100 → 200 → 358) on the changed code. Record the largest size that passes G9 with no Postgres restart.
- [ ] Record the ceiling on MYK9-126 as "N connected devices (R ringside) on a show of M entries, Micro".
- [ ] Only if a valid run shows Micro is still the limit after Phases 3–4, write up the compute-upgrade option for the owner. Upgrading is the owner's decision.
- [ ] Name the next bottleneck in the ceiling note: pool checkouts (`ECHECKOUTTIMEOUT`), statement timeouts (`57014`), memory (a restart), or CPU, from the run's own evidence, so an upgrade decision is about the right resource. [ADDED]
- [ ] Decide whether the harness joins a schedule (the MYK9-109 "Done when" criterion). Recommendation: a monthly owner-approved run at the recorded ceiling, never automatic, because every run is a shared-system write. [ADDED]

## Open questions [ADDED]

- **Why Postgres restarted at 08:38:05.** The logs carry no cause. Micro has 1 GB of memory and `work_mem` is 3.5 MB per sort with 60 connections, so an out-of-memory kill is the likely cause but unproven. Phase 2's first run records `pg_stat_activity` and memory from the sampler at 5 s intervals so the next restart has a cause.
- **Whether the 60 s pass should be scoped at all.** `App.tsx:221` mounts the provider with no `syncScopeId`. Scoping it to the shows a device is attending would cut more than any cadence change, but it changes what is on the device offline (memory: Replication Scopes & Traps: account surfaces never seed show replicas). Out of scope here; filed as a follow-up on MYK9-126 once Phase 3 numbers are in.

## Non-goals

- No change to G9 thresholds, or to the mix of roles within a run.
- No compute upgrade inside this plan.
- No removal of the offline fallback poll.
