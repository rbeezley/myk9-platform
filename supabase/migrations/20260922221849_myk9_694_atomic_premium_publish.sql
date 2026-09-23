-- MYK9-694: private, committed-pointer publication contract.
-- Existing object rows and bytes are preserved; all new artifacts are immutable.

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
COMMENT ON COLUMN public.shows.published_premium_url IS
  'Canonical Storage locator retained as publication identity metadata; the private bucket makes it non-downloadable. All app downloads must use get-premium-download.';

UPDATE storage.buckets
   SET public = false,
       file_size_limit = 26214400,
       allowed_mime_types = ARRAY['application/pdf']::text[]
 WHERE id = 'premium-published';

DROP POLICY IF EXISTS "Secretaries can upload premium published" ON storage.objects;
DROP POLICY IF EXISTS "Secretaries can update premium published" ON storage.objects;
DROP POLICY IF EXISTS "Secretaries can delete premium published" ON storage.objects;
DROP POLICY IF EXISTS "Show managers can upload premium published" ON storage.objects;
DROP POLICY IF EXISTS "Show managers can update premium published" ON storage.objects;
DROP POLICY IF EXISTS "Show managers can delete premium published" ON storage.objects;
DROP POLICY IF EXISTS "Show managers can upload/update/delete premium published" ON storage.objects;
DROP POLICY IF EXISTS "Premium organizers can update published PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Premium organizers can delete published PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Legacy premium published compatibility select" ON storage.objects;
DROP POLICY IF EXISTS "Legacy premium published compatibility insert" ON storage.objects;
DROP POLICY IF EXISTS "Legacy premium published compatibility update" ON storage.objects;
DROP POLICY IF EXISTS "Legacy premium published compatibility delete" ON storage.objects;
DROP POLICY IF EXISTS "Public read premium published" ON storage.objects;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename = 'objects'
       AND roles && ARRAY['anon', 'public']::name[]
       AND cmd IN ('SELECT', 'ALL')
       AND (
         coalesce(qual, '') ~ 'premium-published'
         OR coalesce(qual, '') !~* 'bucket_id\s*=\s*''[^'']+'''
       )
  ) THEN
    RAISE EXCEPTION 'Broad anonymous read policy remains for premium-published storage';
  END IF;
END;
$$;

-- New clients may stage only immutable versioned objects. Legacy flat rows are
-- retained for endpoint reads but cannot be written after private cutover.
CREATE POLICY "Premium organizers stage versioned artifacts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'premium-published'
  AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$'
  AND (
    (SELECT public.can_manage_show(split_part(name, '/', 1)::uuid))
    OR (SELECT public.is_show_secretary(split_part(name, '/', 1)::uuid))
    OR (SELECT public.is_platform_admin())
  )
);

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
     ) THEN
    RAISE EXCEPTION 'Premium publication state may be changed only by the publication RPC';
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

DROP TRIGGER IF EXISTS validate_premium_publication_identity ON public.shows;
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
  experience_published_content
ON public.shows
FOR EACH ROW EXECUTE FUNCTION public.guard_premium_publication_state();

DROP FUNCTION IF EXISTS public.publish_premium_artifact(uuid, text, text, timestamptz, text, jsonb);
DROP FUNCTION IF EXISTS public.publish_premium_artifact(uuid, text, bigint, text, jsonb);

DROP FUNCTION IF EXISTS public.begin_premium_publish(uuid);

