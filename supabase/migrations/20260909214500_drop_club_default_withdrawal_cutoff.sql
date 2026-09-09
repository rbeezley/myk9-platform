-- MYK9-454 — the club-level withdrawal cutoff date is dropped.
--
-- `clubs.default_withdrawal_cutoff_date` (added by 20260625200000) is an
-- ABSOLUTE calendar date used as a club-wide default. Entered once, it governed
-- every future show of that club: the day after it passed, every show with no
-- override resolved `after_cutoff` and kept the club's office fee -- and the
-- resolver reports that as `requiresManual: false`, so the refund dialog
-- pre-filled a confidently wrong amount. A cutoff only means something anchored
-- to one show's entry-close date, so it now lives only on `shows`.
--
-- Clubs keep the parts that ARE club-wide policy: retention type/value and the
-- prose notes. Verified before writing this migration: 0 of 5 club rows hold a
-- non-null value, so nothing is lost.
--
-- `create_or_reuse_club` is replaced FIRST (it INSERTs the column), copied from
-- 20260707130000 -- the latest migration defining it -- minus the two cutoff
-- lines. CREATE OR REPLACE preserves the function's ACL; the REVOKE/GRANT block
-- below restates 20260707130000's contract, plus the explicit anon REVOKE the
-- grant-decision contract requires (see the note there).

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

-- Grant decisions, restated for the replaced routine. `REVOKE ... FROM PUBLIC`
-- is not an anon decision as far as the grant-decision contract is concerned
-- (and it is not one in fact either), so anon is named explicitly. Creating a
-- club is an authenticated, authorized action -- the function itself raises
-- 42501 without an auth.uid() -- and the live ACL already carries exactly this
-- shape (postgres, service_role, authenticated; no anon), so this codifies the
-- deployed state rather than changing it.
REVOKE ALL ON FUNCTION public.create_or_reuse_club(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_or_reuse_club(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_or_reuse_club(jsonb) TO authenticated;

ALTER TABLE public.clubs
  DROP COLUMN IF EXISTS default_withdrawal_cutoff_date;
