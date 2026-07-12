-- Exclude anonymous sign-in sessions from two authenticated-only SELECT policies.
--
-- Follow-up to the advisor disposition sweep (PR #1292, Verdict 3). Supabase
-- anonymous sign-in issues a JWT whose `role` claim is `authenticated`, so a
-- claimless anon session (no ringside passcode claim) is indistinguishable from
-- a real logged-in user to a `TO authenticated USING (true)` policy. Two such
-- policies leak to anon sessions:
--
--   * public.platform_settings.platform_settings_select  — operator config
--     (currently platform_fee_percent; more operator-wide config may land here).
--   * public.sync_conflicts.sync_conflicts_select        — may hold cross-user
--     row payloads captured during offline replication conflict resolution.
--
-- Fix: gate both on the `is_anonymous` JWT claim. `IS NOT TRUE` (not `= false`)
-- so a genuine authenticated user whose token omits the claim still reads — only
-- an explicit is_anonymous=true is blocked. The claim is wrapped in a scalar
-- (SELECT ...) so auth.jwt() is evaluated once per query (InitPlan), not per row.
--
-- Scope is deliberately narrow: only these two tables. The reference tables that
-- share the authenticated-USING(true) shape (roles, permissions, role_permissions,
-- judge_qualifications, organization_agreements, offline_scoring,
-- performance_metrics, volunteer_*) are accepted-by-design per the 009 plan's
-- Verdict-3 table and are intentionally left untouched.

begin;

-- platform_settings: authenticated cart-preview reads stay, anon sessions blocked.
drop policy if exists platform_settings_select on public.platform_settings;
create policy platform_settings_select
  on public.platform_settings
  for select
  to authenticated
  using (
    (select (auth.jwt() ->> 'is_anonymous')::boolean) is not true
  );

-- sync_conflicts: authenticated reads stay, anon sessions blocked.
drop policy if exists sync_conflicts_select on public.sync_conflicts;
create policy sync_conflicts_select
  on public.sync_conflicts
  for select
  to authenticated
  using (
    (select (auth.jwt() ->> 'is_anonymous')::boolean) is not true
  );

commit;
