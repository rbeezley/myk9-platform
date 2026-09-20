-- MYK9-694: publish premium bytes as an immutable staged artifact, then commit
-- the URL and the complete experience snapshot in one authorized transaction.
--
-- Generation admits club/show managers and show-scoped secretaries. The old
-- storage policies only admitted is_show_secretary(), so a club admin could
-- generate a premium but could not upload it. The old <show_id>.pdf upsert
-- also replaced the last-good bytes before metadata/snapshot persistence.

DROP POLICY IF EXISTS "Secretaries can upload premium published" ON storage.objects;
DROP POLICY IF EXISTS "Secretaries can update premium published" ON storage.objects;
DROP POLICY IF EXISTS "Secretaries can delete premium published" ON storage.objects;
DROP POLICY IF EXISTS "Show managers can upload premium published" ON storage.objects;
DROP POLICY IF EXISTS "Show managers can update premium published" ON storage.objects;
DROP POLICY IF EXISTS "Show managers can delete premium published" ON storage.objects;

CREATE POLICY "Show managers can upload premium published"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'premium-published'
  AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$'
  AND (
    (SELECT public.can_manage_show((storage.foldername(name))[1]::uuid))
    OR (SELECT public.is_show_secretary((storage.foldername(name))[1]::uuid))
    OR (SELECT public.is_platform_admin())
  )
);

CREATE POLICY "Show managers can update premium published"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'premium-published'
  AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$'
  AND (
    (SELECT public.can_manage_show((storage.foldername(name))[1]::uuid))
    OR (SELECT public.is_show_secretary((storage.foldername(name))[1]::uuid))
    OR (SELECT public.is_platform_admin())
  )
)
WITH CHECK (
  bucket_id = 'premium-published'
  AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$'
  AND (
    (SELECT public.can_manage_show((storage.foldername(name))[1]::uuid))
    OR (SELECT public.is_show_secretary((storage.foldername(name))[1]::uuid))
    OR (SELECT public.is_platform_admin())
  )
);

CREATE POLICY "Show managers can delete premium published"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'premium-published'
  AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$'
  AND (
    (SELECT public.can_manage_show((storage.foldername(name))[1]::uuid))
    OR (SELECT public.is_show_secretary((storage.foldername(name))[1]::uuid))
    OR (SELECT public.is_platform_admin())
  )
);

CREATE OR REPLACE FUNCTION public.publish_premium_artifact(
  p_show_id uuid,
  p_storage_path text,
  p_public_url text,
  p_published_at timestamptz,
  p_experience_style text,
  p_experience_content jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_published_url text;
  v_published_at timestamptz;
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

  IF NOT EXISTS (
    SELECT 1
      FROM storage.objects
     WHERE bucket_id = 'premium-published'
       AND name = p_storage_path
  ) THEN
    RAISE EXCEPTION 'Premium artifact is not staged';
  END IF;

  IF p_public_url IS NULL OR position('/storage/v1/object/public/premium-published/' || p_storage_path IN p_public_url) = 0 THEN
    RAISE EXCEPTION 'Invalid premium artifact URL';
  END IF;

  UPDATE public.shows
     SET published_premium_url = p_public_url,
         published_premium_at = p_published_at,
         experience_is_published = true,
         experience_published_at = p_published_at,
         experience_published_style = p_experience_style,
         experience_published_content = p_experience_content
   WHERE id = p_show_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Premium publication found no show row';
  END IF;

  SELECT published_premium_url, published_premium_at
    INTO v_published_url, v_published_at
    FROM public.shows
   WHERE id = p_show_id;

  RETURN jsonb_build_object(
    'premiumUrl', v_published_url,
    'publishedAt', v_published_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.publish_premium_artifact(uuid, text, text, timestamptz, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_premium_artifact(uuid, text, text, timestamptz, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.publish_premium_artifact(uuid, text, text, timestamptz, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.publish_premium_artifact(uuid, text, text, timestamptz, text, jsonb) IS
  'Atomically commits an already-staged immutable premium artifact and its show experience snapshot for an authorized show manager.';

NOTIFY pgrst, 'reload schema';
