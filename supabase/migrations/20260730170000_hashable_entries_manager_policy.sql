-- MYK9-126: entries_select re-executed can_manage_show(entries.show_id) once
-- per row because the call is correlated on the row's show_id — it cannot be
-- cached as an initplan the way uncorrelated (SELECT auth.uid()) calls were in
-- 20260727130000 (MYK9-111). On the 514-entry G9 fixture that arm alone cost
-- ~295 ms of the 312 ms entries replica query (0.57 ms x 514 rows), and the
-- cost grows linearly with entries per show.
--
-- Fix: invert the question. Instead of "can I manage THIS row's show?" per
-- row, compute "which shows can I manage?" once per statement via a
-- SECURITY DEFINER set-returning function, and test membership. The predicate
-- body is copied verbatim from public.can_manage_show (latest definition,
-- verified against the live catalog 2026-07-30) so row visibility is
-- identical — including entries of draft and soft-deleted shows, which
-- managers can see today because can_manage_show bypasses shows RLS.
-- An inline subquery over public.shows would NOT be equivalent: it would run
-- under shows_select RLS, which filters deleted_at and uses the show-scoped
-- is_show_secretary() instead of the club-scoped is_trial_secretary().
--
-- Measured (rolled-back ALTER POLICY experiment on the live Micro project):
-- entries replica query 311.9 ms -> 10.7 ms for identical 514 rows.

CREATE OR REPLACE FUNCTION public.manageable_show_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT s.id
  FROM public.shows s
  WHERE (SELECT public.is_club_admin(s.club_id))
     OR (SELECT public.is_trial_secretary(s.club_id))
     OR (SELECT public.is_platform_admin());
$$;

COMMENT ON FUNCTION public.manageable_show_ids() IS
  'Set of show ids the current caller can manage. SECURITY DEFINER twin of '
  'can_manage_show(uuid) for RLS policies: membership in this set is '
  'evaluated once per statement as a hashed subplan instead of once per row. '
  'Keep the predicate in lockstep with can_manage_show.';

REVOKE ALL ON FUNCTION public.manageable_show_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manageable_show_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.manageable_show_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.manageable_show_ids() TO service_role;

-- Only the manager arm changes. The handler and dog-owner EXISTS arms are
-- preserved verbatim: they remain correlated per-row lookups, but each is a
-- cheap PK/index probe (no measurable cost in profiling), unlike the per-row
-- can_manage_show call this migration removes.
ALTER POLICY entries_select ON public.entries
  USING (((entries.show_id IN ( SELECT public.manageable_show_ids() )) OR (EXISTS ( SELECT 1
   FROM people p
  WHERE ((p.auth_user_id = ( SELECT auth.uid() )) AND (p.id = entries.handler_id)))) OR (EXISTS ( SELECT 1
   FROM (people p
     JOIN dogs d ON ((d.owner_id = p.id)))
  WHERE ((p.auth_user_id = ( SELECT auth.uid() )) AND (d.id = entries.dog_id))))));
