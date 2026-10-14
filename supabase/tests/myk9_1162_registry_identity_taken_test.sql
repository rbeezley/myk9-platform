-- Behavioral contract for 20261014194300_myk9_1162_registry_identity_taken.sql.
--
-- Add Dog asks for the registry number first and needs one yes/no answer the
-- caller's own (RLS-limited) copy cannot give: does a live dog already hold it?
--
-- What this asserts, and why each case earns its place:
--   1. A number held by a live dog is taken (positive control for the rest).
--   2. Formatting and organization-name drift still match ('akc' + 'sr-1111 1111'
--      against 'AKC (American Kennel Club)' / 'SR11111111'), and a blank
--      organization means AKC -- an exact-string match would miss real rows.
--   3. A free number is not taken, and the same number under another registry is
--      not taken (the check is registry-scoped).
--   4. A number held only by a soft-deleted dog is not taken.
--   5. An empty / punctuation-only number is never taken, even though a live dog
--      holds a blank-number row.
--   6. anon cannot execute it; authenticated can.
--   7. The return type is plain boolean, so there is nothing to leak but yes/no.
--
-- Run against a database where all migrations are applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/myk9_1162_registry_identity_taken_test.sql
-- All fixtures roll back.

BEGIN;

INSERT INTO public.dogs (id, name, call_name, breed, status, deleted_at)
VALUES
  ('00000000-0000-0000-0000-0000001162a1', 'Live Dog',    'Live',    'Beagle', 'active', NULL),
  ('00000000-0000-0000-0000-0000001162a2', 'Deleted Dog', 'Gone',    'Beagle', 'active', now()),
  ('00000000-0000-0000-0000-0000001162a3', 'Blank Dog',   'Blank',   'Beagle', 'active', NULL);

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
VALUES
  ('00000000-0000-0000-0000-0000001162a1', 'AKC (American Kennel Club)', 'SR11111111', true),
  ('00000000-0000-0000-0000-0000001162a2', 'UKC', 'P222-2222', true),
  ('00000000-0000-0000-0000-0000001162a3', 'AKC', '   ', true);

DO $$
BEGIN
  -- 1. Held by a live dog.
  IF public.registry_identity_taken('AKC', 'SR11111111') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL a number held by a live dog was not reported taken';
  END IF;

  -- 2. Formatting, organization naming drift and a blank organization.
  IF public.registry_identity_taken('akc', 'sr-1111 1111') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL formatting drift hid a taken number';
  END IF;
  IF public.registry_identity_taken('AKC (American Kennel Club)', 'SR11111111') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL organization naming drift hid a taken number';
  END IF;
  IF public.registry_identity_taken('', 'SR11111111') IS DISTINCT FROM true
     OR public.registry_identity_taken(NULL, 'SR11111111') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL a blank organization did not default to AKC';
  END IF;

  -- 3. Free number; same number under a different registry.
  IF public.registry_identity_taken('AKC', 'SR99999999') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL a free number was reported taken';
  END IF;
  IF public.registry_identity_taken('UKC', 'SR11111111') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL the check ignored the registry';
  END IF;

  -- 4. Soft-deleted dog only.
  IF public.registry_identity_taken('UKC', 'P2222222') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL a number held only by a soft-deleted dog was reported taken';
  END IF;

  -- 5. Empty numbers are never taken.
  IF public.registry_identity_taken('AKC', '') IS DISTINCT FROM false
     OR public.registry_identity_taken('AKC', '   ') IS DISTINCT FROM false
     OR public.registry_identity_taken('AKC', '--') IS DISTINCT FROM false
     OR public.registry_identity_taken('AKC', NULL) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL an empty number was reported taken';
  END IF;

  -- 6. Grants.
  IF has_function_privilege('anon', 'public.registry_identity_taken(text, text)', 'execute') THEN
    RAISE EXCEPTION 'FAIL anon can execute registry_identity_taken';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.registry_identity_taken(text, text)', 'execute') THEN
    RAISE EXCEPTION 'FAIL authenticated lost execute on registry_identity_taken';
  END IF;

  -- 7. Boolean only.
  IF (SELECT prorettype FROM pg_proc WHERE oid = 'public.registry_identity_taken(text, text)'::regprocedure)
     <> 'boolean'::regtype THEN
    RAISE EXCEPTION 'FAIL registry_identity_taken must return boolean and nothing else';
  END IF;

  RAISE NOTICE 'PASS registry_identity_taken: taken, drift-tolerant, registry-scoped, live dogs only, empty never taken, anon refused, boolean only';
END;
$$;

ROLLBACK;
