-- MYK9-833: an assigned judge cannot see a draft show, so `/at-show/:id` cannot
-- resolve their trial and class rows before the show publishes, and pre-publish
-- accept/decline is broken (split out of MYK9-829, found in the Oct 10 rehearsal
-- via MYK9-819).
--
-- shows_select / trials_select / classes_select admit only published/upcoming/
-- in_progress/completed shows to a non-manager caller. judge_assignments already
-- carries an assigned-judge exception on itself (20260912154500) -- "a judge must
-- see an assignment to accept or decline it, which by definition happens before
-- the show publishes" -- but that exception was never extended to the show/trial/
-- class rows the assignment points at, so useJudgeAssignments gets a real
-- judge_assignments row and null trial/class rows and silently drops it.
--
-- FIX, scoped narrowly: an assigned judge (their own judge_assignments row for
-- THIS show, status invited or confirmed) can see that show, its trials and its
-- classes, regardless of the show's status. No broader judge grant -- a judge with
-- no assignment, or a declined/cancelled one, gets nothing new -- and nothing for
-- anon.
--
-- RECURSION HAZARD. A judge exception written as an inline
-- `EXISTS (SELECT 1 FROM public.judge_assignments ja WHERE ja.show_id = shows.id ...)`
-- would be structurally unsafe: judge_assignments has FORCE ROW LEVEL SECURITY
-- (021_force_rls_all_tables.sql) and its own `judge_assignments_select` policy
-- (20260912154500) reads `public.shows` to test the published-show arm. Postgres
-- inlines a referenced table's policies at query-rewrite time, so
--   shows_select -> judge_assignments -> judge_assignments_select -> shows -> shows_select -> ...
-- is a structural cycle, the same class of 42P17 "infinite recursion detected in
-- policy" bug 20260612090000 already hit and fixed once for dogs_select/
-- entries_select. That fix's answer applies unchanged here: move the
-- judge_assignments read into a SECURITY DEFINER function. A function body is
-- opaque to the RLS rewriter (no structural table reference for it to inline), and
-- at runtime the function executes as its owner (postgres), which carries
-- BYPASSRLS -- verified on this project by 20260612090000 and reconfirmed by
-- every SECURITY DEFINER helper since (FORCE ROW LEVEL SECURITY does not defeat
-- BYPASSRLS; it only removes the table-OWNER exemption).
--
-- ANON-PERMISSION HAZARD. shows_select / trials_select / classes_select are today
-- single policies with no `TO` clause, i.e. PUBLIC (anon + authenticated). The
-- helper below has EXECUTE revoked from anon on purpose -- an assigned-judge check
-- is meaningless for a signed-out caller, and 20260912154500's own header
-- documents why handing anon a branch it cannot execute is not just "harmless
-- over-scoping": Postgres does not guarantee OR short-circuit order, so an anon
-- request that reaches a branch calling a function anon lacks EXECUTE on raises
-- 42501 and fails the WHOLE request, not just that branch. 20260912154500 and the
-- same day's armbands fix already solved this exact hazard for judge_assignments
-- and armbands by splitting one PUBLIC policy into an anon-scoped policy and an
-- authenticated-scoped policy. This migration applies that same split to shows,
-- trials and classes: the anon policy keeps today's published-only predicate
-- verbatim, and only the authenticated policy gets the new judge arm.
--
-- InitPlan, not per-row: the helper is STABLE and takes no arguments, so
-- `id IN (SELECT private.get_my_judge_assigned_show_ids())` is a hashed SubPlan
-- evaluated ONCE per statement, not once per row (the same shape
-- 20260612090000's get_my_handled_dog_ids() uses for the same reason).
--
-- Every predicate below is copied from the LATEST migration that defines that
-- policy: shows_select from 20260823190000, trials_select/classes_select from
-- 20260916015300 (an ALTER POLICY migration -- Postgres has no
-- CREATE OR REPLACE POLICY, and ALTER POLICY USING/WITH CHECK replaces the
-- predicate outright rather than merging). Only the TO role list and the new
-- judge arm change; the club-admin/secretary/platform-admin arms and their
-- existing `club_id IS NOT NULL` guards (MYK9-585) are untouched.
--
-- Behavioural coverage: supabase/tests/myk9_833_judge_draft_show_visibility_test.sql
-- (registered in scripts/qa/run-behavioral-sql-tests.sh; runs in CI only).
--
-- No client change is needed: useJudgeAssignments already queries shows/trials/
-- classes by id, it just gets rows back now.
--
-- MIGRATION FILE ONLY. Not pushed to any database by this change; `supabase db
-- push` is still required after merge.

BEGIN;

-- ---------------------------------------------------------------------------
-- Helper: the set of show ids the CALLER is an assigned judge for (invited or
-- confirmed). SECURITY DEFINER + owner BYPASSRLS is what keeps this read
-- structurally invisible to the RLS rewriter and unfiltered by judge_assignments'
-- own FORCE RLS at runtime -- see the header. STABLE + no arguments so the
-- `IN (SELECT ...)` call sites below are each evaluated once per statement.
-- ---------------------------------------------------------------------------
CREATE FUNCTION private.get_my_judge_assigned_show_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT ja.show_id
  FROM public.judge_assignments ja
  WHERE ja.person_id = public.get_my_person_id()
    AND ja.show_id IS NOT NULL
    AND ja.status IN ('invited', 'confirmed')
$$;

COMMENT ON FUNCTION private.get_my_judge_assigned_show_ids() IS
  'MYK9-833: show ids where the caller has an invited or confirmed judge_assignments '
  'row. SECURITY DEFINER to read judge_assignments (FORCE RLS) without inlining its '
  'policies into shows_select/trials_select/classes_select, which would recurse. '
  'authenticated-only: an assigned-judge check is meaningless for anon, and handing '
  'anon a branch it cannot execute 42501s the whole request per 20260912154500.';

REVOKE ALL ON FUNCTION private.get_my_judge_assigned_show_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.get_my_judge_assigned_show_ids() FROM anon;
GRANT EXECUTE ON FUNCTION private.get_my_judge_assigned_show_ids() TO authenticated;

-- ---------------------------------------------------------------------------
-- shows -- split PUBLIC into anon (published-only, unchanged predicate) and
-- authenticated (existing arms + the new judge exception). Latest definition:
-- 20260823190000_admin_soft_deleted_show_visibility.sql.
-- ---------------------------------------------------------------------------
CREATE POLICY shows_anon_select
  ON public.shows FOR SELECT
  TO anon
  USING (
    deleted_at IS NULL
    AND status = ANY (ARRAY['published'::text, 'upcoming'::text, 'in_progress'::text, 'completed'::text])
  );

-- shows_select's own history has always used drop-then-recreate (never ALTER),
-- unlike trials_select/classes_select below -- keep matching its own idiom.
DROP POLICY IF EXISTS shows_select ON public.shows;
CREATE POLICY shows_select
  ON public.shows FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_site_admin())
    OR (
      deleted_at IS NULL
      AND (
        status = ANY (ARRAY['published'::text, 'upcoming'::text, 'in_progress'::text, 'completed'::text])
        OR (club_id IS NOT NULL AND (SELECT public.is_club_admin(shows.club_id)))
        OR (SELECT public.is_show_secretary(shows.id))
        OR id IN (SELECT private.get_my_judge_assigned_show_ids())
      )
    )
  );

