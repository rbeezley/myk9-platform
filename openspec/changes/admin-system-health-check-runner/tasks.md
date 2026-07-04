## 1. Facts probe (SQL, SECURITY DEFINER)

- [x] 1.1 Confirm `pg_cron`/`pg_net`/`supabase_vault` extensions and the `cron.job` /
      `cron.job_run_details` / `supabase_migrations.schema_migrations` shapes against the live schema
      before writing SQL.
- [x] 1.2 Create `supabase/migrations/20260704130000_system_health_probe.sql`: `public.system_health_probe()`
      returning a jsonb facts object (`probed_at`, `latest_migration`, `migration_count`, `cron_jobs[]`
      with `jobname/active/last_status/last_start/last_end/last_message`). `LANGUAGE plpgsql SECURITY
      DEFINER SET search_path = ''`, fully schema-qualified reads.
- [x] 1.3 In the same migration: `REVOKE ALL ON FUNCTION … FROM public`; `GRANT EXECUTE … TO
      service_role`. No grant to `anon`/`authenticated`. `NOTIFY pgrst, 'reload schema'`.
- [x] 1.4 Run the migration-auditor agent (definer hygiene, grants, no O(N), search_path pinned) —
      verdict SAFE TO PUSH: search_path pinned, REVOKE-before-GRANT, read-only body, Vault pattern matched.

## 2. Pure check-mapping module (extracted, testable)

- [x] 2.1 Create `apps/myk9show/supabase/functions/_shared/systemHealthChecks.ts` — Deno-free.
      Types (`RawProbeFacts`, `SnapshotCheck`, `HealthSnapshotInsert`), `STALE_AFTER_MS` (~26h, match
      the board), `PAYOUT_CRON_JOB` name.
- [x] 2.2 Implement `buildSnapshot(facts, { now, source, runDurationMs })`: produce the `payout_cron`,
      `background_jobs`, `migrations` checks; `checked_at` snake_case; `overall_status` = worst-of.
      Never throws on malformed facts (degrades to a `fail` check).

## 3. Edge function (IO only)

- [x] 3.1 Create `apps/myk9show/supabase/functions/cron-health-check/index.ts` — `POST` +
      constant-time `x-function-secret` gate (mirror `cron-process-payouts`); `createClient(SUPABASE_URL,
      SERVICE_ROLE_KEY)`; `rpc('system_health_probe')`; `buildSnapshot`; `insert` into
      `system_health_snapshots`; return the summary. Measure `run_duration_ms`.
- [x] 3.2 Probe-failure path: on rpc error / empty result, insert a `fail` snapshot carrying a single
      `probe` check with the error detail — never a silent no-write.

## 4. Cron schedule (Vault-backed)

- [x] 4.1 Create `supabase/migrations/20260704140000_system_health_cron.sql` — `create extension if not
      exists` guards; idempotent `cron.unschedule(jobid)`; `cron.schedule('daily-health-check', '0 7 * *
      *', …)` in a `DO` block resolving `edge_function_base_url` / `service_role_key` /
      `health_cron_secret` from Vault, raising on any missing secret. Mirror the payout Vault migration.

## 5. Tests

- [x] 5.1 `apps/myk9show/supabase/functions/_shared/systemHealthChecks.test.ts` (vitest) — assertion-first:
      all-healthy → `ok` and worst-of `ok`; payout job missing → `payout_cron` `fail` and overall
      `fail`; payout last run `failed` → `fail`; payout overdue (> STALE) → `warn`; a background job
      `failed` → `fail`; missing `latest_migration` → `migrations` `warn`; malformed/non-object facts →
      single `fail` check without throwing; `checks[].checked_at` is snake_case and populated;
      `run_duration_ms` passthrough.
- [x] 5.2 Run (21 tests pass; pnpm typecheck green) `cd apps/myk9show && npx vitest run supabase/functions/_shared/systemHealthChecks.test.ts`
      green, and `pnpm typecheck` green.

## 6. Docs / tracking

- [ ] 6.1 Update `docs/operations/go-live-runbook.md` Phase 5 note: the runner now populates the board;
      list which items are automated (5.2 proxy, 5.4) and which remain manual (5.1, 5.3, 5.5–5.9).
      DEFERRED to the post-#1123-merge rebase — Phase 5's board note is added by #1123, so editing it here
      would collide with that branch (docs-collision rule, feedback_parallelize_plans_by_file_not_pr).
- [x] 6.2 Update `MEMORY.md` / OPEN-TODOS to mark the check-runner shipped (the board memory flags it
      as TODO).

## 7. Ship gate (final)

- [ ] 7.1 `/simplify` then `/harden` the diff; every file `< 500` lines.
- [x] 7.2 Open PR (#1125, base main; #1123 dependency called out) + run the Codex second-opinion pass.
      Codex findings: P1 = the write depends on #1123's table (the known, deploy-gated dependency —
      no code change; process-controlled). P2 = pg_cron `succeeded` ≠ Edge Function 2xx for
      `net.http_post` jobs — FIXED: probe emits `dispatches_http`, runner words http-dispatch jobs as
      "dispatched" not "succeeded" (+ INTENT guard comment, design/spec note, 3 new tests). Verified
      against live DB (pg_net response table is pruned + uncorrelated, so honest wording is the right
      fix, not fragile correlation). Deferred: a `payout_failures` per-function-ledger check.
- [ ] 7.3 Deploy: push both migrations (confirmation-gated shared-DB write), set the `health_cron_secret`
      Vault secret + the function `HEALTH_CRON_SECRET` env, deploy `cron-health-check --no-verify-jwt`.
      Verify one manual invoke writes a row and the board goes green. (Merge is not deploy.)
- [ ] 7.4 Squash-merge from the main repo dir after CI + reviews are green; then archive this change.
