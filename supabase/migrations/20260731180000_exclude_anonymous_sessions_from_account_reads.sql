-- =============================================================================
-- Migration 20260731180000: keep anonymous sessions out of account-wide reads
--
-- SA-2026-07-29-02 / MYK9-117 (P1).
--
-- PROBLEM. GoTrue anonymous sign-in is enabled and load-bearing: a ringside
-- passcode user has no account, signs in anonymously, and validate-passcode
-- stamps the server-validated (show, role) into app_metadata. That session
-- therefore carries the PostgreSQL `authenticated` role — so every SELECT policy
-- whose USING clause is `true` or merely "someone is logged in" treats a bare
-- anonymous JWT as a fully trusted account. One unauthenticated call away from a
-- volunteer roster with names, emails and phone numbers.
--
-- The guard already exists. 20260712160000 added the is_anonymous test to
-- platform_settings and sync_conflicts. This finishes the job for the tables that
-- were missed; the shape below is copied from those two.
--
-- SCOPE: 14 policies, NOT the 32 the finding counted. Enumerating live rather
-- than trusting the baseline changed the answer twice:
--
--   * 16 of the unconditional policies are on tables anon can ALREADY select
--     (rules, sport_templates, show_templates, clubs, armbands, judge_assignments,
--     achievements, the visibility overrides, user_guide, …). Those are public
--     reference and show-browsing data by design — the anon grant is the
--     statement of intent. Adding a real-account guard there would break public
--     show browsing while protecting nothing, since anon reads them anyway.
--     They are deliberately untouched.
--   * 3 tables the finding listed under `auth.uid() IS NOT NULL` no longer match
--     that text: activity_log, show_announcements and trial_checklist_state now
--     read `(( SELECT auth.uid()) IS NOT NULL)` after the RBAC performance work
--     hoisted the call into a subquery. Same semantics, different string. A
--     regex written against the finding's wording misses all three.
--
-- The dividing line used here is "can anon already SELECT this table?" If yes the
-- data is public and the policy stays. If no, the only way a non-account reaches
-- it is anonymous sign-in, and that is exactly what this closes.
--
-- ANONYMOUS SIGN-IN STAYS ENABLED. Disabling it would break QR/passcode ringside
-- access. The fix is at the policy layer, as the finding requires.
--
-- PERFORMANCE. Every call site wraps the helper as `( SELECT
-- public.is_real_account())` so the planner evaluates it once per query instead
-- of once per row — the same InitPlan hoisting the existing platform_settings
-- policy relies on, and the reason this does not reintroduce the O(N) policy
-- shape that 20260728* had to unwind.
-- =============================================================================

-- SECURITY INVOKER (the default), not DEFINER as the issue sketched: this reads
-- only the request's own JWT and touches no table, so it needs no elevated
-- rights. Granting fewer privileges than asked for is the safer deviation.
CREATE OR REPLACE FUNCTION public.is_real_account()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
     AND coalesce(((auth.jwt() ->> 'is_anonymous')::boolean), false) IS NOT TRUE;
$$;

COMMENT ON FUNCTION public.is_real_account() IS
  'True when the caller holds a real (non-anonymous) account. Anonymous sign-in is load-bearing for ringside passcode access and yields the authenticated role, so "authenticated" alone is not a trust signal. Wrap call sites as ( SELECT public.is_real_account()) so the planner hoists it. MYK9-117.';

REVOKE ALL ON FUNCTION public.is_real_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_real_account() TO authenticated;
-- anon never needs it: every policy below is on a table anon cannot SELECT.
REVOKE ALL ON FUNCTION public.is_real_account() FROM anon;

-- ---------------------------------------------------------------------------
-- RBAC model. Enumerating roles/permissions hands an attacker the whole
-- authorization map; a passcode session has no business reading it.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS roles_select ON public.roles;
CREATE POLICY roles_select ON public.roles
  FOR SELECT TO authenticated
  USING (( SELECT public.is_real_account()));

