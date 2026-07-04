## Why

The site-admin System Health board (`/admin/health`, change `admin-system-health-board`) reads the
latest row from `public.system_health_snapshots`, but **nothing writes to that table yet** — so the
board sits in its empty/stale state and always renders `fail`. This change ships the companion
*check-runner* that the board's design and the go-live runbook Phase 5 both explicitly defer: a daily
server-side job that runs the recurring, machine-checkable parts of the launch-morning parity
checklist and `INSERT`s one snapshot row.

This directly supports **fall 2026 launch readiness**: instead of a human re-running
`docs/operations/go-live-runbook.md` Phase 5 by hand every launch morning, the automated checks land
in Postgres and the operator opens one page. A missing or stale run is itself a signal — the board's
~26h staleness rule turns a broken cron into a loud `fail`, which is only meaningful once something
is actually writing runs.

## What Changes

- **New `public.system_health_probe()`** — a `SECURITY DEFINER` SQL function (executable by
  `service_role` only) that gathers the read-only facts an edge function cannot reach through
  PostgREST: the scheduled `cron.job` rows and their latest `cron.job_run_details`, plus the newest
  applied `supabase_migrations.schema_migrations` version. Returns a single JSON facts object; runs
  no checks itself.
- **New edge function `cron-health-check`** — secret-gated (`x-function-secret`, never JWT) like
  `cron-process-payouts`. Calls the probe as `service_role`, converts the raw facts into the snapshot
  contract via a pure module, and `INSERT`s one row into `system_health_snapshots`. On a probe error
  it still writes a `fail` snapshot so the failure is visible on the board rather than silent.
- **New pure module `_shared/systemHealthChecks.ts`** — `buildSnapshot(facts, opts)` maps facts to
  the `checks` array (`{key,label,status,detail,checked_at}`) and computes `overall_status` as the
  **worst** of the individual check statuses. Deno-free so it runs under the app's vitest, like the
  existing `_shared/payoutCalc.ts`.
- **New Vault-backed cron migration** — schedules `daily-health-check` at `07:00 UTC` (once daily) to
  POST the function, mirroring the payout cron's Vault-secret pattern. `< 26h` cadence so the board
  never false-flags a healthy run as stale.
- **v1 checks (cheap, read-only):** `payout_cron` (runbook 5.4 — the nightly payout job is scheduled
  and its last run succeeded recently), `background_jobs` (every other scheduled cron job's last run
  is healthy), and `migrations` (runbook 5.2 proxy — newest applied migration version; DB reachable).

## Capabilities

### Modified Capabilities
- `admin-system-health`: adds the writer half of the capability — a server-side check-runner that
  populates the `system_health_snapshots` store the board already reads. No change to the read
  surface, the table schema, or its RLS.

## Impact

- **Duplication check (required by config):** Does this duplicate an existing surface? **No.** This is
  the deferred *writer* for a store that already exists; the board (`admin-system-health-board`) built
  the reader and the table and named this the companion. There is no other job writing health
  snapshots. The closest sibling, `cron-process-payouts`, does a different job (money transfer) — we
  reuse its cron + secret + service-role *patterns*, not its surface.
- **Database:** two new migrations (probe function; Vault-backed cron schedule). No new table — the
  store ships in `admin-system-health-board` (migration `20260704120000`); this change's migrations
  are timestamped after it and the PR declares that ordering.
- **Edge functions (`apps/myk9show/supabase/functions`):** one new function + one new pure `_shared`
  module (co-located with `cron-process-payouts`, same project/deploy target).
- **Offline-first:** none. This is admin monitoring of server-authoritative data, written by
  `service_role` outside the replication path by design.
- **Out of scope:** automating runbook 5.8 (auth-email *send* — rate-limit-sensitive, deferred), full
  local↔remote migration parity (needs the repo's migration list, a CI concern — the `migrations`
  check reports newest-applied only), and any merge with the planned `operator_alerts` table (stay
  the same family, do not converge now).
