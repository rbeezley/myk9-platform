# Proposal: ringside-occ-conflict-circuit-breaker

## Why

On 2026-07-11 a single stale-bundle client authenticated as `e2e-secretary` looped `ringside_update_entry(entry, fields, expected_version=7)` against one demo entry at ~70 calls/sec for 12+ hours (accumulating 1,841 auth sessions), pegging staging Postgres above 80% CPU and driving platform-wide 503s. The server already returns the authoritative version in the conflict DETAIL (migration `20260625190000`) so _current_ clients self-heal, but the platform is a PWA: stale cached bundles without that logic persist on real devices indefinitely. The same incident occurred 2026-06-25 (PR #961/#963 addressed the client and sync layers); this recurrence proves the guarantee must live server-side, because the server cannot trust any client to run fixed code. Real exhibitors/stewards on venue wifi will reproduce this in production. Emergency mitigation currently in place: `EXECUTE` on `ringside_update_entry` is revoked from `authenticated` — this change must restore the grant behind real protection.

## What Changes

- **Server (Layer A — the guarantee):**
  - Reorder `ringside_update_entry` so the version-conflict precheck runs _before_ role/claim/allow-list resolution and the dynamic UPDATE — a doomed retry becomes a single-PK-lookup rejection instead of a ~6–8-query auth walk plus dynamic SQL. This collapses a storm's cost to log noise (the "open breaker" state, achieved by making every conflict trivially cheap rather than by stateful tripping).
  - Count every conflict in a rollback-proof `ringside_conflict_seq` sequence (`nextval` survives the transaction abort that the conflict `RAISE` causes) so storms are observable server-side.
  - Explicit non-goal: a stateful per-(entry, caller) trip table — Postgres cannot persist table writes from an aborted transaction (no autonomous transactions), and the alternatives (dblink loopback, changing the conflict contract to a committed 200 response) are riskier than the cost-collapse for stale clients that only understand the existing 40001+DETAIL contract.
  - Re-grant `EXECUTE ... TO authenticated` in the same migration, restoring ringside scoring behind the protection.
- **Client (Layer B — defense in depth):**
  - Bound OCC retries (cap + exponential backoff with jitter), with the attempt counter persisted on the queued mutation in IndexedDB so replays across reloads cannot loop forever.
  - A mutation that exhausts its attempts is parked with a visible needs-review state — never silently dropped, never silently retried forever.
- **Operator (Layer C — see it before the hosting provider emails):**
  - The daily health check-runner gains a `ringside_conflicts` check that reads the conflict-counter delta since the previous snapshot, so `/admin/health` surfaces a storm signature as amber/red.

## Capabilities

### New Capabilities

- `ringside-occ-conflict-containment`: server-side containment of optimistic-concurrency conflict storms on `ringside_update_entry` — early cheap conflict rejection (before auth resolution and dynamic SQL, DETAIL contract preserved), a rollback-proof conflict counter, and the restored `authenticated` EXECUTE grant.

### Modified Capabilities

- `offline-scoring-durability`: add a bounded-retry requirement — queued scoring mutations carry a persisted attempt count, back off exponentially, and park (visibly, recoverably) after the cap, instead of retrying identical conflicting writes indefinitely.
- `admin-system-health`: the scheduled check-runner gains a `ringside_conflicts` check derived from the conflict-counter delta so conflict storms appear on the health board.

## Impact

- **Database:** one migration — re-emits `ringside_update_entry` (early conflict rejection + counter), creates `ringside_conflict_seq` (used only inside the SECURITY DEFINER function — no client grants), extends `system_health_probe`, re-grants EXECUTE to `authenticated`.
- **Edge functions:** none directly (`cron-health-check` reads via the existing `system_health_probe` RPC, which the migration extends).
- **Client:** `@myk9/replication` / ringside scoring upload path — retry policy + parked-mutation state; UI surface for the parked state in the ringside scoresheet.
- **Ops:** restores staging ringside scoring (currently disabled by the emergency REVOKE); `/admin/health` gains one check row.
- **Incident record:** logged in `docs/qa/findings.md`; nightly-QA single-flight/budget-kill hygiene is tracked separately (ops/tooling, not app code).