DROP POLICY IF EXISTS permissions_select ON public.permissions;
CREATE POLICY permissions_select ON public.permissions
  FOR SELECT TO authenticated
  USING (( SELECT public.is_real_account()));

DROP POLICY IF EXISTS role_permissions_select ON public.role_permissions;
CREATE POLICY role_permissions_select ON public.role_permissions
  FOR SELECT TO authenticated
  USING (( SELECT public.is_real_account()));

-- ---------------------------------------------------------------------------
-- Volunteers. The PII limb of the finding: name, email, phone, notes.
-- Additionally show-scoped per the acceptance criteria — a real account should
-- not read every club's roster either, only shows it helps run, plus its own row.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view volunteers" ON public.volunteers;
CREATE POLICY volunteers_select ON public.volunteers
  FOR SELECT TO authenticated
  USING (
    ( SELECT public.is_real_account())
    AND (
      ( SELECT public.is_site_admin())
      OR ( SELECT public.can_manage_show(volunteers.show_id))
      OR ( SELECT public.is_show_official(volunteers.show_id))
      -- Own volunteer record.
      OR volunteers.person_id = ( SELECT p.id FROM public.people p
                                   WHERE p.auth_user_id = ( SELECT auth.uid()) LIMIT 1)
    )
  );

DROP POLICY IF EXISTS volunteer_roles_select ON public.volunteer_roles;
CREATE POLICY volunteer_roles_select ON public.volunteer_roles
  FOR SELECT TO authenticated
  USING (( SELECT public.is_real_account()));

DROP POLICY IF EXISTS "Authenticated users can view class assignments" ON public.volunteer_class_assignments;
CREATE POLICY volunteer_class_assignments_select ON public.volunteer_class_assignments
  FOR SELECT TO authenticated
  USING (( SELECT public.is_real_account()));

DROP POLICY IF EXISTS "Authenticated users can view general assignments" ON public.volunteer_general_assignments;
CREATE POLICY volunteer_general_assignments_select ON public.volunteer_general_assignments
  FOR SELECT TO authenticated
  USING (( SELECT public.is_real_account()));

-- ---------------------------------------------------------------------------
-- Operational data with no public dimension.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS judge_qualifications_select ON public.judge_qualifications;
CREATE POLICY judge_qualifications_select ON public.judge_qualifications
  FOR SELECT TO authenticated
  USING (( SELECT public.is_real_account()));

DROP POLICY IF EXISTS offline_scoring_select ON public.offline_scoring;
CREATE POLICY offline_scoring_select ON public.offline_scoring
  FOR SELECT TO authenticated
  USING (( SELECT public.is_real_account()));

DROP POLICY IF EXISTS organization_agreements_select ON public.organization_agreements;
CREATE POLICY organization_agreements_select ON public.organization_agreements
  FOR SELECT TO authenticated
  USING (( SELECT public.is_real_account()));

DROP POLICY IF EXISTS performance_metrics_select ON public.performance_metrics;
CREATE POLICY performance_metrics_select ON public.performance_metrics
  FOR SELECT TO authenticated
  USING (( SELECT public.is_real_account()));

-- ---------------------------------------------------------------------------
-- The three the finding filed under `auth.uid() IS NOT NULL`. They are PUBLIC-role
-- policies, so they are recreated TO authenticated as well — anon holds no SELECT
-- on any of these tables, so narrowing the role changes nothing for anon while
-- making the intent explicit.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS activity_log_select ON public.activity_log;
CREATE POLICY activity_log_select ON public.activity_log
  FOR SELECT TO authenticated
  USING (( SELECT public.is_real_account()));

DROP POLICY IF EXISTS "Authenticated users can read announcements" ON public.show_announcements;
CREATE POLICY show_announcements_select ON public.show_announcements
  FOR SELECT TO authenticated
  USING (( SELECT public.is_real_account()));

DROP POLICY IF EXISTS checklist_select ON public.trial_checklist_state;
CREATE POLICY checklist_select ON public.trial_checklist_state
  FOR SELECT TO authenticated
  USING (( SELECT public.is_real_account()));
