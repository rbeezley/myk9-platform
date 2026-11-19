-- =============================================================================
-- MYK9-2054 (plan-premium-completeness phase 5, owner decisions 5 and 6 on MYK9-1952):
--
--   1. A club's own premium. A club that ticks "We publish our own premium list" can upload
--      its PDF or paste a link. An uploaded PDF reuses the existing premium pipeline (private
--      `premium-published` bucket, `published_premium_path/url/at`, `get-premium-download`),
--      so the public page's "Download premium" needs no second download path. A link is the
--      new column `shows.own_premium_link`, read straight off the show row.
--   2. "Unpublish": takes down the PDF (generated or uploaded), the club's link and the
--      public announcement (the experience snapshot). Touches no entry.
--   3. The "Public landing page" switch goes: `shows.uses_landing_page` is dropped.
--
-- READERS OF uses_landing_page, grepped before dropping: supabase/ holds only its own ADD
-- COLUMN in 20261104014300_myk9_1685_show_uses_switches.sql. The only objects typed on the
-- shows row are get_deleted_shows / restore_show (RETURNS SETOF public.shows, which follows the
-- table) and the replication views, which list their shows columns explicitly. No view,
-- function, policy or trigger reads the column, so nothing needs re-creating. The columns that
-- remain in the BEFORE UPDATE trigger comparisons (to_jsonb(OLD) - ...) are whole-row and
-- unaffected.
--
-- WRITE PATH. Publication state is writable only by SECURITY DEFINER functions (the
-- guard_premium_publication_state trigger refuses any other writer). The guard below is the
-- LATEST definition (20260922221849_myk9_694_atomic_premium_publish.sql, its only one) with
-- ONE addition: an UPDATE that leaves every published_premium_* column NULL passes. Without
-- it the "Legacy premium state is read-only" refusal blocks clearing the url/at columns, and
-- unpublish could never run. A non-postgres writer is still refused by the first block.
--
-- GRANTS. No new table, and shows has table-level SELECT for anon and authenticated (no column
-- allowlist), so the new column is readable exactly like its siblings. A column-level GRANT here
-- would turn shows into a column-allowlisted table, which it is not. It is written only through
-- set_own_premium (SECURITY DEFINER), never by a client UPDATE: the guard trigger above refuses
-- any other writer, like the published_premium_* columns.
-- =============================================================================

BEGIN;

ALTER TABLE public.shows
  ADD COLUMN IF NOT EXISTS own_premium_link text;

ALTER TABLE public.shows
  DROP CONSTRAINT IF EXISTS shows_own_premium_link_format;
ALTER TABLE public.shows
  ADD CONSTRAINT shows_own_premium_link_format
  CHECK (own_premium_link IS NULL OR (own_premium_link ~* '^https?://[^[:space:]]+$' AND length(own_premium_link) <= 2000));

COMMENT ON COLUMN public.shows.own_premium_link IS
  'MYK9-2054: the club''s own premium list as an http(s) link (publishes_own_premium). Public: the show''s landing page offers it as "Download premium". Written only by public.set_own_premium; cleared by set_own_premium (upload) and public.unpublish_premium.';

