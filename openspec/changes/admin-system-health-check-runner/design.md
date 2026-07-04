## Context

The board change (`admin-system-health-board`, PR #1123) built the read surface and the durable store
`public.system_health_snapshots` with this writer contract, enforced by the table CHECK plus the
page's parser (`apps/myk9show/src/features/admin-system-health/systemHealthSelectors.ts`):

- one row per run: `source` (text), `overall_status ∈ {ok,warn,fail}`, `checks` jsonb = array of
  `{key,label,status,detail,checked_at}`, optional `run_duration_ms` (int);
- `overall_status` = the worst of the per-check statuses;
- runs at least daily — the board treats any snapshot older than `STALE_AFTER_MS` (~26h) as `fail`;
- written as `service_role` (has the INSERT grant, bypasses RLS); never `anon`.

Verified against the codebase:

- `system_health_snapshots` ships in `admin-system-health-board` migration `20260704120000`; it is
  **not** on `main` yet (PR #1123 open). This change depends on it and orders its migrations after it.
- `cron-process-payouts` is the precedent daily job: secret-gated (`x-function-secret`), scheduled via
  a **Vault-backed** `cron.schedule` (`20260619130000_payout_cron_vault_secret.sql`) reading
  `edge_function_base_url` / `service_role_key` from `vault.decrypted_secrets`. We reuse those two
  secrets and add `health_cron_secret`.
- The app vitest config already includes `supabase/functions/_shared/*.test.ts`, and the sibling pure
  modules (`payoutCalc.ts` etc.) prove the "Deno-free helper, colocated `.test.ts`" pattern.
- `pg_cron` / `pg_net` / `supabase_vault` already exist (heritage + payout crons created them).

## Goals / Non-Goals

**Goals:**
- A daily, read-only, service-role check-runner that satisfies the snapshot contract exactly.
- Value-sensitive logic (per-check status, worst-of `overall_status`) in a pure, unit-tested module.
- Privileged cross-schema reads isolated in one auditable `SECURITY DEFINER` function.
- A failed/absent probe still produces a visible `fail` snapshot — never a silent no-write.

**Non-Goals:**
- Runbook 5.8 auth-email *send* (rate-limit-sensitive; deferred to a follow-up with a non-sending
  proxy).
- True local↔remote migration parity (needs the repo's migration set; a CI concern). The `migrations`
  check reports the newest applied version only, and says so.
- Merging with `operator_alerts` (MP-08) — same family, do not converge now.
- Any offline-first / replication involvement — admin monitoring of server-authoritative data.
- Snapshot retention/pruning — rows are tiny and daily; a bounded-retention pass is a later change.

## Decisions

### 1. Privileged reads live in one `SECURITY DEFINER` SQL probe; checks live in TS

`public.system_health_probe()` (`LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''`, `REVOKE ALL
FROM public`, `GRANT EXECUTE TO service_role`) returns a JSON facts object:

```json
{
  "probed_at": "<iso>",
  "latest_migration": "20260704140000",
  "migration_count": 314,
  "cron_jobs": [
    { "jobname": "nightly-show-payouts", "active": true,
      "last_status": "succeeded", "last_start": "<iso>", "last_end": "<iso>",
      "last_message": null }
  ]
}
```

Rationale: an edge function reaches only the `public` schema through `supabase-js`; `cron.job`,
`cron.job_run_details`, and `supabase_migrations.schema_migrations` are off-limits. A single definer
function is the narrowest, most auditable way to expose exactly those read-only facts to
`service_role`, and it runs **no** judgment — the ok/warn/fail decision (the part worth testing) stays
in TS. **Alternative considered:** compute statuses in SQL — rejected; SQL logic is hard to unit-test
and would duplicate the enum→status rules the board already treats as value-sensitive.

### 2. Pure `buildSnapshot(facts, opts)` maps facts → contract, worst-of overall

`apps/myk9show/supabase/functions/_shared/systemHealthChecks.ts` (Deno-free, `< 500` lines):

- `buildSnapshot(facts, { now, source, runDurationMs })` → `{ source, overall_status, checks[],
  run_duration_ms }` ready to `INSERT`.
- Emits `checks[].checked_at` in **snake_case** (the parser reads `entry.checked_at`).
- `overall_status = worstOf(checks.map(c => c.status))` with `fail > warn > ok`.
- Tolerant like the board's parser: non-object facts, a missing `cron_jobs` array, or a malformed job
  entry degrade to a `fail`/`warn` check with a detail string — never a throw.

v1 checks:
- `payout_cron` (runbook 5.4): the `nightly-show-payouts` job must be present and `active`; its latest
  run must be `succeeded` and within `STALE_AFTER_MS`. Missing/inactive job or `failed` last run →
  `fail`; never-run or overdue → `warn`; else `ok`.
- `background_jobs`: every *other* active cron job's latest run; any `failed` → `fail` (names listed);
  any never-run/overdue → `warn`; else `ok`.
- `migrations` (runbook 5.2 proxy): `ok` with detail `Latest <version> (<n> applied)`; a missing
  version → `warn`. Honestly scoped to newest-applied, not full parity.

Rationale: the "stale/failed ⇒ fail, surfaced loudly" mapping and the worst-of fold are exactly
CLAUDE.md's assertion-first targets. **Alternative considered:** inline in the edge function —
rejected; not vitest-testable (Deno `npm:` imports) and pushes IO and logic together.

### 3. Edge function does IO only; a probe failure still writes a `fail` snapshot

`cron-health-check/index.ts`: `POST` + constant-time `x-function-secret` check (copied from the payout
cron, SA-002), `rpc('system_health_probe')` as `service_role`, `buildSnapshot(...)`, `INSERT`. If the
rpc errors or returns nothing, it inserts a snapshot with a single `probe` check = `fail` and
`overall_status = fail`, so the board shows the outage instead of going silently stale a day later.
Measures `run_duration_ms` around probe+build.

### 4. Vault-backed daily cron at 07:00 UTC

`cron.schedule('daily-health-check', '0 7 * * *', …)` in a `DO` block resolving `edge_function_base_url`
/ `service_role_key` / `health_cron_secret` from `vault.decrypted_secrets`, raising if any is missing —
a verbatim mirror of `20260619130000_payout_cron_vault_secret.sql`. **Cadence:** once daily keeps the
board's 7-run history strip ≈ 1 week (the parent's "did last week trend healthy?" intent) and leaves
the ~26h staleness window to correctly trip a genuinely broken cron. `07:00 UTC` lands a fresh run
before US-morning, when the operator opens the board. Idempotent `unschedule(jobid)` first.

## Risks / Trade-offs

- **Depends on the #1123 table** → migrations ordered after `20260704120000`; PR body declares it, and
  the runbook already says to treat manual items as authoritative until the runner lands.
- **`SECURITY DEFINER` over-exposure** → `search_path = ''`, fully schema-qualified reads, `REVOKE ALL
  FROM public` + `GRANT EXECUTE TO service_role` only, and it returns facts (no mutation, no secrets).
  Migration-auditor + Codex pass before push.
- **`pg_cron` absent in an environment** → the probe/cron migrations `create extension if not exists`
  first (already present in staging/prod); the `cron_jobs` read simply returns `[]` if empty.
- **Missed run false-alarm** → daily @ 07:00 UTC vs a 26h window gives ~2h grace; a *single* miss trips
  stale, which is the intended loud signal, not a bug.
- **Divergence from `operator_alerts`** → unchanged; this change adds no columns and keeps the same
  service-role-write / site-admin-read family.

## Emotional intent (docs/INTENT.md)

Serves **Site Admin — "The platform is healthy"** (INTENT.md §2). This change is what makes "problems
surfaced automatically" *true*: without a writer the board can only ever say `fail`. The runner must
map a failed/overdue check to a loud `fail`/`warn`, and a probe outage to a visible `fail` snapshot —
never swallow an error into a green board. The `payout_cron` check preserves the existing
`// INTENT:`-guarded "stale = fail, surfaced loudly" rule the board depends on; no INTENT comments are
changed.
