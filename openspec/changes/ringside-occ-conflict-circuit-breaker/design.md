# Design: ringside-occ-conflict-circuit-breaker

## Context

`ringside_update_entry(p_entry_id, p_fields, p_expected_version)` is the single OCC-guarded write path for ringside scoring (SECURITY DEFINER, latest re-emit in `20260710160000`). Its current order of work per call:

1. Load entry context (`show_id`, `class_id`, `version`) — one PK lookup.
2. Resolve caller person (`people` lookup).
3. Authorization tiers — `is_site_admin()` + `is_trial_secretary()` + `is_club_admin()` + `judge_assignments` EXISTS + `user_roles ⋈ roles` EXISTS + JWT claim parsing + generation-revocation check (~6–8 indexed queries).
4. Allow-list filtering, then a **dynamically built** `UPDATE ... WHERE id = $1 AND version = $2` (parse/plan per call).
5. On 0 rows: re-read version, `RAISE 40001` with the authoritative version in DETAIL (the `20260625190000` self-heal contract).

During the 2026-07-11 storm, every one of ~70 calls/sec paid steps 1–5 in full before failing, and 15–18 concurrent PostgREST workers stacked on `LWLock:LockManager`. The client's `expected_version` (7) was permanently behind the server (8) — a state only reachable by clients that ignore the DETAIL (stale PWA bundles), which the server must assume exist forever.

Emergency state to unwind: `EXECUTE` is currently revoked from `authenticated` on the live DB (out-of-band, not in a migration).

Health pipeline (Layer C home): `system_health_probe()` (SECURITY DEFINER, `20260704130000`) returns raw facts; the ok/warn/fail mapping lives in `apps/myk9show/supabase/functions/_shared/systemHealthChecks.ts`, consumed by the `cron-health-check` edge function which INSERTs into `system_health_snapshots` daily.

## Goals / Non-Goals

**Goals:**

- A stale/hostile client retrying a doomed OCC write costs the server no more than a single PK lookup + exception — CPU exhaustion becomes structurally impossible from this path.
- Conflicts are counted in a way that survives the transaction abort, so storms are observable.
- `/admin/health` shows a `ringside_conflicts` check so the operator sees a storm on the next daily snapshot instead of via a provider CPU email.
- Current clients' self-heal contract (errcode `40001`, DETAIL = authoritative version) is preserved byte-for-byte.
- The `authenticated` EXECUTE grant is restored in the same migration.
- New client bundles cannot loop forever even if a future regression reintroduces a stale-token state (bounded retries + parking).

**Non-Goals:**

- A stateful per-(entry, caller) trip/cooldown table. The conflict path ends in `RAISE`, which aborts the transaction; Postgres has no autonomous transactions, so no table write from that path can persist. See D2 for alternatives considered and rejected.
- Real-time (sub-daily) storm alerting. The daily health check is the v1 detection surface; a live storm is now cheap enough to wait for it.
- Rate-limiting other RPCs or generic API throttling (gateway-level; not available per-RPC on Supabase).
- Nightly-QA process hygiene (single-flight lock, budget kill) — tracked as ops follow-up in `OPEN-TODOS.md`, not app code in this change.
- PWA service-worker cache-lifetime changes.
- **Full-row (non-RPC) OCC mutation parking.** The Layer B lifetime cap + parking is scoped to RPC/delta mutations (`mutation.rpc` set) — the storm vector. Direct full-row UPDATEs (shows/clubs/dogs) are owned end-to-end by the pre-existing full-row conflict-resolution subsystem (conflict surfacing, `reconcileDirtyRow`, same-field "Keep mine"/"Take theirs", `rebuildUpdatePayload`), all of which operate exclusively on `PENDING_MUTATIONS`. Parking a full-row mutation into `FAILED_MUTATIONS` severs it from that resolver, and advancing its whole-row token would clobber another client's field change — the exact hazard `rebuildUpdatePayload` exists to prevent (and which was previously built-then-removed for unreliability, per the orphan-repair history). Full-row OCC conflicts have never stormed (both 2026-07-11 and 2026-06-25 were RPC). Unifying full-row parking with the resolver (so a capped full-row conflict also reaches a terminal, resolver-aware review state instead of throttled backoff) is a separate, delicate change deferred to its own proposal.

## Decisions

**D1 — Early conflict rejection, placed after the entry fetch, before all auth resolution and dynamic SQL.**
The entry row (with `version`) is already loaded in step 1, so the check is free: if `p_expected_version IS NOT NULL AND v_current_version IS DISTINCT FROM p_expected_version`, count + `RAISE 40001` with DETAIL immediately. Steps 2–4 never run for a doomed call.
_Disclosure trade-off:_ any authenticated caller who knows an entry UUID can now learn its integer `version` without passing ringside authz. Accepted: the function already leaks entry _existence_ pre-auth (`P0002` at step 1 today), UUIDs are unguessable, and a bare version integer is not meaningful data. The late conflict path (0-row UPDATE → re-read → RAISE) is kept unchanged as the concurrent-race handler (TOCTOU between precheck and UPDATE).
_Alternative rejected:_ checking after claim-parsing but before table-based auth — saves the disclosure but keeps `people`/`user_roles`/`judge_assignments` lookups out of only some paths and complicates the function for negligible gain.

