-- MYK9-854: restore dogs_select / people_select visibility for a SHOW-scoped secretary.
--
-- Symptom: mariana@myk9t.com (secretary) saw only her own dog on /dogs, not the shared
-- directory every secretary is meant to see (20260912171500's explicit intent — see below).
--
-- Root cause: `is_show_manager()` (20260611120000) is:
--
--   SELECT is_site_admin() OR is_trial_secretary() OR is_club_admin();
--
-- calling `is_trial_secretary()` with NO argument. Before 20260830210000
-- (appointment_grants_show_access), that bare call meant "holds an active
-- secretary/trial_secretary row in ANY club, at ANY granularity" — it carried no
-- `show_id` filter at all. 20260830210000 repurposed `is_trial_secretary()` into
-- "holds a CLUB-WIDE appointment" for its own feature (a club appoints a secretary
-- once, for every one of its shows) and added `AND ur.show_id IS NULL` to make that
-- true. That migration deliberately introduced `is_show_secretary(show_id)` /
-- `is_show_official(show_id)` for callers that have a show to check against — but
-- `is_show_manager()` has no show in scope (dogs and people are not show-scoped
-- tables) and was never updated, so it silently inherited the narrower meaning.
--
-- 20260912171500 (scope_unscoped_role_predicates) hit this exact seam from the other
-- side and explicitly chose NOT to touch it:
--   "Also deliberately NOT touched: the argument-less helpers in dogs_select,
--    people_select and judge_certifications_select. Those are the shared-directory
--    reads covered by the 2026-06 deferral above — a secretary must be able to find
--    any dog or person to build an entry."
-- and its own test (myk9_470_scoped_role_predicates_test.sql) asserts, by execution,
-- that a SHOW-scoped secretary satisfies neither the old bare `is_trial_secretary()`
-- nor the new `is_trial_secretary(club_id)` — proving the shared-directory reads lost
-- coverage for exactly the population of secretaries appointed to run one show
-- (the common case) rather than a whole club.
--
-- MYK9-854's owner decision (2026-09-27, on the issue) restates the shared-directory
-- intent directly: a secretary sees ALL non-deleted dogs, the same as a site admin, so
-- she can find any exhibitor's dog when entering a mail-in entry — scoping to "dogs in
-- her shows" is wrong because a dog being mailed in for the first time is in none of
-- them yet.
--
-- Fix: give `is_show_manager()` its own "any secretary, any granularity" helper
-- (`is_any_secretary()`), a byte-for-byte copy of `is_trial_secretary()`'s
-- pre-20260830210000 body, instead of widening `is_trial_secretary()` itself back up
-- and reintroducing the over-broad club-admin/appointment behavior that migration
-- fixed. `is_trial_secretary()`, `trial_secretary_show_ids()`, `is_show_secretary()`,
-- `is_show_official()` and every show/club-scoped policy that depends on them are
-- untouched — this migration touches only `is_show_manager()`'s own body.
--
-- RLS remains the authority; nothing here widens what `anon` can read (both functions
-- stay REVOKEd from `anon`/PUBLIC, matching `is_show_manager()`'s existing grants).
--
-- Uncorrelated/STABLE for the same reason as every other helper in this family
-- (20260611120000, 20260912171500): Postgres hoists a `(SELECT …)` call site into a
-- per-statement InitPlan rather than evaluating it per row.

BEGIN;

-- "Is the caller a secretary/trial_secretary ANYWHERE, at ANY granularity" — the
-- semantics `is_trial_secretary()`'s bare call had before 20260830210000. Named apart
-- from `is_trial_secretary()` so this migration cannot regress that function's now-
-- club-scoped meaning for its own callers (grant_club_secretary, trial_secretary_show_ids,
-- is_show_secretary, is_show_official).
CREATE OR REPLACE FUNCTION public.is_any_secretary()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.auth_user_id = auth.uid()
      AND r.name IN ('secretary', 'trial_secretary')
      AND ur.is_active = true
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  );
$$;

COMMENT ON FUNCTION public.is_any_secretary() IS
  'MYK9-854: true for any active secretary/trial_secretary row, club-wide or show-scoped. '
  'Used only by is_show_manager() for the shared-directory reads (dogs/people) that must see '
  'every secretary regardless of appointment granularity. Do not use for a show- or club-scoped '
  'decision — that is is_trial_secretary()/is_show_secretary()/trial_secretary_show_ids().';

REVOKE ALL ON FUNCTION public.is_any_secretary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_any_secretary() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_any_secretary() TO authenticated;

-- Copied from the LATEST (and only) definition, 20260611120000, with the bare
-- `is_trial_secretary()` call replaced. Same three-role union, same shape.
CREATE OR REPLACE FUNCTION public.is_show_manager()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT public.is_site_admin()
      OR public.is_any_secretary()
      OR public.is_club_admin();
$$;

COMMENT ON FUNCTION public.is_show_manager() IS
  'MYK9-854: platform-wide "is this caller show staff" gate for the shared-directory reads '
  '(dogs_select, people_select, judge_certifications_select) and other unscoped policies that '
  'depend on it. Uses is_any_secretary() (any granularity) rather than is_trial_secretary() '
  '(club-wide only since 20260830210000) so a show-scoped secretary is not excluded.';

-- `CREATE OR REPLACE` does not reset existing grants, so this restates the SAME decision
-- 20260611120000 already made (there, `REVOKE ALL ... FROM public`) rather than changing it —
-- required explicitly here because this migration postdates
-- 20260728120000_advisor_grant_regrowth_guard.sql, so migrationGrantDecisionContract.test.ts
-- checks every function this file creates/replaces for its own anon+authenticated decision.
REVOKE ALL ON FUNCTION public.is_show_manager() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_show_manager() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_show_manager() TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
