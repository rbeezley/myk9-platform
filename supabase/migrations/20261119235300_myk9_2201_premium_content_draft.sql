-- MYK9-2201: the secretary's premium narrative and supplemental edits are kept as a draft on the
-- show whether or not "Generate exhibitor documents on save" is ticked.
--
--   shows.premium_content_draft     jsonb {narratives, supplemental}, null until a draft is saved.
--   shows.premium_content_draft_at  server time of the last draft save (trigger-set, never trusted
--                                   from the client). The premium card compares it with
--                                   published_premium_at to say the published PDF is out of date.
--
-- GRANTS: shows carries table-level grants only (no column ACLs; see 20261114194300), so the new
-- columns inherit them and writes go through the existing shows_update RLS (show managers). No
-- new GRANT is needed. Nothing here is a publication field, so guard_premium_publication_state
-- does not apply: a draft never changes what exhibitors see.

ALTER TABLE public.shows
  ADD COLUMN IF NOT EXISTS premium_content_draft jsonb,
  ADD COLUMN IF NOT EXISTS premium_content_draft_at timestamptz;

ALTER TABLE public.shows
  DROP CONSTRAINT IF EXISTS shows_premium_content_draft_object_check;
ALTER TABLE public.shows
  ADD CONSTRAINT shows_premium_content_draft_object_check
  CHECK (premium_content_draft IS NULL OR jsonb_typeof(premium_content_draft) = 'object');

COMMENT ON COLUMN public.shows.premium_content_draft IS
  'MYK9-2201: the secretary''s saved premium narratives and supplemental fields, not yet published. Republish premium publishes it.';
COMMENT ON COLUMN public.shows.premium_content_draft_at IS
  'MYK9-2201: server time the premium draft was last saved. Newer than published_premium_at means the published premium is out of date.';

CREATE OR REPLACE FUNCTION public.stamp_premium_content_draft_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.premium_content_draft IS DISTINCT FROM OLD.premium_content_draft THEN
    NEW.premium_content_draft_at := CASE
      WHEN NEW.premium_content_draft IS NULL THEN NULL
      ELSE now()
    END;
  ELSE
    NEW.premium_content_draft_at := OLD.premium_content_draft_at;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_premium_content_draft_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS stamp_premium_content_draft_at ON public.shows;
CREATE TRIGGER stamp_premium_content_draft_at
BEFORE UPDATE OF premium_content_draft, premium_content_draft_at ON public.shows
FOR EACH ROW EXECUTE FUNCTION public.stamp_premium_content_draft_at();
