# Ringside OCC Admission Control — Design (MYK9-115)

**Date:** 2026-07-30
**Issue:** [MYK9-115](https://linear.app/myk9-platform/issue/MYK9-115/prevent-ringside-occ-conflict-storms-from-causing-a-production-scoring)
**Status:** Approved design, pre-implementation

## Problem

A stale or wedged ringside client can loop `ringside_update_entry` with an
obsolete `expected_version` indefinitely. The 2026-07-11 containment
(migration `20260711150000`) made each doomed call cheap (~3 ms: one PK
lookup + `RAISE 40001`) and counts conflicts via the rollback-proof
`ringside_conflict_seq`, but nothing bounds the **rate**. Cheap rejection
paradoxically raised the storm ceiling: the 2026-07-30 G9 teardown storm ran
at ~2,355 rollbacks/sec (vs 70/sec in the 2026-07-11 incident) and held
Supabase Micro at ~97% CPU until a manual project restart. The only current
emergency lever — revoking `authenticated` EXECUTE — also disables all
ringside scoring and cannot be the launch state.

## Central design constraint

A doomed call's `RAISE` aborts its transaction, **rolling back any table
write made during that call**. A per-caller "count conflicts in a table,
block at N" rate limiter is therefore structurally impossible in vanilla
Postgres. The sequence survives the abort but cannot be per-caller. Every
viable design splits into: a cheap global signal inside the call
(`ringside_conflict_seq`, already deployed), plus an actor **outside** the
failing transactions (pg_cron) that persists the containment decision, plus
in-call backpressure that works even against clients that predate this code.

## Decisions (user-approved 2026-07-30)

1. **Blast radius: contain conflicts only.** Tripped state changes behavior
   only for _conflicting_ calls (distinguishable error + short server-side
   delay). Version-correct writes from healthy judges keep working
   untouched. Scoring is never globally paused by the breaker.
2. **Operator path: health board + rearm RPC.** Containment state surfaces
   as a row on `/admin/health`; rearm is a site-admin-gated SECURITY DEFINER
   RPC invoked from the admin UI with a confirm dialog. No dedicated
   containment panel.
3. **Approach: pg_cron sampler + persisted state row** (over stateless
   in-function detection, which cannot persist a trip decision and whose
   sampling window goes stale; and over out-of-Postgres proxies, which do
   not exist on Supabase Micro). Chosen for testability (state transitions
   are rows the behavioral SQL harness can assert), operator visibility, and
   the no-DDL-churn rearm requirement.

Accepted limitation: containment is global, not per-caller (see constraint
above). The conflicts-only blast radius absorbs this: a healthy judge's
worst case is one parked sync after a legitimate TOCTOU race, resumed by the
client's next probe.

## Architecture

```
conflict → nextval(ringside_conflict_seq)                  [in doomed txn, survives abort]
pg_cron (1/min) → ringside_containment_sample()            [outside doomed txns]
    delta > threshold → state := contained + audit row
ringside_update_entry precheck path:
    read state row (1 PK read on 1-row table)
    contained + conflicting call → pg_sleep(backpressure) + RAISE 'RS429'
    version-correct call         → normal path, always
client (RS429) → pause outbox 60s (retain scores, advance OCC token, banner)
    → head-of-queue retry IS the probe → resume on first non-RS429 outcome
operator → /admin/health containment row → rearm RPC (audited, idempotent)
```

Trip reaction time is up to ~60 s (cron cadence) — acceptable against
incidents that historically ran 12+ hours, while the in-call sleep bounds
damage within the reaction window.

## Database objects

### `public.ringside_containment` (single row)

| Column                                             | Purpose                                         |
| -------------------------------------------------- | ----------------------------------------------- |
| `state`                                            | `'armed'` \| `'contained'` (CHECK)              |
| `trip_conflicts_per_minute`                        | trip threshold; provisional 300                 |
| `backpressure_ms`                                  | in-call sleep while contained; default 250      |
| `calibrated`                                       | `false` until a G9 run calibrates the threshold |
| `last_seq`, `last_sample_at`                       | sampler cursor                                  |
| `tripped_at`, `trip_conflict_delta`, `trip_reason` | trip metadata                                   |

Single-row enforced (e.g. `id boolean PRIMARY KEY DEFAULT true CHECK (id)`).
**Grants: none to clients — explicit `REVOKE ALL` from `anon` and
`authenticated`** (this project's default-privileges trap makes the revoke
mandatory, not optional). Read paths are SECURITY DEFINER only.

### `public.ringside_containment_audit` (append-only)

`event` (`'trip'` \| `'rearm'`), `occurred_at`, `actor` (auth uid; NULL for
cron), `conflict_delta`, `reason`. Same grant posture as the state table.

### `public.ringside_containment_sample()` — pg_cron minutely

SECURITY DEFINER; EXECUTE for `service_role`/cron only. Reads the sequence,
computes delta vs cursor, advances cursor, and on `delta >
trip_conflicts_per_minute` while `armed`: sets `contained`, records trip
metadata, inserts audit row. Runs outside any doomed transaction, which is
what makes the persisted flag possible.

### `ringside_update_entry` changes (precheck path only)

After the existing step-1b conflict detection and sequence bump: read the
state row; if `contained`, `pg_sleep(backpressure_ms / 1000.0)` then raise
with **custom SQLSTATE `RS429`**, message
`'Ringside scoring contained; retries paused'`, DETAIL still carrying the
authoritative current version (paused clients keep rebasing their OCC token
— rebuilding from the 20260711150000 text per the LESSONS rule about copying
the latest definition), HINT carrying `retry_after=60`. The sleep holds no
row locks (precheck is a plain MVCC read) — only its own connection, which
is the mechanism: a spinning stale bundle drops from ~300 calls/sec/conn to
~4/sec/conn without needing to understand the new error. All non-conflict
behavior, the 40001 contract while armed, and the TOCTOU late path are
unchanged.

### `public.ringside_containment_rearm(p_reason text)`

SECURITY DEFINER; gated internally on `is_site_admin()`. Idempotent:
rearming an armed breaker returns success without side effects and writes
no audit row. On rearm: `state :=
'armed'`, trip metadata cleared, **sampler cursor reset to the current
sequence value** (prevents instant re-trip from the stale window), audit row
with actor + reason. EXECUTE granted to `authenticated` (internal gate),
revoked from `anon`/PUBLIC.

### `system_health_probe`

Adds a `ringside_containment` object: state, tripped_at, latest delta/rate,
calibrated flag. Runner maps `contained` → FAIL row on `/admin/health`.

## Client behavior (`@myk9/replication` + at-show UI)

- `mutation-occ`: add `isContainmentError(error)` → `code === 'RS429'`.
- MutationManager: a containment error is neither retryable-now nor
  dead-letter. The mutation stays queued untouched; the OCC token still
  advances from DETAIL; a store-level `containmentUntil = now + 60s
(jittered)` pauses ringside-entry uploads.
- **The head-of-queue retry is the probe.** When the window expires, the
  next natural upload attempt tests the water; success or any non-RS429
  error clears the pause. No new endpoint, no new poller.
- At-show surfaces read the flag and show a banner: scores are saved on this
  device and will sync when service resumes (wording to respect
  `docs/INTENT.md` for the judge role: calm, not alarming).
- Old bundles predating this code see only slow 40001s — backpressure works
  on them by construction.

## Operator surface

- `/admin/health`: containment row via the existing `system_health_snapshots`
  pipeline; `contained` renders FAIL with tripped_at + delta.
- Rearm button on that row (site-admin RBAC): reason input + confirm dialog,
  per-mount double-submit latch (pattern from #1343), calls the rearm RPC.
- Runbook update: diagnose the wedged device (PostgREST logs: caller
  identity/user-agent), remove the device, rearm, watch the next sampler
  tick; emergency `REVOKE` documented as last resort only.

## Testing

- **DB behavioral tests** (`supabase/tests/ringside_containment_test.sql`,
  added to `scripts/qa/run-behavioral-sql-tests.sh` AND its vitest
  allowlist pin): sampler trips at threshold and writes audit; contained +
  conflicting call → RS429 with version in DETAIL; contained +
  version-correct call succeeds; armed behavior unchanged (40001); rearm is
  idempotent, resets cursor, writes audit; non-admin rearm denied; grant
  posture asserted (`has_table_privilege` / `has_function_privilege`).
- **Client tests** (`packages/replication`): RS429 pauses uploads, retains
  payloads, advances token from DETAIL, resumes after the window, no loss or
  duplication on reconcile.
- **Live verification** per the issue: controlled remote smoke, then the G9
  rehearsal with CPU/connections/conflict-rate/queue-depth/recovery
  evidence.

## Calibration

Ships with `trip_conflicts_per_minute = 300` and `calibrated = false`.
Margins from existing evidence: observed legitimate peak ≈ 11 conflicts/min
(107 over a 10-minute G9 run); historic storm floor 4,200/min (70/sec),
latest storm ~141,000/min. The provisional value sits ~27× above legit and
~14× below the storm floor. The next approved G9 run supplies calibration
evidence; committing the final threshold and flipping `calibrated = true` is
a config UPDATE, not a migration.

## Out of scope

- Per-caller attribution/blocking (structurally impossible in-database; the
  runbook's log-based device identification covers it operationally).
- Auto-rearm (the issue requires an explicit operator decision).
- Any change to the armed-state 40001 contract, retry cadence, or the
  emergency REVOKE lever.
- Compute upgrades (explicit non-goal in the issue).

## Coordination notes

- A concurrent session (MYK9-93 grant-drift audit) may add migrations:
  re-check timestamps and remote `schema_migrations` immediately before
  creating migration files.
- Per the issue's safety gate, grants on `ringside_update_entry` change only
  inside an approved window; this design intentionally leaves the current
  grant state untouched.
