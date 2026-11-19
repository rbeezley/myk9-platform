-- =============================================================================
-- MYK9-2199: a durable "this club has published its first show" record, and the
-- one read the secretary home card needs.
--
-- Before this the card guessed from the local show list (and a per-device flag),
-- so a club whose draft had not synced looked brand new, and a club whose show
-- went back to draft saw the card again. Now:
--
--   clubs.first_show_published_at   stamped once, by trigger, the first time any
--                                   of the club's shows is publicly visible
--                                   (private.show_status_is_public). Never
--                                   cleared: unpublishing, cancelling or
--                                   deleting the show keeps it.
--   public.club_first_show_state    {"published_ever": bool, "draft_show_id": uuid|null}
--                                   for the club admin / club trial secretary /
--                                   site admin (the rule club_publish_blockers
--                                   uses). The draft is the newest non-deleted
--                                   draft show.
--
-- clubs has table-level grants only (no column list) and is not read through the
-- replication layer for this value, so no grant or replication change is needed.
-- =============================================================================

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS first_show_published_at timestamptz;

COMMENT ON COLUMN public.clubs.first_show_published_at IS
  'MYK9-2199: when the club first had a publicly visible show (private.show_status_is_public). Stamped once by trg_shows_stamp_club_first_published; never cleared, so the home "first show" card stays gone after a later unpublish, cancel or delete. Null = never published.';

-- ---------------------------------------------------------------------------
-- Trigger: stamp on the first public show
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.stamp_club_first_show_published()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF private.show_status_is_public(NEW.status) THEN
    UPDATE public.clubs
       SET first_show_published_at = now()
     WHERE id = NEW.club_id
       AND first_show_published_at IS NULL;
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION private.stamp_club_first_show_published() IS
  'MYK9-2199: AFTER INSERT OR UPDATE OF status on shows. When the row is publicly visible, stamps clubs.first_show_published_at if still null. SECURITY DEFINER so a club admin''s publish can write the club row regardless of clubs RLS.';

REVOKE ALL ON FUNCTION private.stamp_club_first_show_published() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.stamp_club_first_show_published() FROM anon;
REVOKE ALL ON FUNCTION private.stamp_club_first_show_published() FROM authenticated;

DROP TRIGGER IF EXISTS trg_shows_stamp_club_first_published ON public.shows;
CREATE TRIGGER trg_shows_stamp_club_first_published
  AFTER INSERT OR UPDATE OF status ON public.shows
  FOR EACH ROW
  EXECUTE FUNCTION private.stamp_club_first_show_published();

-- ---------------------------------------------------------------------------
-- Backfill: clubs that already have a public show
-- ---------------------------------------------------------------------------
UPDATE public.clubs c
   SET first_show_published_at = s.first_at
  FROM (
    SELECT sh.club_id, min(sh.created_at) AS first_at
      FROM public.shows sh
     WHERE private.show_status_is_public(sh.status)
     GROUP BY sh.club_id
  ) s
 WHERE c.id = s.club_id
   AND c.first_show_published_at IS NULL;

-- ---------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.club_first_show_state(p_club_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_published timestamptz;
  v_draft uuid;
BEGIN
  IF p_club_id IS NULL THEN
    RAISE EXCEPTION 'p_club_id is required' USING ERRCODE = '22023';
  END IF;

  IF NOT (public.is_club_admin(p_club_id)
          OR public.is_trial_secretary(p_club_id)
          OR public.is_site_admin()) THEN
    RAISE EXCEPTION 'not authorized to read the first-show state for club %', p_club_id
      USING ERRCODE = '42501';
  END IF;

  SELECT c.first_show_published_at INTO v_published
    FROM public.clubs c WHERE c.id = p_club_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'club % not found', p_club_id USING ERRCODE = 'P0002';
  END IF;

  SELECT s.id INTO v_draft
    FROM public.shows s
   WHERE s.club_id = p_club_id
     AND s.status = 'draft'
     AND s.deleted_at IS NULL
   ORDER BY s.created_at DESC, s.id DESC
   LIMIT 1;

  RETURN jsonb_build_object(
    'published_ever', v_published IS NOT NULL,
    'draft_show_id', v_draft);
END;
$$;

COMMENT ON FUNCTION public.club_first_show_state(uuid) IS
  'MYK9-2199: {published_ever, draft_show_id} for the home first-show card. published_ever reads clubs.first_show_published_at (never cleared); draft_show_id is the club''s newest non-deleted draft show or null. Authorized like club_publish_blockers (club admin, club trial secretary or site admin; 42501 otherwise; P0002 for a missing club). Read-only.';

REVOKE ALL ON FUNCTION public.club_first_show_state(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.club_first_show_state(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.club_first_show_state(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.club_first_show_state(uuid) TO authenticated;
