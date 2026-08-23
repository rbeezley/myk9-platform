-- MYK9-233 — make shows_select and manageable_show_ids() agree about soft-deleted shows.
--
-- INTENDED SEMANTICS (product decision, 2026-08-23):
--   A site admin CAN see soft-deleted shows and their entries. Everyone else cannot.
--
-- Why: money is the forcing case. A soft-deleted show that took online entries still
-- represents a real platform liability to the club. Before this migration the two rules
-- disagreed, and the disagreement pointed the wrong way:
--
--   shows_select      ANDed (deleted_at IS NULL) OUTSIDE the whole OR group, so the
--                     is_site_admin() arm did not exempt anything -- an admin could not
--                     see a soft-deleted show at all.
--   manageable_show_ids()  is SECURITY DEFINER and never restated the filter, so
--                     shows_select never applied to the rows it reads and entries_select
--                     handed the admin the ENTRIES of a show they could not see.
--
-- Net effect: an admin saw entry money with no show to attribute it to. usePlatformPayoutLedger
-- maps over the shows it resolved, not over the entries it read, so every unresolvable show's
-- collected/refunded/net cents silently left both the table and the summary totals.
--
-- After this migration the two rules state the SAME sentence, in both directions:
--   * site admin  -> deleted and live shows, and their entries
--   * anyone else -> live shows only, and only their entries
--
-- Verified reachable-but-not-firing before the change: 0 soft-deleted shows on staging.

begin;

-- 1. shows_select: lift the site-admin arm OUT of the deleted_at gate.
--    Note this policy has no TO clause -- it applies to PUBLIC, anon included. The
--    deleted_at guard must therefore stay wrapped around every non-admin arm, which is
--    why the filter is repeated inside rather than dropped.
drop policy if exists shows_select on public.shows;
create policy shows_select
  on public.shows for select
  using (
    (select public.is_site_admin())
    or (
      deleted_at is null
      and (
        status = any (array['published'::text, 'upcoming'::text, 'in_progress'::text, 'completed'::text])
        or (club_id is not null and (select public.is_club_admin(shows.club_id)))
        or (select public.is_show_secretary(shows.id))
      )
    )
  );

-- 2. manageable_show_ids(): restate the filter the calling policy applies.
--    SECURITY DEFINER means shows_select never runs against these rows, so the predicate
--    has to be written out here or it does not exist. Site admin bypasses; every other
--    arm is gated, which is what makes this function agree with the policy above.
create or replace function public.manageable_show_ids()
 returns setof uuid
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  SELECT s.id
  FROM public.shows s
  WHERE (SELECT public.is_site_admin())
     OR (
       s.deleted_at IS NULL
       AND (
            (SELECT public.is_club_admin(s.club_id))
         OR (SELECT public.is_trial_secretary(s.club_id))
         OR EXISTS (
              SELECT 1
              FROM public.user_roles ur
              JOIN public.roles r ON r.id = ur.role_id
              WHERE ur.auth_user_id = auth.uid()
                AND r.name = 'secretary'
                AND ur.show_id = s.id
                AND ur.is_active = true
                AND (ur.expires_at IS NULL OR ur.expires_at > now())
            )
       )
     );
$function$;

-- Restate the function's EXECUTE decision explicitly. CREATE OR REPLACE preserves
-- the existing ACL, so these change nothing at runtime -- they exist because a
-- silent inheritance is exactly how an unintended grant survives review, and the
-- migration grant-decision contract requires every public function to state one.
-- Matches the applied ACL verified before this migration:
--   anon = no EXECUTE, authenticated = EXECUTE, service_role = EXECUTE.
revoke all on function public.manageable_show_ids() from public;
revoke all on function public.manageable_show_ids() from anon;
grant execute on function public.manageable_show_ids() to authenticated;
grant execute on function public.manageable_show_ids() to service_role;

commit;
