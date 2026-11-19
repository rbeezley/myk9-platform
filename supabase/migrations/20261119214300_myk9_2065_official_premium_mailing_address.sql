-- MYK9-2065: the premium prints a mailing address for the Trial Secretary and the Trial Chair
-- (AKC Ch. 3 §15). Owner decision 2026-11-17: it is its own field on the show's official, empty
-- until the club types one (a PO box, the club's address, or a home address by choice). A
-- person's profile address never prints.
--
-- 1. show_officials.premium_mailing_address, free text, multi-line allowed. The table keeps its
--    table-level grants; no new GRANT is needed for a column.
-- 2. get_show_officials returns it for secretary and chairman only (the premium is read signed
--    out, so the address is public by the club's own choice). Changing RETURNS TABLE needs a
--    DROP, which also drops the grants, so they are restated exactly as
--    20261004181900_myk9_1008_show_requires_club.sql left them. Body and gate are copied from
--    that file; the only change is the new column. No other SQL function
--    names get_show_officials.
-- 3. set_show_official_mailing_address, because direct writes to show_officials are site-admin
--    only. Authorization is copied from revoke_show_official.

ALTER TABLE public.show_officials
  ADD COLUMN IF NOT EXISTS premium_mailing_address text;

ALTER TABLE public.show_officials
  DROP CONSTRAINT IF EXISTS show_officials_premium_mailing_address_length;

ALTER TABLE public.show_officials
  ADD CONSTRAINT show_officials_premium_mailing_address_length
  CHECK (premium_mailing_address IS NULL OR char_length(premium_mailing_address) <= 500);

COMMENT ON COLUMN public.show_officials.premium_mailing_address IS
  'MYK9-2065: the mailing address the premium prints under this official (secretary, chairman). Typed by the club, never copied from people. Public once the show is published.';

DROP FUNCTION IF EXISTS public.get_show_officials(uuid);

CREATE FUNCTION public.get_show_officials(p_show_id uuid)
RETURNS TABLE (
  user_id uuid,
  first_name text,
  last_name text,
  email text,
  role text,
  premium_mailing_address text
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
      AS premium_mailing_address
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
  'Who is named on this show''s paperwork, from show_officials. Naming is not a permission; see grant_club_secretary for access. Secretary and chairman email and premium_mailing_address are public (premium-list contact, SA-006 follow-up, MYK9-2065); steward email is returned only to a caller who can manage the show (MYK9-402).';

REVOKE ALL ON FUNCTION public.get_show_officials(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_show_officials(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_show_officials(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_show_official_mailing_address(
  p_show_id uuid,
  p_role_name text,
  p_person_id uuid,
  p_address text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_club_id uuid;
  v_address text := nullif(btrim(coalesce(p_address, '')), '');
BEGIN
  IF p_role_name IS NULL OR p_role_name NOT IN ('secretary', 'chairman') THEN
    RAISE EXCEPTION 'only the secretary and chairman carry a premium mailing address'
      USING ERRCODE = '22023';
  END IF;

  SELECT s.club_id INTO v_club_id FROM public.shows s WHERE s.id = p_show_id;
  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'show not found' USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.is_site_admin()
    OR public.is_club_admin(v_club_id)
    OR public.is_trial_secretary(v_club_id)
  ) THEN
    RAISE EXCEPTION 'not authorized to change officials on this show' USING ERRCODE = '42501';
  END IF;

  IF v_address IS NOT NULL AND char_length(v_address) > 500 THEN
    RAISE EXCEPTION 'mailing address is too long' USING ERRCODE = '22001';
  END IF;

  UPDATE public.show_officials
  SET premium_mailing_address = v_address
  WHERE show_id = p_show_id
    AND role = p_role_name
    AND person_id = p_person_id;

  -- The tab that sent this may be showing someone who has since been replaced: write nothing.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This official was changed by someone else. Reload to see who it is now.'
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.set_show_official_mailing_address(uuid, text, uuid, text) IS
  'MYK9-2065: sets the mailing address the premium prints for one named secretary or chairman of the show (the person the caller is looking at; a replaced official writes nothing). Empty clears it. Same authorization as revoke_show_official.';

REVOKE ALL ON FUNCTION public.set_show_official_mailing_address(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_show_official_mailing_address(uuid, text, uuid, text) TO authenticated;
