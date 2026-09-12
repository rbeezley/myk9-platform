-- MYK9-470 / SA-2026-09-12-02: RLS policies that gate on the ARGUMENT-LESS role helpers.
--
-- `is_club_admin()` and `is_trial_secretary()` both treat a NULL/absent argument as a wildcard:
--
--   AND (check_club_id IS NULL OR ur.club_id = check_club_id)
--
-- so calling them with no argument means "holds this role in ANY club". The refund edge
-- functions get this right and say so (stripe-refund-entry/index.ts refuses the club-admin arm
-- outright for a club-less show, citing the same round-8 finding). These policies passed no
-- argument at all, giving every secretary and club admin on the platform reach over rows
-- belonging to clubs they have nothing to do with.
--
-- Report: docs/security-audit-2026-09-12.md
--
-- ===========================================================================
-- WHY UNCORRELATED SET HELPERS AND NOT A PER-ROW can_manage_show(<row>)
-- ===========================================================================
-- The obvious scoping is the shape this repo has already been burned by.
-- `20260611120000_tighten_dogs_people_select_rls.sql` replaced per-row
-- can_manage_show_dog(dogs.id) / can_manage_show_person(people.id) precisely because they are
-- CORRELATED scalar subqueries: Postgres evaluated them once per row, giving O(N x entries),
-- statement timeouts and a retry storm. That migration records the platform-wide staff read as
-- an INTENTIONAL deferral under "Residual / post-launch hardening", pending "a denormalized
-- show-visibility index".
--
-- public.manageable_show_ids() is that shape done safely: NO arguments, so it is UNCORRELATED
-- and Postgres hoists it into a single per-statement InitPlan, exactly like is_show_manager().
-- Every predicate below costs one evaluation of the show set per statement plus an indexed
-- lookup per row:
--
--   entries_active_show_idx   ON entries (show_id) WHERE deleted_at IS NULL
--   entries_active_dog_id_idx ON entries (dog_id)  WHERE deleted_at IS NULL AND ...
--   entries_dog_id_idx        ON entries (dog_id)
--   vaccinations_dog_id_idx   ON vaccinations (dog_id)
--
-- This is NOT the per-row-role-lookup shape the 2026-06 deferral rules out. Do NOT "simplify"
-- any of these into can_manage_show(<row>) — that is the regression.
--
-- ===========================================================================
-- SCOPE — narrowing only, never widening
-- ===========================================================================
-- Each policy below keeps its ORIGINAL role set exactly. That matters because
-- manageable_show_ids() resolves club_admin OR trial_secretary OR site_admin, which is a
-- superset of what two of these policies allowed:
--
--   * offline_scoring and nationals_* were `is_club_admin() OR is_trial_secretary() OR
--     is_platform_admin()` — exactly manageable_show_ids()'s own role set, so it is a faithful
--     scoped substitute.
--   * vaccinations_select and result_submissions were secretary-or-site-admin only, with NO
--     club-admin arm. Using manageable_show_ids() there would have ADDED club admins — a
--     widening dressed up as a narrowing. They get trial_secretary_show_ids() instead.
--
-- Also deliberately NOT touched: the argument-less helpers in dogs_select, people_select and
-- judge_certifications_select. Those are the shared-directory reads covered by the 2026-06
-- deferral above — a secretary must be able to find any dog or person to build an entry. This
-- migration touches only policies whose row carries a tenant key of its own.
--
-- And NOT touched on vaccinations: the owner/co-owner arm is reproduced byte-for-byte, including
-- its lack of a `deleted_at IS NULL` filter and its use of is_platform_admin() rather than the
-- canonical is_site_admin(). Both are pre-existing and out of scope here; tightening them would
-- be opportunistic refactoring inside a security migration. (The missing soft-delete filter is
-- harmless in practice because dogs_select already hides a soft-deleted dog, but it is an
-- inconsistency with achievements_select as shipped in MYK9-469 and is worth its own look.)

-- ---------------------------------------------------------------------------
-- Helper: the shows where the caller is trial secretary (or site admin)
-- ---------------------------------------------------------------------------
-- Deliberately narrower than manageable_show_ids(): no club_admin arm, so it can replace a
-- bare is_trial_secretary() without widening the policy that used it. Argument-less, STABLE and
-- SECURITY DEFINER for the same reason manageable_show_ids() is — it must be an InitPlan, and
-- it reads user_roles, which is itself RLS-protected.
--
-- The club_id IS NOT NULL guard is MYK9-258: a club-less show must reach nobody but a site
-- admin, because is_trial_secretary(NULL) means "secretary of ANY club".
CREATE OR REPLACE FUNCTION public.trial_secretary_show_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.id
  FROM public.shows s
  WHERE (s.club_id IS NOT NULL AND (SELECT public.is_trial_secretary(s.club_id)))
     OR (SELECT public.is_site_admin());