CREATE OR REPLACE FUNCTION public.begin_or_reconcile_premium_publish(
  p_show_id uuid,
  p_prior_version bigint DEFAULT NULL,
  p_prior_path text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show public.shows%ROWTYPE;
  v_version bigint;
BEGIN
  SELECT * INTO v_show
    FROM public.shows
   WHERE id = p_show_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Premium publication found no show row';
  END IF;

  IF NOT (
    coalesce((SELECT public.can_manage_show(p_show_id)), false)
    OR coalesce((SELECT public.is_show_secretary(p_show_id)), false)
    OR coalesce((SELECT public.is_platform_admin()), false)
  ) THEN
    RAISE EXCEPTION 'Not authorized to publish this show';
  END IF;

  -- Recover a commit whose response was lost before doing any expensive
  -- generation or reserving another version. Exact path and version bind this
  -- reconciliation to the caller's persisted immutable attempt.
  IF p_prior_version IS NOT NULL
     AND p_prior_path IS NOT NULL
     AND v_show.published_premium_version = p_prior_version
     AND v_show.published_premium_path = p_prior_path THEN
    RETURN jsonb_build_object(
      'status', 'already_committed',
      'version', v_show.published_premium_version,
      'premiumUrl', v_show.published_premium_url,
      'publishedAt', v_show.published_premium_at
    );
  END IF;

  UPDATE public.shows
     SET premium_publish_version = premium_publish_version + 1
   WHERE id = p_show_id
   RETURNING premium_publish_version INTO v_version;
  RETURN jsonb_build_object('status', 'reserved', 'version', v_version);
END;
$$;

REVOKE ALL ON FUNCTION public.begin_or_reconcile_premium_publish(uuid, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_or_reconcile_premium_publish(uuid, bigint, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.publish_premium_artifact(
  p_show_id uuid,
  p_storage_path text,
  p_public_url text,
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
  v_committed_style text;
  v_committed_content jsonb;
  v_published_url text;
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

  IF p_public_url IS NULL OR p_public_url NOT IN (
    'https://sojmvhhwsjxmfistvzbe.supabase.co/storage/v1/object/public/premium-published/' || p_storage_path,
    'http://127.0.0.1:54321/storage/v1/object/public/premium-published/' || p_storage_path
  ) THEN
    RAISE EXCEPTION 'Premium URL does not match the trusted artifact path';
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

  -- Bind idempotency to the complete committed intent, not only artifact identity.
  IF v_committed_version = p_publish_version THEN
    SELECT experience_published_style, experience_published_content
      INTO v_committed_style, v_committed_content
      FROM public.shows
     WHERE id = p_show_id;

    v_experience_content := jsonb_set(
      coalesce(p_experience_content, '{}'::jsonb),
      '{generatedAt}', to_jsonb(v_published_at), true
    );
    v_experience_content := jsonb_set(
      v_experience_content, '{outputs}',
      (coalesce(v_experience_content->'outputs', '{}'::jsonb)
       || jsonb_build_object('premiumPath', p_storage_path, 'premiumUrl', p_public_url)),
      true
    );

    IF v_published_path IS DISTINCT FROM p_storage_path
       OR NOT EXISTS (
         SELECT 1 FROM public.shows
          WHERE id = p_show_id AND published_premium_url = p_public_url
       )
       OR v_committed_style IS DISTINCT FROM p_experience_style
       OR v_committed_content IS DISTINCT FROM v_experience_content THEN
      RAISE EXCEPTION 'Premium publication version is already committed to a different intent';
    END IF;
    RETURN jsonb_build_object(
      'premiumPath', v_published_path,
      'premiumUrl', p_public_url,
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
       AND coalesce((metadata->>'size')::bigint, 0) BETWEEN 1 AND 26214400
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
      coalesce(v_experience_content->'outputs', '{}'::jsonb)
      || jsonb_build_object('premiumPath', p_storage_path, 'premiumUrl', p_public_url)
    ),
    true
  );

  UPDATE public.shows
     SET published_premium_path = p_storage_path,
         published_premium_url = p_public_url,
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

  SELECT published_premium_path, published_premium_url, published_premium_at
    INTO v_published_path, v_published_url, v_published_at
    FROM public.shows
   WHERE id = p_show_id;

  RETURN jsonb_build_object(
    'premiumPath', v_published_path,
    'premiumUrl', v_published_url,
    'publishedAt', v_published_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.publish_premium_artifact(uuid, text, text, bigint, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_premium_artifact(uuid, text, text, bigint, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.publish_premium_artifact(uuid, text, text, bigint, text, jsonb) IS
  'Atomically commits an exact trusted path and canonical public-form URL identity (not a download URL after private cutover), plus complete experience snapshot, only for the current server-issued attempt.';

NOTIFY pgrst, 'reload schema';
