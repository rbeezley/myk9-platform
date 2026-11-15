-- MYK9-2045: the club's Officers list accepts a typed name for someone with no account, and
-- the show's premium (PDF and public page) prints that list.
--
-- 1. club_officers.person_id becomes nullable and display_name holds the typed name. Exactly
--    one of the two is set, so an officer is either a person with an account (as before) or a
--    typed name, never both and never neither. A title grants nothing: no role or permission
--    reads this table.
-- 2. A typed name is unique per club and position, the same rule UNIQUE(club_id, person_id,
--    position) already applies to a linked person (a NULL person_id never collides there).
-- 3. get_show_club_officers(show) publishes the host club's officers (title and name only, no
--    email) for a show that is publicly visible, so the signed-out landing page and the
--    premium generator read the one list without admitting anon rows on club_officers.
--    Same show-status gate as get_show_judges / get_show_officials.
--
-- No table is created, so no table GRANT is added: the existing policies (club admin or site
-- admin may select, insert, update and delete) and grants (authenticated CRUD, anon revoked by
-- 20260730220000) cover the new column unchanged. The new function carries its own GRANTs.

BEGIN;

ALTER TABLE public.club_officers
  ALTER COLUMN person_id DROP NOT NULL,
  ADD COLUMN display_name text;

ALTER TABLE public.club_officers
  ADD CONSTRAINT club_officers_person_or_name_check CHECK (
    (person_id IS NOT NULL AND display_name IS NULL)
    OR (
      person_id IS NULL
      AND display_name IS NOT NULL
      AND btrim(display_name) <> ''
      AND char_length(display_name) <= 120
    )
  );

CREATE UNIQUE INDEX club_officers_typed_name_unique
  ON public.club_officers (club_id, lower(btrim(display_name)), position)
  WHERE person_id IS NULL;

CREATE OR REPLACE FUNCTION public.get_show_club_officers(p_show_id uuid)
RETURNS TABLE ("position" text, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    co.position AS "position",
    COALESCE(
      NULLIF(btrim(concat_ws(' ', pe.first_name, pe.last_name)), ''),
      btrim(co.display_name)
    ) AS name
  FROM public.shows s
  JOIN public.clubs c ON c.id = s.club_id AND c.deleted_at IS NULL
  JOIN public.club_officers co ON co.club_id = c.id
  LEFT JOIN public.people pe ON pe.id = co.person_id AND pe.deleted_at IS NULL
  WHERE s.id = p_show_id
    AND s.deleted_at IS NULL
    AND (
      s.status IN ('published', 'upcoming', 'in_progress', 'completed')
      OR (SELECT public.is_club_admin(s.club_id))
      OR (SELECT public.is_show_secretary(s.id))
      OR (SELECT public.is_site_admin())
    )
    AND COALESCE(
      NULLIF(btrim(concat_ws(' ', pe.first_name, pe.last_name)), ''),
      btrim(co.display_name)
    ) IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_show_club_officers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_show_club_officers(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_show_club_officers(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_show_club_officers(uuid) TO service_role;

COMMENT ON FUNCTION public.get_show_club_officers(uuid) IS
  'MYK9-2045: the host club''s officers (position and name, no email) for one show, for the '
  'premium list and the public landing page. SECURITY DEFINER with the get_show_judges '
  'show-status gate, so a signed-out caller reaches only published/upcoming/in_progress/'
  'completed shows. Do not replace with an anon policy on club_officers.';

NOTIFY pgrst, 'reload schema';

COMMIT;
