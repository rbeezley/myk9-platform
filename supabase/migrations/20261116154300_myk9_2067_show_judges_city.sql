-- MYK9-2067: the premium prints each judge's city and state of residence (AKC Ch. 3 §15).
--
-- get_show_judges gains `city` and `state` from people, and nothing else: no street, zip, email
-- or phone. Changing RETURNS TABLE needs a DROP, which also drops the grants, so they are
-- restated below exactly as 20261004181900_myk9_1008_show_requires_club.sql left them.
--
-- The only SQL caller is get_shows_judges (20261027213700), a plpgsql function that names its
-- columns, so it keeps working and keeps returning the old shape. Its body is not stored as a
-- dependency, so the DROP does not need CASCADE.
--
-- Body, gate, SECURITY DEFINER and search_path are copied unchanged from
-- 20261004181900_myk9_1008_show_requires_club.sql.

DROP FUNCTION public.get_show_judges(uuid);

CREATE FUNCTION public.get_show_judges(p_show_id uuid)
RETURNS TABLE(
  assignment_id uuid,
  person_id uuid,
  first_name text,
  last_name text,
  trial_id uuid,
  class_id uuid,
  status text,
  city text,
  state text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    ja.id AS assignment_id,
    ja.person_id,
    pe.first_name,
    pe.last_name,
    ja.trial_id,
    ja.class_id,
    ja.status,
    pe.city,
    pe.state
  FROM public.judge_assignments ja
  JOIN public.shows s ON s.id = ja.show_id
  JOIN public.people pe ON pe.id = ja.person_id
  WHERE ja.show_id = p_show_id
    AND s.deleted_at IS NULL
    -- Same gate as get_show_officials, and the same set MYK9-469 made anon-visible on
    -- judge_assignments itself, so the RPC cannot expose a show the table would have hidden.
    AND (
      s.status IN ('published', 'upcoming', 'in_progress', 'completed')
      OR (SELECT public.is_club_admin(s.club_id))
      OR (SELECT public.is_show_secretary(s.id))
      OR (SELECT public.is_site_admin())
    )
    AND pe.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.get_show_judges(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_show_judges(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_show_judges(uuid) TO authenticated, service_role;
