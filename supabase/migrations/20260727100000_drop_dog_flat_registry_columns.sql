-- MYK9-90 section 4 — drop the dead flat registry columns from public.dogs.
--
-- Verified against the applied database (sojmvhhwsjxmfistvzbe) on 2026-07-26,
-- immediately before writing this file:
--
--   select count(*) from public.dogs
--   where akc_number is not null or ukc_number is not null
--      or other_registry is not null or other_registry_number is not null;
--   -> 0   (of 19 total dogs)
--
-- So there is nothing to back up and nothing to backfill. Identity now lives on
-- public.dog_registrations (organization, registered_name, registration_number,
-- breed), which sections 2-3 already repointed every reader at.
--
-- Outside-app-source sweep, re-run against the applied database on 2026-07-26:
--   * information_schema.views matching /akc_number|ukc_number|other_registry/  -> 0 rows
--   * pg_get_functiondef over every public function                            -> 1 hit,
--       public.create_show_managed_dog, which WRITES akc_number / ukc_number and
--       never reads them. It has no application caller.
--   * pg_indexes                                                               -> 1 hit,
--       dogs_akc_number_idx (reported unused by the performance advisor).
--   * pg_constraint on public.dogs / pg_policies                               -> 0 rows
--   * supabase/functions/ (23 fns) and apps/myk9show/supabase/functions/ (12)  -> 0 matches
--
-- Column-level ACLs on public.dogs grant anon SELECT on id / name / call_name /
-- breed / image_url only; none of the dropped columns carried a grant, so no
-- grant restoration is required after the drop.

BEGIN;

-- The only database object that references the columns.
DROP INDEX IF EXISTS public.dogs_akc_number_idx;

ALTER TABLE public.dogs
  DROP COLUMN IF EXISTS akc_number,
  DROP COLUMN IF EXISTS ukc_number,
  DROP COLUMN IF EXISTS other_registry,
  DROP COLUMN IF EXISTS other_registry_number;

-- create_show_managed_dog writes the columns being dropped, so it must change in
-- the same transaction or it becomes a broken function. The p_akc_number /
-- p_ukc_number parameters are removed entirely rather than accepted-and-ignored:
-- silently discarding a registration number a caller supplied would be worse
-- than failing to compile against the new signature. Registrations are created
-- through public.dog_registrations.
--
-- The parameter list changes, so this is a DROP + CREATE, not CREATE OR REPLACE.
-- Prior ACL (pg_proc.proacl, checked 2026-07-26):
--   postgres=X/postgres | service_role=X/postgres | authenticated=X/postgres
-- The grants below reproduce it exactly.
DROP FUNCTION IF EXISTS public.create_show_managed_dog(
  uuid, uuid, text, text, text, text, text, text, text
);

CREATE FUNCTION public.create_show_managed_dog(
  p_show_id uuid,
  p_owner_id uuid,
  p_name text,
  p_breed text,
  p_call_name text DEFAULT NULL::text,
  p_sex text DEFAULT NULL::text,
  p_microchip_number text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_dog_id uuid;
BEGIN
  IF NOT public.can_manage_show(p_show_id) THEN
    RAISE EXCEPTION 'Permission denied for show %', p_show_id USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.dogs (
    owner_id,
    name,
    breed,
    call_name,
    sex,
    microchip_number,
    status
  )
  VALUES (
    p_owner_id,
    btrim(p_name),
    btrim(p_breed),
    NULLIF(btrim(p_call_name), ''),
    NULLIF(btrim(p_sex), ''),
    NULLIF(btrim(p_microchip_number), ''),
    'active'
  )
  RETURNING id INTO v_dog_id;

  RETURN v_dog_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_show_managed_dog(uuid, uuid, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_show_managed_dog(uuid, uuid, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_show_managed_dog(uuid, uuid, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_show_managed_dog(uuid, uuid, text, text, text, text, text) TO service_role;

COMMIT;