**D2 — "Breaker" = cost collapse + observability, not a stateful trip.**
Alternatives considered for a persistent per-(entry, caller) trip:

- _Counter table upserted in the conflict path_ — rolls back with the `RAISE`; dead on arrival.
- _dblink loopback_ (autonomous-transaction emulation) — adds a connection dance and infra fragility (supavisor/pooler coupling) to the hottest write path; rejected.
- _Changing the conflict path to a committed `200` + jsonb return_ — persists the counter but breaks the one contract stale bundles do understand (40001 + DETAIL); a stale client interpreting a conflict as success risks silently dropping a judge's score, violating `offline-scoring-durability`; rejected.
  With D1, an "open breaker" and a cheap rejection are economically identical — the trip state buys nothing but complexity.

**D3 — `ringside_conflict_seq` sequence as the rollback-proof counter.**
`nextval()` is non-transactional: it advances even when the surrounding transaction aborts. Both conflict paths (precheck and late race) call `PERFORM nextval('public.ringside_conflict_seq')` immediately before `RAISE`. Cost: one shared-memory increment. The sequence is touched only inside the SECURITY DEFINER function and read only by `system_health_probe` — **no client grants** (satisfies the GRANT-audit rule by deliberate omission).
_Alternative rejected:_ `pg_stat_database.xact_rollback` — captures all rollbacks platform-wide, not attributable to this path.

**D4 — Health check computes a delta against the previous snapshot.**
`system_health_probe()` gains `ringside_conflict_counter` (the sequence's current value). `systemHealthChecks.ts` emits a `ringside_conflicts` check whose `detail` stores the raw counter; status derives from the delta vs the previous snapshot's stored value: `ok` < 1,000/day, `warn` ≥ 1,000, `fail` ≥ 10,000 (the incident ran ~250k/hour — either threshold catches a real storm; legitimate double-scoring conflicts are a handful per show day). First run (no baseline) and counter regression (sequence reset/restore) report `ok` with an explanatory note, never a false `fail`. Requires a `cron-health-check` redeploy (`--project-ref sojmvhhwsjxmfistvzbe`).

**D5 — Client bounded retries + parking (Layer B).**
The post-#963 upload path rebases on conflict DETAIL, so a healthy client converges in ≤2 attempts. Policy: per-sync-cycle cap of 5 attempts with exponential backoff + jitter (1s → 30s), plus a **persisted** `attempts_total` on the queued IndexedDB mutation (hard cap 50 across reloads). Exhaustion parks the mutation: excluded from auto-replay, surfaced in the ringside UI as needs-review with retry/discard actions — satisfying `offline-scoring-durability`'s no-silent-drop rule while ending infinite replay. Parking state lives on the mutation record (new field), so it survives reload like the mutation itself.

**D6 — Single migration, grant restored in it.**
One migration re-emits the full function (verbatim from `20260710160000` §3 except the added precheck/counter), creates the sequence, re-emits `system_health_probe` with the new fact, and ends with the standard REVOKE/GRANT block (`authenticated` only). Pushing it converges the live DB out of the emergency-REVOKE state. Rollback = re-emit the `20260710160000` definitions (sequence can remain; it is inert).

## Risks / Trade-offs

- [Version disclosure to authenticated non-ringside callers] → Accepted per D1; documented in the migration comment; UUIDs unguessable; existence already disclosed today.
- [Storm still generates log noise + ~70 rps of cheap errors] → By design; detection moves to the daily `ringside_conflicts` check; revisit real-time alerting only if noise ever matters.
- [Threshold miscalibration (false warn on a busy multi-judge show)] → Thresholds are 2–3 orders of magnitude above legitimate conflict volume; `warn` is advisory, not paging.
- [Delta breaks if snapshots skip days or the previous snapshot lacks the detail] → Delta logic treats missing baseline as `ok` + note (same pattern as the check-runner's self-referential bootstrap).
- [Migration re-emits a security-critical function] → Copy verbatim from `20260710160000` and diff the two definitions in review; `migration-auditor` pass required; behavioral psql proof of ALLOW/DENY parity after push.
- [Parked mutations confuse a judge mid-class] → Parking is a last resort after 50 persisted attempts; UI copy frames it as "needs review", with the score preserved and re-submittable.

## Migration Plan

1. Land the migration + client + edge-function changes via PR (CI + review + Codex second opinion — security-critical RPC).
2. `supabase db push --project-ref sojmvhhwsjxmfistvzbe` (operator-confirmed) — restores scoring behind protection in the same push.
3. Redeploy `cron-health-check` (`--project-ref` explicit per LESSONS).
4. Live verification: rolled-back psql txn proves (a) authorized write succeeds, (b) stale `expected_version` raises 40001 + DETAIL _without_ executing auth lookups (verify via `EXPLAIN`/timing or by observing sequence increment), (c) `authenticated` EXECUTE restored, `anon` still revoked; then one live conflict → sequence advanced; next health snapshot shows the new check.
5. Rollback: follow-up migration re-emitting the `20260710160000` function; client/edge changes are independently revertable.

## Open Questions

- None blocking. Real-time storm alerting (operator_alerts row from a threshold watcher) deliberately deferred until the daily check proves insufficient.
