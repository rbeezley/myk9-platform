-- MYK9-694: one expand/contract publication contract for new and rollback apps.
-- Versioned artifacts are immutable; flat artifacts remain temporarily writable
-- by the old app and invalidate any older versioned show-row identity.

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

-- Insert is limited to either the temporary legacy shape or one immutable
-- versioned object. Update/delete below are deliberately legacy-only.
CREATE POLICY "Legacy premium published compatibility insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'premium-published'
  AND (
    name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$'
    OR name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$'
  )
  AND (
    (SELECT public.can_manage_show(CASE WHEN position('/' IN name) > 0 THEN split_part(name, '/', 1)::uuid ELSE split_part(name, '.', 1)::uuid END))
    OR (SELECT public.is_show_secretary(CASE WHEN position('/' IN name) > 0 THEN split_part(name, '/', 1)::uuid ELSE split_part(name, '.', 1)::uuid END))
    OR (SELECT public.is_platform_admin())
  )
);

-- UPDATE (including Storage upsert) requires row visibility. Keep this SELECT
-- scope to the one legacy flat object per show; do not restore bucket listing.
CREATE POLICY "Legacy premium published compatibility select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'premium-published'
  AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$'
  AND (
    (SELECT public.can_manage_show(split_part(name, '.', 1)::uuid))
    OR (SELECT public.is_show_secretary(split_part(name, '.', 1)::uuid))
    OR (SELECT public.is_platform_admin())
  )
);

CREATE POLICY "Legacy premium published compatibility update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'premium-published'
  AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$'
  AND (
    (SELECT public.can_manage_show(split_part(name, '.', 1)::uuid))
    OR (SELECT public.is_show_secretary(split_part(name, '.', 1)::uuid))
    OR (SELECT public.is_platform_admin())
  )
)
WITH CHECK (
  bucket_id = 'premium-published'
  AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$'
  AND (
    (SELECT public.can_manage_show(split_part(name, '.', 1)::uuid))
    OR (SELECT public.is_show_secretary(split_part(name, '.', 1)::uuid))
    OR (SELECT public.is_platform_admin())
  )
);

CREATE POLICY "Legacy premium published compatibility delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'premium-published'
  AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$'
  AND (
    (SELECT public.can_manage_show(
      CASE
        WHEN name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$'
          THEN split_part(name, '.', 1)::uuid
        ELSE NULL::uuid
      END
    ))
    OR (SELECT public.is_show_secretary(
      CASE
        WHEN name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$'
          THEN split_part(name, '.', 1)::uuid
        ELSE NULL::uuid
      END
    ))
    OR (SELECT public.is_platform_admin())
  )
);

CREATE OR REPLACE FUNCTION public.validate_premium_publication_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_legacy_url text;
  v_legacy_publish boolean;
BEGIN
  v_legacy_publish := NEW.published_premium_url IS NOT NULL
    AND NEW.published_premium_path IS NOT DISTINCT FROM OLD.published_premium_path
    AND (
      NEW.published_premium_url IS DISTINCT FROM OLD.published_premium_url
      OR NEW.published_premium_at IS DISTINCT FROM OLD.published_premium_at
    );

  IF v_legacy_publish THEN
    v_legacy_url := 'https://sojmvhhwsjxmfistvzbe.supabase.co/storage/v1/object/public/premium-published/' || NEW.id::text || '.pdf';
    IF NEW.published_premium_url NOT IN (
      v_legacy_url,
      'http://127.0.0.1:54321/storage/v1/object/public/premium-published/' || NEW.id::text || '.pdf'
    ) THEN
      RAISE EXCEPTION 'Legacy premium URL does not match the show flat path';
    END IF;
    NEW.published_premium_path := NULL;
    NEW.published_premium_version := NULL;
    NEW.premium_publish_version := GREATEST(NEW.premium_publish_version, OLD.premium_publish_version) + 1;
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

  IF NEW.published_premium_path IS DISTINCT FROM OLD.published_premium_path
     OR NEW.published_premium_url IS DISTINCT FROM OLD.published_premium_url THEN
    RAISE EXCEPTION 'Premium URL and artifact path must be committed together';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_premium_publication_identity ON public.shows;
CREATE TRIGGER validate_premium_publication_identity
BEFORE UPDATE OF published_premium_url, published_premium_at, published_premium_path
ON public.shows
FOR EACH ROW EXECUTE FUNCTION public.validate_premium_publication_identity();

DROP FUNCTION IF EXISTS public.publish_premium_artifact(uuid, text, text, timestamptz, text, jsonb);
DROP FUNCTION IF EXISTS public.publish_premium_artifact(uuid, text, bigint, text, jsonb);

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

  -- A client may retry after losing the successful response. Return the
  -- already-committed result only for the exact same version, path and URL.
  IF v_committed_version = p_publish_version THEN
    IF v_published_path <> p_storage_path OR NOT EXISTS (
      SELECT 1 FROM public.shows
      WHERE id = p_show_id AND published_premium_url = p_public_url
    ) THEN
      RAISE EXCEPTION 'Premium publication version is already committed to another artifact';
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
  'Atomically commits an exact trusted URL/path pair and complete experience snapshot only for the current server-issued attempt.';

NOTIFY pgrst, 'reload schema';
