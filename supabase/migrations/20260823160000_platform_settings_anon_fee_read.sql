-- MYK9-229 — let a SIGNED-OUT visitor read the three platform fee columns.
--
-- /fees is a public, shareable page whose whole purpose is to state what the
-- service fee is and how it splits. Until now anon could not read
-- `platform_settings` at all, so a signed-out visitor silently fell back to the
-- compiled-in default rates. That fallback happens to equal the live values
-- today (7% / 0¢ / 0¢), which is exactly what makes it dangerous: the moment a
-- site admin changes the fee on /admin/payouts, the public page would keep
-- quoting the old number with nothing anywhere reporting a problem.
--
-- ── TWO BARRIERS, BOTH REQUIRED ───────────────────────────────────────────
-- Grants and RLS are orthogonal in this project. anon was blocked at BOTH
-- layers (verified against the applied database, 2026-08-23):
--
--   table ACL : postgres=arwdDxtm | authenticated=rw | service_role=arwdDxtm
--   column ACL: (null) on all six columns
--   policies  : platform_settings_select -> authenticated
--               platform_settings_update -> authenticated
--
-- A migration that adds only the GRANT still returns 403 (no policy admits the
-- row); one that adds only the policy still returns 403 (no privilege on the
-- columns). Both statements below are load-bearing — do not split them.
--
-- ── WHY COLUMN-LEVEL, NOT TABLE-LEVEL ─────────────────────────────────────
-- The row also carries `updated_by` (a person UUID) and `updated_at`
-- (operational metadata). Neither belongs to the public, and a table-level
-- GRANT SELECT would hand over both. The column grant is what keeps them out,
-- and it is why `platform_settings` must NEVER appear in
-- ANON_TABLE_ALLOWLIST — only in ANON_COLUMN_ALLOWLIST
-- (supabase/functions/_shared/anonGrantChecks.ts), where the /admin/health
-- anon-grant check compares the applied ACL column-by-column.
--
-- ── THE POSTGREST TRAP THIS CREATES ───────────────────────────────────────
-- With a column-level grant and no table-level SELECT, a request that asks for
-- columns anon cannot read fails with 403 AND AN EMPTY MESSAGE BODY — including
-- `select=*`, and including a `count` that names `*` rather than a column. It
-- also covers columns referenced only in a FILTER: `.eq('id', true)` requires
-- SELECT on `id`. `usePlatformFeeRates` therefore selects exactly these three
-- columns and no longer filters on `id` (the table is a singleton, so
-- `.limit(1)` is equivalent). React Query masks the resulting throw as a retry,
-- and on an unfocused tab it parks at fetchStatus:'paused' forever — it
-- presents as an offline bug, not a permissions one. Do not debug it as one.
--
-- Read-only, and only the fee. anon still holds no INSERT/UPDATE/DELETE here,
-- the site-admin write policy is untouched, and the write-guard trigger
-- (trg_guard_platform_settings_write) is independent of all of this.

begin;

-- Barrier 1 — column privileges. Exactly the three fee columns.
grant select (platform_fee_percent, platform_fee_flat_cents, platform_fee_min_cents)
  on public.platform_settings to anon;

-- The authenticated surface is unchanged; restated so this migration carries an
-- explicit decision for BOTH API roles, which
-- `migrationGrantDecisionContract` requires of any standalone table grant. A
-- re-GRANT of an identical privilege set is a no-op — note that a GRANT can
-- never NARROW an existing grant, so this line must not be read as a way to
-- tighten anything.
grant select, update on public.platform_settings to authenticated;

-- Barrier 2 — RLS. The existing `authenticated` policies are left exactly as
-- they are; this adds a separate, minimal SELECT policy for anon only.
-- `using (true)` is safe here because the row-level surface anon can reach is
-- already narrowed to the three granted columns of a single config row.
drop policy if exists platform_settings_fee_read_anon on public.platform_settings;
create policy platform_settings_fee_read_anon
  on public.platform_settings
  for select
  to anon
  using (true);

commit;

-- Verify against the APPLIED database, never the text above:
--
--   select a.attname, a.attacl::text
--   from pg_attribute a
--   where a.attrelid = 'public.platform_settings'::regclass and a.attacl is not null;
--
--   select polname, polcmd, polroles::regrole[]
--   from pg_policy where polrelid = 'public.platform_settings'::regclass;
--
-- Do NOT use information_schema.role_table_grants: it only shows grants visible
-- to the querying role and returns empty over the MCP connection, so it cannot
-- prove absence.