-- ---------------------------------------------------------------------------
-- The guard: latest definition plus the "all cleared" pass-through.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_premium_publication_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_user <> 'postgres'
       AND (
         NEW.published_premium_path IS NOT NULL
         OR NEW.published_premium_url IS NOT NULL
         OR NEW.published_premium_at IS NOT NULL
         OR NEW.premium_publish_version IS DISTINCT FROM 0
         OR NEW.published_premium_version IS NOT NULL
         OR NEW.experience_is_published IS DISTINCT FROM false
         OR NEW.experience_published_at IS NOT NULL
         OR NEW.experience_published_style IS NOT NULL
         OR NEW.experience_published_content IS DISTINCT FROM '{}'::jsonb
         OR NEW.own_premium_link IS NOT NULL
       ) THEN
      RAISE EXCEPTION 'Shows must begin without published premium state';
    END IF;
    RETURN NEW;
  END IF;

  IF current_user <> 'postgres'
     AND (
       NEW.published_premium_path IS DISTINCT FROM OLD.published_premium_path
       OR NEW.published_premium_url IS DISTINCT FROM OLD.published_premium_url
       OR NEW.published_premium_at IS DISTINCT FROM OLD.published_premium_at
       OR NEW.premium_publish_version IS DISTINCT FROM OLD.premium_publish_version
       OR NEW.published_premium_version IS DISTINCT FROM OLD.published_premium_version
       OR NEW.experience_is_published IS DISTINCT FROM OLD.experience_is_published
       OR NEW.experience_published_at IS DISTINCT FROM OLD.experience_published_at
       OR NEW.experience_published_style IS DISTINCT FROM OLD.experience_published_style
       OR NEW.experience_published_content IS DISTINCT FROM OLD.experience_published_content
       OR NEW.own_premium_link IS DISTINCT FROM OLD.own_premium_link
     ) THEN
    RAISE EXCEPTION 'Premium publication state may be changed only by the publication RPC';
  END IF;

  -- MYK9-2054: ONE rule, shared with the public page: the club's own link is in force only while
  -- the show publishes its own premium (publishes_own_premium), and a generated PDF supersedes it.
  -- Any writer that commits a different published_premium_path (publish_premium_artifact included)
  -- therefore clears the link here, so the page never serves a stale link next to a new PDF.
  IF NEW.published_premium_path IS NOT NULL
     AND NEW.published_premium_path IS DISTINCT FROM OLD.published_premium_path THEN
    NEW.own_premium_link := NULL;
  END IF;

  -- MYK9-2054: unpublished (or never published). Every published_premium_* column is empty, so
  -- there is no path/url pair to validate and nothing legacy to protect.
  IF NEW.published_premium_path IS NULL
     AND NEW.published_premium_url IS NULL
     AND NEW.published_premium_at IS NULL
     AND NEW.published_premium_version IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.published_premium_path IS NOT NULL THEN
    IF NEW.published_premium_path !~* (
      '^' || NEW.id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$'
    ) THEN
      RAISE EXCEPTION 'Invalid premium artifact path';
    END IF;
    IF NEW.published_premium_url IS NULL OR NEW.published_premium_url NOT IN (
      'https://sojmvhhwsjxmfistvzbe.supabase.co/storage/v1/object/public/premium-published/' || NEW.published_premium_path,
      'http://127.0.0.1:54321/storage/v1/object/public/premium-published/' || NEW.published_premium_path
    ) THEN
      RAISE EXCEPTION 'Premium URL does not match the trusted artifact path';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.published_premium_url IS DISTINCT FROM OLD.published_premium_url
     OR NEW.published_premium_at IS DISTINCT FROM OLD.published_premium_at THEN
    RAISE EXCEPTION 'Legacy premium state is read-only after private cutover';
  END IF;

  IF NEW.published_premium_path IS DISTINCT FROM OLD.published_premium_path
     OR NEW.published_premium_url IS DISTINCT FROM OLD.published_premium_url THEN
    RAISE EXCEPTION 'Premium URL and artifact path must be committed together';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_premium_publication_state() FROM PUBLIC, anon, authenticated;

-- The trigger fires only on the listed columns, so own_premium_link joins its list.
DROP TRIGGER IF EXISTS premium_publication_state_guard ON public.shows;
CREATE TRIGGER premium_publication_state_guard
BEFORE INSERT OR UPDATE OF
  published_premium_url,
  published_premium_at,
  published_premium_path,
  premium_publish_version,
  published_premium_version,
  experience_is_published,
  experience_published_at,
  experience_published_style,
  experience_published_content,
  own_premium_link
ON public.shows
FOR EACH ROW EXECUTE FUNCTION public.guard_premium_publication_state();

