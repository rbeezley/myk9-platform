-- Prevent duplicate live clubs from sharing the same normalized name.
--
-- Read-only duplicate inventory query to run before pushing this migration:
--
--   SELECT
--     public.normalize_club_name(name) AS normalized_name,
--     array_agg(id ORDER BY created_at NULLS LAST, id) AS club_ids,
--     array_agg(name ORDER BY created_at NULLS LAST, id) AS club_names,
--     count(*) AS club_count
--   FROM public.clubs
--   WHERE deleted_at IS NULL
--     AND public.normalize_club_name(name) <> ''
--   GROUP BY 1
--   HAVING count(*) > 1;

BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_club_name(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT pg_catalog.btrim(
    pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
        pg_catalog.upper(pg_catalog.coalesce(value, '')),
        '[^A-Z0-9]+',
        ' ',
        'g'
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.clubs
    WHERE deleted_at IS NULL
      AND public.normalize_club_name(name) <> ''
    GROUP BY public.normalize_club_name(name)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'clubs contains duplicate live normalized names; run the inventory query in migration 20260707130000 before applying';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS clubs_live_normalized_name_unique
  ON public.clubs (public.normalize_club_name(name))
  WHERE deleted_at IS NULL
    AND public.normalize_club_name(name) <> '';

CREATE OR REPLACE FUNCTION public.create_or_reuse_club(p_club jsonb)
RETURNS public.clubs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.clubs;
  v_inserted public.clubs;
  v_name text;
  v_is_authorized boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  v_is_authorized := public.is_trial_secretary()
    OR public.is_club_admin()
    OR public.is_site_admin();

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'not authorized to create clubs'
      USING ERRCODE = '42501';
  END IF;

  v_name := NULLIF(pg_catalog.btrim(p_club->>'name'), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'club name is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT c.*
    INTO v_existing
  FROM public.clubs c
  WHERE c.deleted_at IS NULL
    AND public.normalize_club_name(c.name) = public.normalize_club_name(v_name)
  ORDER BY c.created_at NULLS LAST, c.id
  LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    IF public.is_site_admin()
      OR public.is_club_admin(v_existing.id)
      OR public.is_trial_secretary(v_existing.id) THEN
      RETURN v_existing;
    END IF;

    RAISE EXCEPTION 'club name already exists but caller is not authorized to use matching club'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.clubs (
    id,
    name,
    address,
    city,
    state,
    zip_code,
    email,
    phone,
    website,
    logo_url,
    cover_image_url,
    accent_color,
    description,
    club_number,
    license_key,
    default_withdrawal_cutoff_date,
    default_withdrawal_policy_notes,
    default_withdrawal_retention_type,
    default_withdrawal_retention_value,
    version,
    created_at,
    updated_at
  )
  VALUES (
    COALESCE(NULLIF(p_club->>'id', '')::uuid, extensions.uuid_generate_v4()),
    v_name,
    NULLIF(pg_catalog.btrim(p_club->>'address'), ''),
    NULLIF(pg_catalog.btrim(p_club->>'city'), ''),
    NULLIF(pg_catalog.btrim(p_club->>'state'), ''),
    NULLIF(pg_catalog.btrim(p_club->>'zip_code'), ''),
    NULLIF(pg_catalog.btrim(p_club->>'email'), ''),
    NULLIF(pg_catalog.btrim(p_club->>'phone'), ''),
    NULLIF(pg_catalog.btrim(p_club->>'website'), ''),
    NULLIF(pg_catalog.btrim(p_club->>'logo_url'), ''),
    NULLIF(pg_catalog.btrim(p_club->>'cover_image_url'), ''),
    NULLIF(pg_catalog.btrim(p_club->>'accent_color'), ''),
    NULLIF(pg_catalog.btrim(p_club->>'description'), ''),
    NULLIF(pg_catalog.btrim(p_club->>'club_number'), ''),
    NULLIF(pg_catalog.btrim(p_club->>'license_key'), ''),
    NULLIF(p_club->>'default_withdrawal_cutoff_date', '')::date,
    NULLIF(pg_catalog.btrim(p_club->>'default_withdrawal_policy_notes'), ''),
    NULLIF(pg_catalog.btrim(p_club->>'default_withdrawal_retention_type'), ''),
    NULLIF(p_club->>'default_withdrawal_retention_value', '')::integer,
    COALESCE(NULLIF(p_club->>'version', '')::integer, 1),
    COALESCE(NULLIF(p_club->>'created_at', '')::timestamptz, NOW()),
    NOW()
  )
  RETURNING * INTO v_inserted;

  RETURN v_inserted;
EXCEPTION
  WHEN unique_violation THEN
    SELECT c.*
      INTO v_existing
    FROM public.clubs c
    WHERE c.deleted_at IS NULL
      AND public.normalize_club_name(c.name) = public.normalize_club_name(v_name)
    ORDER BY c.created_at NULLS LAST, c.id
    LIMIT 1;

    IF v_existing.id IS NOT NULL
      AND (
        public.is_site_admin()
        OR public.is_club_admin(v_existing.id)
        OR public.is_trial_secretary(v_existing.id)
      ) THEN
      RETURN v_existing;
    END IF;

    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.create_or_reuse_club(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_or_reuse_club(jsonb) TO authenticated;

COMMENT ON FUNCTION public.normalize_club_name(text) IS
  'Normalizes club names for exact live club identity comparisons.';

COMMENT ON INDEX public.clubs_live_normalized_name_unique IS
  'Prevents duplicate live clubs whose names normalize to the same exact identity.';

COMMENT ON FUNCTION public.create_or_reuse_club(jsonb) IS
  'Creates a club or returns the existing live club with the same normalized name for authorized club creators.';

NOTIFY pgrst, 'reload schema';

COMMIT;
