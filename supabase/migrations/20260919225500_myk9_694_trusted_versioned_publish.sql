-- MYK9-694 follow-up: trust a persisted Storage path and reject stale
-- organizer completions. The prior migration established the atomic commit;
-- this migration removes caller-supplied URLs and organizer mutation access.

ALTER TABLE public.shows
  ADD COLUMN IF NOT EXISTS published_premium_path text,
  ADD COLUMN IF NOT EXISTS premium_publish_version bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_premium_version bigint;

COMMENT ON COLUMN public.shows.published_premium_path IS
  'Validated immutable Storage path for the latest published premium PDF.';
COMMENT ON COLUMN public.shows.premium_publish_version IS
  'Monotonic server-issued premium publish attempt version.';
COMMENT ON COLUMN public.shows.published_premium_version IS
  'Server-issued version of the last atomically committed premium publication.';

UPDATE storage.buckets
   SET file_size_limit = 26214400,
       allowed_mime_types = ARRAY['application/pdf']::text[]
 WHERE id = 'premium-published';

DROP POLICY IF EXISTS "Show managers can update premium published" ON storage.objects;
DROP POLICY IF EXISTS "Show managers can delete premium published" ON storage.objects;
DROP POLICY IF EXISTS "Show managers can upload/update/delete premium published" ON storage.objects;
DROP POLICY IF EXISTS "Premium organizers can update published PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Premium organizers can delete published PDFs" ON storage.objects;

DROP FUNCTION IF EXISTS public.publish_premium_artifact(uuid, text, text, timestamptz, text, jsonb);

CREATE OR REPLACE FUNCTION public.begin_premium_publish(p_show_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_version bigint;
BEGIN
  IF NOT (
    coalesce((SELECT public.can_manage_show(p_show_id)), false)
    OR coalesce((SELECT public.is_show_secretary(p_show_id)), false)
    OR coalesce((SELECT public.is_platform_admin()), false)
  ) THEN
    RAISE EXCEPTION 'Not authorized to publish this show';
  END IF;

  UPDATE public.shows
     SET premium_publish_version = premium_publish_version + 1
   WHERE id = p_show_id
   RETURNING premium_publish_version INTO v_version;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Premium publication found no show row';
  END IF;
  RETURN v_version;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_premium_publish(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_premium_publish(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.publish_premium_artifact(
  p_show_id uuid,
  p_storage_path text,
  p_publish_version bigint,
  p_experience_style text,
  p_experience_content jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_published_path text;
  v_published_at timestamptz;
  v_committed_version bigint;
  v_current_version bigint;
  v_experience_content jsonb;
BEGIN
  IF NOT (
    coalesce((SELECT public.can_manage_show(p_show_id)), false)
    OR coalesce((SELECT public.is_show_secretary(p_show_id)), false)
    OR coalesce((SELECT public.is_platform_admin()), false)
  ) THEN
    RAISE EXCEPTION 'Not authorized to publish this show';
  END IF;

  IF p_storage_path !~* (
    '^' || p_show_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$'
  ) THEN
    RAISE EXCEPTION 'Invalid premium artifact path';
  END IF;

  SELECT published_premium_path, published_premium_at, published_premium_version,
         premium_publish_version
    INTO v_published_path, v_published_at, v_committed_version, v_current_version
    FROM public.shows
   WHERE id = p_show_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Premium publication found no show row';
  END IF;

  -- A client may retry after losing the successful response. Return the
  -- already-committed result only for the exact same version and path.
  IF v_committed_version = p_publish_version THEN
    IF v_published_path <> p_storage_path THEN
      RAISE EXCEPTION 'Premium publication version is already committed to another path';
    END IF;
    RETURN jsonb_build_object(
      'premiumPath', v_published_path,
      'publishedAt', v_published_at
    );
  END IF;

  IF v_current_version <> p_publish_version THEN
    RAISE EXCEPTION 'Premium publication attempt is stale or found no show row';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM storage.objects
     WHERE bucket_id = 'premium-published'
       AND name = p_storage_path
       AND coalesce(metadata->>'mimetype', metadata->>'contentType') = 'application/pdf'
  ) THEN
    RAISE EXCEPTION 'Premium artifact is not a PDF staged for this show';
  END IF;

  v_published_at := clock_timestamp();
  v_experience_content := jsonb_set(
    coalesce(p_experience_content, '{}'::jsonb),
    '{generatedAt}',
    to_jsonb(v_published_at),
    true
  );
  v_experience_content := jsonb_set(
    v_experience_content,
    '{outputs}',
    (
      coalesce(v_experience_content->'outputs', '{}'::jsonb) - 'premiumUrl'
      || jsonb_build_object('premiumPath', p_storage_path, 'premiumUrl', NULL)
    ),
    true
  );

  UPDATE public.shows
     SET published_premium_path = p_storage_path,
         published_premium_url = NULL,
         published_premium_at = v_published_at,
         published_premium_version = p_publish_version,
         experience_is_published = true,
         experience_published_at = v_published_at,
         experience_published_style = p_experience_style,
         experience_published_content = v_experience_content
   WHERE id = p_show_id
     AND premium_publish_version = p_publish_version;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Premium publication attempt is stale or found no show row';
  END IF;

  SELECT published_premium_path, published_premium_at
    INTO v_published_path, v_published_at
    FROM public.shows
   WHERE id = p_show_id;

  RETURN jsonb_build_object(
    'premiumPath', v_published_path,
    'publishedAt', v_published_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.publish_premium_artifact(uuid, text, bigint, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_premium_artifact(uuid, text, bigint, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.publish_premium_artifact(uuid, text, bigint, text, jsonb) IS
  'Atomically commits a validated immutable premium path and complete experience snapshot only for the current server-issued attempt.';

NOTIFY pgrst, 'reload schema';
