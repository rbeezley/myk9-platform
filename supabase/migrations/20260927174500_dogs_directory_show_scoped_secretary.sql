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
-- MYK9-854's owner decision (2026-09-27, on the issue) restates the shared-directory
-- intent directly: a secretary sees ALL non-deleted dogs, the same as a site admin, so
-- she can find any exhibitor's dog when entering a mail-in entry — scoping to "dogs in
-- her shows" is wrong because a dog being mailed in for the first time is in none of
-- them yet.
--
-- RESTRUCTURED 2026-09-27 (second Codex review round on PR #2579, P1). A first draft of
-- this migration fixed the symptom by widening `is_show_manager()` itself: give it its
-- own `is_any_secretary()` arm instead of the (now club-scoped) `is_trial_secretary()`.
-- That is the WRONG shape — `is_show_manager()` is not a dogs/people-local helper, it is
-- the shared "is this caller show staff" gate for ~30 policies and SECURITY DEFINER
-- functions across the schema (user_roles_select in 20260910014500, entries,
-- judge_assignments, achievements, people_private, armbands, clubs, show_templates, and
-- more). Widening it would have handed a SHOW-scoped secretary every one of those
-- surfaces — not just the dog/person directory MYK9-854 actually asked for.
--
-- Fix, this time: leave `is_show_manager()` exactly as 20260611120000 defined it — this
-- migration does not CREATE OR REPLACE it and does not restate its grants. Add a new,
-- narrowly-named helper, `can_read_dog_directory()`, used ONLY by the two policies that
-- need the shared-directory read: `dogs_select` and `people_select`. `dog_registrations`
-- is NOT edited here — `dog_registrations_select` (20260725150000) is
-- `EXISTS (SELECT 1 FROM public.dogs d WHERE d.id = dog_registrations.dog_id)` with no
-- SECURITY DEFINER and no BYPASSRLS, so it already runs dogs_select's RLS as the calling
-- role; widening dogs_select widens this policy transitively, with no text change needed.
-- `is_trial_secretary()`, `trial_secretary_show_ids()`, `is_show_secretary()`,
-- `is_show_official()`, `is_show_manager()` and every policy/function that calls it are
-- untouched by this migration.
--
-- RLS remains the authority; nothing here widens what `anon` can read (both new/reused
-- functions stay REVOKEd from `anon`/PUBLIC).
--
-- Uncorrelated/STABLE for the same reason as every other helper in this family
-- (20260611120000, 20260912171500): Postgres hoists a `(SELECT …)` call site into a
-- per-statement InitPlan rather than evaluating it per row.

BEGIN;

-- "Is the caller a secretary/trial_secretary ANYWHERE, at ANY granularity" — the
-- semantics `is_trial_secretary()`'s bare call had before 20260830210000. Named apart
-- from `is_trial_secretary()` so this migration cannot regress that function's now-
-- club-scoped meaning for its own callers (grant_club_secretary, trial_secretary_show_ids,
-- is_show_secretary, is_show_official), and apart from `is_show_manager()` so this
-- migration cannot widen the ~30 other policies/functions that already depend on it.
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
  'Used only by can_read_dog_directory() for the shared-directory reads (dogs/people) that '
  'must see every secretary regardless of appointment granularity. Do not use for a show- or '
  'club-scoped decision — that is is_trial_secretary()/is_show_secretary()/'
  'trial_secretary_show_ids(). Do not fold into is_show_manager() — that helper backs ~30 '
  'other policies/functions this fix must not widen.';

REVOKE ALL ON FUNCTION public.is_any_secretary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_any_secretary() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_any_secretary() TO authenticated;

-- Narrow, dogs/people-directory-only gate: everything is_show_manager() already admits,
-- PLUS a show-scoped secretary. Deliberately NOT folded into is_show_manager() itself —
-- see the migration header. `is_show_manager()` is untouched, still `is_site_admin() OR
-- is_trial_secretary() OR is_club_admin()` exactly as 20260611120000 left it.
CREATE OR REPLACE FUNCTION public.can_read_dog_directory()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT public.is_show_manager()
      OR public.is_any_secretary();
$$;

COMMENT ON FUNCTION public.can_read_dog_directory() IS
  'MYK9-854: gate for the shared dog/person directory a secretary needs to key in a '
  'mail-in entry (dogs_select, people_select ONLY). is_show_manager() OR any-granularity '
  'secretary. Do not reuse elsewhere — every other is_show_manager() caller (entries, '
  'judge_assignments, people_private, user_roles_select, clubs, and ~25 more) must keep '
  'is_show_manager()''s existing, narrower (club-wide-secretary) meaning.';

REVOKE ALL ON FUNCTION public.can_read_dog_directory() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_dog_directory() FROM anon;
GRANT EXECUTE ON FUNCTION public.can_read_dog_directory() TO authenticated;

-- dogs_select: same four arms as 20260612090000 (latest definition), with its
-- `is_show_manager()` term swapped for `can_read_dog_directory()`. Owner/co-owner/
-- handler arms are byte-for-byte unchanged.
DROP POLICY IF EXISTS dogs_select ON public.dogs;
CREATE POLICY dogs_select ON public.dogs
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      owner_id      = (SELECT public.get_my_person_id())
      OR co_owner_id = (SELECT public.get_my_person_id())
      OR (SELECT public.can_read_dog_directory())
      OR id IN (SELECT public.get_my_handled_dog_ids())
    )
  );

-- Restates the comment 20260725170000 attached to this policy — DROP POLICY /
-- CREATE POLICY drops any comment on the old policy object, this is not optional.
COMMENT ON POLICY dogs_select ON public.dogs IS
  'MYK9-93: TO authenticated — anon matches zero rows. anon holds a column-scoped '
  'SELECT grant purely so PostgREST embeds (TV board, public show detail) return an '
  'empty embed instead of 42501; it conveys no data on its own.';

-- people_select: same two arms as 20260611120000 (latest definition), with its
-- `is_show_manager()` term swapped for `can_read_dog_directory()`.
DROP POLICY IF EXISTS people_select ON public.people;
CREATE POLICY people_select ON public.people
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      auth_user_id = (SELECT auth.uid())
      OR (SELECT public.can_read_dog_directory())
    )
  );

-- Restates the comment 20260725180000 attached to this policy — see dogs_select above.
COMMENT ON POLICY people_select ON public.people IS
  'MYK9-93: TO authenticated — anon matches zero rows. anon holds a column-scoped '
  'SELECT grant (id, first_name, last_name, email) solely so PostgREST embeds on the '
  'public show pages resolve to null instead of 42501. Widening this policy to admit '
  'anon would expose judge email addresses — re-scope the grant first.';

NOTIFY pgrst, 'reload schema';

COMMIT;