$$;

-- Mirror manageable_show_ids()'s grant shape exactly: no PUBLIC, no anon.
-- The `FROM anon` revoke is redundant after `FROM PUBLIC` but is stated explicitly on purpose —
-- migrationGrantDecisionContract requires every new public function to name anon in a REVOKE, so
-- that "anon must not reach this" is a recorded decision rather than a side effect of PUBLIC.
REVOKE ALL ON FUNCTION public.trial_secretary_show_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trial_secretary_show_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.trial_secretary_show_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.trial_secretary_show_ids() TO service_role;

COMMENT ON FUNCTION public.trial_secretary_show_ids() IS
  'MYK9-470: shows where the caller is the club''s trial secretary, plus every show for a site '
  'admin. Narrower than manageable_show_ids() (no club_admin arm) so it can scope a policy that '
  'previously used a bare is_trial_secretary() without widening it. Argument-less on purpose: '
  'Postgres hoists it into a per-statement InitPlan instead of calling it per row.';

-- ---------------------------------------------------------------------------
-- vaccinations — the one with a live surface
-- ---------------------------------------------------------------------------
-- A secretary's legitimate need is the vaccination record of a dog entered in a show they run
-- (RecordsSection.tsx: "Secretary surface: Health only, no Premium gate, vaccinations-only
-- content"). The old policy gave them every dog's health record on the platform.
--
-- Owner/co-owner and admin arms are byte-identical to the original. Only the trailing bare
-- `is_trial_secretary()` changes, into an EXISTS over the dog's own active entries intersected
-- with the shows the caller is actually secretary of.
--
-- The vaccinations INSERT/UPDATE/DELETE policies are NOT touched — they carry a
-- has_effective_premium_access() arm that this migration has no business in.
DROP POLICY IF EXISTS "vaccinations_select" ON public.vaccinations;

CREATE POLICY "vaccinations_select"
  ON public.vaccinations
  FOR SELECT
  TO authenticated
  USING (
    dog_id IN (
      SELECT d.id
      FROM public.dogs d
      WHERE d.owner_id = (SELECT public.get_my_person_id())
         OR d.co_owner_id = (SELECT public.get_my_person_id())
    )
    OR (SELECT public.is_platform_admin())
    OR EXISTS (
      SELECT 1
      FROM public.entries e
      WHERE e.dog_id = vaccinations.dog_id
        AND e.deleted_at IS NULL
        AND e.show_id IN (SELECT public.trial_secretary_show_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- offline_scoring — score data under an unscoped write
-- ---------------------------------------------------------------------------
-- entry_id is NOT NULL, so every row reaches a show through entries.show_id. The original role
-- set (club_admin OR secretary OR site_admin) is exactly manageable_show_ids()'s.
--
-- offline_scoring_select is NOT touched: it gates on is_real_account(), which is the MYK9-117
-- anonymous-session exclusion and a different concern.
DROP POLICY IF EXISTS "offline_scoring_insert" ON public.offline_scoring;
DROP POLICY IF EXISTS "offline_scoring_update" ON public.offline_scoring;
DROP POLICY IF EXISTS "offline_scoring_delete" ON public.offline_scoring;

CREATE POLICY "offline_scoring_insert"
  ON public.offline_scoring
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.entries e
      WHERE e.id = offline_scoring.entry_id
        AND e.show_id IN (SELECT public.manageable_show_ids())
    )
  );

CREATE POLICY "offline_scoring_update"
  ON public.offline_scoring
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.entries e
      WHERE e.id = offline_scoring.entry_id
        AND e.show_id IN (SELECT public.manageable_show_ids())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.entries e
      WHERE e.id = offline_scoring.entry_id
        AND e.show_id IN (SELECT public.manageable_show_ids())
    )
  );