-- ---------------------------------------------------------------------------
-- set_own_premium: the club's own premium, as an uploaded PDF OR a link (exactly one).
-- Replaces whatever premium was there, generated or not.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_own_premium(
  p_show_id uuid,
  p_link text DEFAULT NULL,
  p_storage_path text DEFAULT NULL,
  p_public_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_version bigint;
  v_publishes_own boolean;
BEGIN
  IF NOT (
    coalesce((SELECT public.can_manage_show(p_show_id)), false)
    OR coalesce((SELECT public.is_show_secretary(p_show_id)), false)
    OR coalesce((SELECT public.is_platform_admin()), false)
  ) THEN
    RAISE EXCEPTION 'Not authorized to publish this show' USING ERRCODE = '42501';
  END IF;

  IF (p_link IS NULL) = (p_storage_path IS NULL) THEN
    RAISE EXCEPTION 'Give either a link or an uploaded file, not both and not neither'
      USING ERRCODE = '22023';
  END IF;

  SELECT publishes_own_premium INTO v_publishes_own
    FROM public.shows WHERE id = p_show_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Premium publication found no show row' USING ERRCODE = 'P0002';
  END IF;
  IF v_publishes_own IS NOT TRUE THEN
    RAISE EXCEPTION 'This show has not chosen to publish its own premium list'
      USING ERRCODE = '22023';
  END IF;

  IF p_link IS NOT NULL THEN
    IF p_link !~* '^https?://[^[:space:]]+$' OR length(p_link) > 2000 THEN
      RAISE EXCEPTION 'The premium link must be a web address starting with http:// or https://'
        USING ERRCODE = '22023';
    END IF;
    UPDATE public.shows
       SET own_premium_link = p_link,
           premium_publish_version = premium_publish_version + 1,
           published_premium_path = NULL,
           published_premium_url = NULL,
           published_premium_at = NULL,
           published_premium_version = NULL
     WHERE id = p_show_id;
    RETURN;
  END IF;

  IF p_storage_path !~* (
    '^' || p_show_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$'
  ) THEN
    RAISE EXCEPTION 'Invalid premium artifact path' USING ERRCODE = '22023';
  END IF;

  IF p_public_url IS NULL OR p_public_url NOT IN (
    'https://sojmvhhwsjxmfistvzbe.supabase.co/storage/v1/object/public/premium-published/' || p_storage_path,
    'http://127.0.0.1:54321/storage/v1/object/public/premium-published/' || p_storage_path
  ) THEN
    RAISE EXCEPTION 'Premium URL does not match the trusted artifact path' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM storage.objects
     WHERE bucket_id = 'premium-published'
       AND name = p_storage_path
       AND coalesce(metadata->>'mimetype', metadata->>'contentType') = 'application/pdf'
       AND coalesce((metadata->>'size')::bigint, 0) BETWEEN 1 AND 26214400
  ) THEN
    RAISE EXCEPTION 'Premium artifact is not a PDF staged for this show' USING ERRCODE = '22023';
  END IF;

  UPDATE public.shows
     SET premium_publish_version = premium_publish_version + 1
   WHERE id = p_show_id
   RETURNING premium_publish_version INTO v_version;

  UPDATE public.shows
     SET published_premium_path = p_storage_path,
         published_premium_url = p_public_url,
         published_premium_at = clock_timestamp(),
         published_premium_version = v_version,
         own_premium_link = NULL
   WHERE id = p_show_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_own_premium(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_own_premium(uuid, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.set_own_premium(uuid, text, text, text) IS
  'MYK9-2054: record the club''s own premium list, as an uploaded PDF (p_storage_path + p_public_url, staged in premium-published like a generated one) or an http(s) link (p_link): exactly one. Replaces the other kind and any generated premium. Refused (22023) unless the show has publishes_own_premium on. Authorized like publish_premium_artifact (can_manage_show, show secretary or platform admin; 42501 otherwise). Touches no entry.';

-- ---------------------------------------------------------------------------
-- unpublish_premium: takes down the PDF link and the public announcement. No entry is read
-- or written. The staged PDF objects stay in Storage (immutable artifacts); only the show's
-- pointers go, so nobody can reach them from the public page.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unpublish_premium(p_show_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT (
    coalesce((SELECT public.can_manage_show(p_show_id)), false)
    OR coalesce((SELECT public.is_show_secretary(p_show_id)), false)
    OR coalesce((SELECT public.is_platform_admin()), false)
  ) THEN
    RAISE EXCEPTION 'Not authorized to publish this show' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.shows WHERE id = p_show_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Premium publication found no show row' USING ERRCODE = 'P0002';
  END IF;

  -- Advancing the reservation version supersedes any generated publish another manager has
  -- already started, so its later commit cannot undo this unpublish.
  UPDATE public.shows
     SET premium_publish_version = premium_publish_version + 1,
         published_premium_path = NULL,
         published_premium_url = NULL,
         published_premium_at = NULL,
         published_premium_version = NULL,
         own_premium_link = NULL,
         experience_is_published = false,
         experience_published_at = NULL,
         experience_published_style = NULL,
         experience_published_content = '{}'::jsonb
   WHERE id = p_show_id;
END;
$$;

REVOKE ALL ON FUNCTION public.unpublish_premium(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unpublish_premium(uuid) TO authenticated;

COMMENT ON FUNCTION public.unpublish_premium(uuid) IS
  'MYK9-2054: removes the premium PDF link (generated, uploaded or the club''s own link) and the public announcement (experience snapshot) from a show. Reads and writes no entry. The secretary can publish again at any time. Authorized like set_own_premium.';

-- ---------------------------------------------------------------------------
-- The "Public landing page" switch is gone (owner decision 6): a show's public face is
-- published or not.
-- ---------------------------------------------------------------------------
ALTER TABLE public.shows DROP COLUMN IF EXISTS uses_landing_page;

COMMIT;

NOTIFY pgrst, 'reload schema';
