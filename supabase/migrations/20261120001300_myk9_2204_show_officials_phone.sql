-- MYK9-2204: the premium must print the secretary's and chair's CURRENT phone, not the draft's.
-- get_show_officials gains `phone`, returned for secretary and chairman only to a caller who can
-- manage the show (the same can_manage_show gate as the steward email); anon and everyone else get
-- NULL. Changing RETURNS TABLE needs a DROP, which also drops the grants, so they are restated
-- exactly as 20261119214300_myk9_2065_official_premium_mailing_address.sql left them. Body and
-- gates are copied from that file (the latest definition); the only change is the new column.

DROP FUNCTION IF EXISTS public.get_show_officials(uuid);

CREATE FUNCTION public.get_show_officials(p_show_id uuid)
RETURNS TABLE (
  user_id uuid,
  first_name text,
  last_name text,
  email text,
  role text,
  premium_mailing_address text,
  phone text
)
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
      WHEN (SELECT public.can_manage_show(s.id)) THEN pe.email
      ELSE NULL
    END AS email,
    so.role,
    -- Printed on the premium, so only the two roles the premium names carry it.
    CASE WHEN so.role <> 'steward' THEN so.premium_mailing_address ELSE NULL END
      AS premium_mailing_address,
    -- MYK9-2204: the premium prints the official's CURRENT phone, read at publish time by a
    -- manager. Never public through this RPC (the premium carries it once published), and a
    -- steward's is never returned.
    CASE
      WHEN so.role <> 'steward' AND (SELECT public.can_manage_show(s.id)) THEN pe.phone
      ELSE NULL
    END AS phone
  FROM public.show_officials so
  JOIN public.shows s ON s.id = so.show_id
  JOIN public.people pe ON pe.id = so.person_id
  WHERE so.show_id = p_show_id
    AND s.deleted_at IS NULL
    AND (
      s.status IN ('published', 'upcoming', 'in_progress', 'completed')
      OR (SELECT public.is_club_admin(s.club_id))
      OR (SELECT public.is_show_secretary(s.id))
      OR (SELECT public.is_site_admin())
    )
    AND pe.deleted_at IS NULL;
$$;

COMMENT ON FUNCTION public.get_show_officials(uuid) IS
  'Who is named on this show''s paperwork, from show_officials. Naming is not a permission; see grant_club_secretary for access. Secretary and chairman email and premium_mailing_address are public (premium-list contact, SA-006 follow-up, MYK9-2065); steward email is returned only to a caller who can manage the show (MYK9-402). Secretary and chairman phone is returned only to a caller who can manage the show, so a publish prints the current number (MYK9-2204).';

REVOKE ALL ON FUNCTION public.get_show_officials(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_show_officials(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_show_officials(uuid) TO authenticated, service_role;
