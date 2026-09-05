-- MYK9-402 / SA-2026-09-05-04: get_show_officials publishes a person's ACCOUNT
-- email to cold anonymous callers, for every official role including steward.
--
-- Anon holds EXECUTE deliberately (20260704152531, re-asserted by 20260830240000)
-- so the officials card renders on the public show overview, and the card does
-- render a mailto: link. Publishing the trial secretary's and chairman's contact
-- address is normal for a dog-show premium list and that decision stands.
--
-- The steward arm is not covered by that rationale and never was. 20260830240000
-- says so itself — "Only the secretary and chairman arms move to show_officials"
-- — but show_officials_role_check permits 'steward', and this RPC and the card
-- both treat all three roles identically. A ring steward is a club volunteer, not
-- a name on the paperwork; nothing in the premium list or the AKC/UKC entry forms
-- carries their email. Combined with anon-enumerable show ids, that is a
-- harvestable list of volunteers' personal addresses with no opt-in.
--
-- This RPC is also the ONLY path by which people.email reaches an anonymous
-- caller — people_select is TO authenticated and admits no anon arm — so the
-- 2026-07-29 audit's rejection of "people.email anon column grant, no reachable
-- read path" no longer holds. The path is here.
--
-- Fix: a steward's email is returned only to a caller who can manage the show.
-- Managers invited the steward and need to reach them, so ShowOfficialsEditor is
-- unaffected; anon and unrelated authenticated callers get NULL. Secretary and
-- chairman email is unchanged, so the public card keeps working.
--
-- The return SHAPE is unchanged (same columns, same order, same types), so
-- useShowOfficials, useEntryFormData, export.ts and OfflineReportService need no
-- edit — and of those only the public card reads email at all.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_show_officials(p_show_id uuid)
RETURNS TABLE (user_id uuid, first_name text, last_name text, email text, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    so.person_id AS user_id,
    pe.first_name,
    pe.last_name,
    CASE
      -- Secretary and chairman are the paperwork contacts the premium list
      -- publishes. Unchanged, deliberately public.
      WHEN so.role <> 'steward' THEN pe.email
      -- A steward's address is operational, not published. Managers only, via
      -- the CANONICAL predicate rather than a hand-rolled arm list.
      --
      -- The first draft spelled this out as
      --   is_site_admin() OR is_club_admin(s.club_id) OR is_show_secretary(s.id)
      -- which silently excluded a whole supported role. is_show_secretary
      -- matches r.name = 'secretary' only, while is_trial_secretary — and so
      -- can_manage_show — matches ('secretary', 'trial_secretary'). A
      -- club-scoped TRIAL_SECRETARY would therefore be a show manager everywhere
      -- else in this schema while losing the steward's address here.
      --
      -- Measured before changing it: no such role is SEEDED. public.roles holds
      -- exactly chairman, club_admin, exhibitor, judge, secretary, site_admin,
      -- steward — so is_trial_secretary's 'trial_secretary' arm is dead and the
      -- two predicates select the same people today. This is hardening against
      -- a role name the schema already believes in, not a live exposure, and it
      -- is not behaviourally testable until that role exists. Using the
      -- canonical predicate is also simply less to get wrong. Raised in review
      -- of #2045.
      WHEN (SELECT public.can_manage_show(s.id)) THEN pe.email
      ELSE NULL
    END AS email,
    so.role
  FROM public.show_officials so
  JOIN public.shows s ON s.id = so.show_id
  JOIN public.people pe ON pe.id = so.person_id
  WHERE so.show_id = p_show_id
    AND s.deleted_at IS NULL
    AND (
      s.status IN ('published', 'upcoming', 'in_progress', 'completed')
      OR (s.club_id IS NOT NULL AND (SELECT public.is_club_admin(s.club_id)))
      OR (SELECT public.is_show_secretary(s.id))
      OR (SELECT public.is_site_admin())
    )
    AND pe.deleted_at IS NULL;
$$;

COMMENT ON FUNCTION public.get_show_officials(uuid) IS
  'Who is named on this show''s paperwork, from show_officials. Naming is not a permission; see grant_club_secretary for access. Secretary and chairman email is public (premium-list contact, SA-006 follow-up); steward email is returned only to a caller who can manage the show (MYK9-402).';

-- anon KEEPS execute: the officials card on the public show overview is the
-- reason, and the visible-show gate above is what makes that safe. Restated
-- rather than assumed, because 20260830240000 recorded that the live database
-- had once lost this grant outside of any migration.
REVOKE ALL ON FUNCTION public.get_show_officials(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_show_officials(uuid) TO anon, authenticated;

COMMIT;