CREATE POLICY "offline_scoring_delete"
  ON public.offline_scoring
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.entries e
      WHERE e.id = offline_scoring.entry_id
        AND e.show_id IN (SELECT public.manageable_show_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- nationals_scores / nationals_rankings / nationals_advancement
-- ---------------------------------------------------------------------------
-- Each carries a NOT NULL entry_id and nothing else tenant-shaped. Dormant schema (0 rows and
-- zero non-test source references), but they hold scores and rankings and the old FOR ALL policy
-- let any club admin or secretary rewrite another club's.
--
-- Kept as FOR ALL with USING and no WITH CHECK, matching the originals: for FOR ALL, Postgres
-- reuses USING as the INSERT check when WITH CHECK is absent, so adding one would change
-- behaviour rather than preserve it. FOR ALL also covers SELECT, so reads narrow too — intended.
DROP POLICY IF EXISTS "nationals_scores_manage" ON public.nationals_scores;
CREATE POLICY "nationals_scores_manage"
  ON public.nationals_scores
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.entries e
      WHERE e.id = nationals_scores.entry_id
        AND e.show_id IN (SELECT public.manageable_show_ids())
    )
  );

DROP POLICY IF EXISTS "nationals_rankings_manage" ON public.nationals_rankings;
CREATE POLICY "nationals_rankings_manage"
  ON public.nationals_rankings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.entries e
      WHERE e.id = nationals_rankings.entry_id
        AND e.show_id IN (SELECT public.manageable_show_ids())
    )
  );

DROP POLICY IF EXISTS "nationals_advancement_manage" ON public.nationals_advancement;
CREATE POLICY "nationals_advancement_manage"
  ON public.nationals_advancement
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.entries e
      WHERE e.id = nationals_advancement.entry_id
        AND e.show_id IN (SELECT public.manageable_show_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- result_submissions — show_id is NOT NULL, so this one is direct
-- ---------------------------------------------------------------------------
-- Original role set was secretary OR site_admin, with no club-admin arm, so this uses
-- trial_secretary_show_ids() rather than manageable_show_ids().
DROP POLICY IF EXISTS "secretary_admin_select_result_submissions" ON public.result_submissions;
DROP POLICY IF EXISTS "secretary_admin_insert_result_submissions" ON public.result_submissions;

CREATE POLICY "secretary_admin_select_result_submissions"
  ON public.result_submissions
  FOR SELECT
  TO authenticated
  USING (show_id IN (SELECT public.trial_secretary_show_ids()));

CREATE POLICY "secretary_admin_insert_result_submissions"
  ON public.result_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (show_id IN (SELECT public.trial_secretary_show_ids()));

-- ---------------------------------------------------------------------------
-- volunteer_roles — NOT scoped, because there is nothing to scope it BY
-- ---------------------------------------------------------------------------
-- RATIONALE (MYK9-470). This table is a global catalogue of volunteer role TYPES —
-- (name, description, requires_training, max_volunteers, license_key). It has no show_id and no
-- club_id, so there is no tenant key to gate on: any row a club admin adds is platform-wide by
-- construction, and an EXISTS over some other table would be invented rather than derived.
--
-- The two alternatives are product decisions, not security fixes: restrict writes to site_admin
-- (changing who may extend the shared catalogue), or add a club_id (a schema change making the
-- catalogue per-tenant). Neither belongs in a policy-scoping migration, so the unscoped write is
-- recorded here as a known, deliberate boundary instead of being quietly narrowed. 0 rows today.
COMMENT ON TABLE public.volunteer_roles IS
  'Global catalogue of volunteer role types. MYK9-470: the manage policies gate on the '
  'argument-less is_club_admin()/is_trial_secretary() ("any club") and are DELIBERATELY left '
  'that way — the table has no show_id or club_id to scope by, so every row is platform-wide by '
  'construction. Narrowing to site_admin, or adding a tenant column, is a product decision and '
  'was explicitly out of scope for MYK9-470.';

COMMENT ON POLICY "vaccinations_select" ON public.vaccinations IS
  'MYK9-470: owner/co-owner, platform admin, or the trial secretary of a show the dog is '
  'actively entered in. Uses the UNCORRELATED trial_secretary_show_ids() so it stays a '
  'per-statement InitPlan — do not rewrite as per-row can_manage_show(), which is the '
  '20260611120000 timeout shape. Narrower helper than manageable_show_ids() on purpose: the '
  'original had no club-admin arm.';

COMMENT ON POLICY "offline_scoring_update" ON public.offline_scoring IS
  'MYK9-470: scoped through entries.show_id to the shows the caller manages.';

COMMENT ON POLICY "nationals_scores_manage" ON public.nationals_scores IS
  'MYK9-470: scoped through entries.show_id to the shows the caller manages. FOR ALL with USING '
  'only, as before — Postgres reuses USING as the INSERT check here.';

COMMENT ON POLICY "secretary_admin_select_result_submissions" ON public.result_submissions IS
  'MYK9-470: scoped to the caller''s secretary shows via the row''s own NOT NULL show_id.';