-- ---------------------------------------------------------------------------
-- trials -- same split. Latest definition: 20260916015300 (ALTER POLICY;
-- itself copied verbatim from 108_tv_display_anon_access.sql plus the MYK9-585
-- club_id guard).
-- ---------------------------------------------------------------------------
CREATE POLICY trials_anon_select
  ON public.trials FOR SELECT
  TO anon
  USING (
    trials.show_id IN (
      SELECT s.id
      FROM public.shows s
      WHERE s.status IN ('published', 'upcoming', 'in_progress', 'completed')
        AND s.deleted_at IS NULL
    )
  );

ALTER POLICY trials_select ON public.trials
  TO authenticated
  USING (
    trials.show_id IN (
      SELECT s.id
      FROM public.shows s
      WHERE (
          s.status IN ('published', 'upcoming', 'in_progress', 'completed')
          AND s.deleted_at IS NULL
        )
        OR (s.club_id IS NOT NULL AND (SELECT public.is_club_admin(s.club_id)))
        OR (s.club_id IS NOT NULL AND (SELECT public.is_trial_secretary(s.club_id)))
        OR (SELECT public.is_platform_admin())
        OR s.id IN (SELECT private.get_my_judge_assigned_show_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- classes -- same split. Latest definition: 20260916015300 (ALTER POLICY).
-- ---------------------------------------------------------------------------
CREATE POLICY classes_anon_select
  ON public.classes FOR SELECT
  TO anon
  USING (
    classes.deleted_at IS NULL
    AND classes.trial_id IN (
      SELECT t.id
      FROM public.trials t
      JOIN public.shows s ON s.id = t.show_id
      WHERE s.status IN ('published', 'upcoming', 'in_progress', 'completed')
        AND s.deleted_at IS NULL
    )
  );

ALTER POLICY classes_select ON public.classes
  TO authenticated
  USING (
    classes.deleted_at IS NULL
    AND classes.trial_id IN (
      SELECT t.id
      FROM public.trials t
      JOIN public.shows s ON s.id = t.show_id
      WHERE (
          s.status IN ('published', 'upcoming', 'in_progress', 'completed')
          AND s.deleted_at IS NULL
        )
        OR (s.club_id IS NOT NULL AND (SELECT public.is_club_admin(s.club_id)))
        OR (s.club_id IS NOT NULL AND (SELECT public.is_trial_secretary(s.club_id)))
        OR (SELECT public.is_platform_admin())
        OR s.id IN (SELECT private.get_my_judge_assigned_show_ids())
    )
  );

COMMIT;
