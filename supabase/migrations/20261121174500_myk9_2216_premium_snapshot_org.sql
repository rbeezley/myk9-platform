-- MYK9-2216: a published premium snapshot records the organization it was built for
-- (experience_published_content.org). publish_premium_artifact refuses a snapshot whose org is
-- missing or differs from the show's saved organization, so narratives written for one
-- organization can never be published under another. Same signature, SECURITY settings and grants
-- as the MYK9-694 definition; the only change is the organization check after the show row lock.

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
  v_show_organization text;
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
         premium_publish_version, organization
    INTO v_published_path, v_published_at, v_committed_version, v_current_version,
         v_show_organization
    FROM public.shows
   WHERE id = p_show_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Premium publication found no show row';
  END IF;

  -- MYK9-2216: the snapshot must have been built for the organization the show has now.
  IF p_experience_content->>'org' IS DISTINCT FROM v_show_organization THEN
    RAISE EXCEPTION 'Premium organization mismatch: Regenerate the premium for the new organization before publishing.';
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
  'Atomically commits an exact trusted path and canonical public-form URL identity (not a download URL after private cutover), plus complete experience snapshot, only for the current server-issued attempt. MYK9-2216: refuses a snapshot whose org is missing or differs from the show''s saved organization.';
