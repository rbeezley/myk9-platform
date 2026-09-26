-- Behavioral test for 20260926174500_myk9_824_submit_entries_handler_defaults_to_owner.sql (MYK9-824).
--
-- `submit_show_entries` must never fall back an unresolved typed handler to
-- the SUBMITTER. Found in the MYK9-819 dress rehearsal: a secretary took a
-- mail-in entry, typed a handler with no person match, and `entries.handler_id`
-- landed on the secretary's own person row instead of the dog's owner.
--
-- Why each case earns its place:
--   1. A show official submitting on behalf of an exhibitor, with a typed
--      handler that matches no person (no `handler_id` sent): the entry's
--      `handler_id` must be the DOG'S OWNER, never the official's own person
--      id. This is the exact rehearsal bug.
--   2. The SAME official submitting with an explicit, resolvable `handler_id`
--      (the dog's co-owner): that value must be preserved untouched. Case 1
--      alone would pass a fix that ignores the client-sent id entirely and
--      always substitutes the owner.
--   3. THE SAME regression as case 1, but through the SIX-argument, PAYMENT-
--      BEARING call the wizard actually makes when a secretary records a
--      received cash/check payment (`p_payment` non-NULL). A fix rebuilt from
--      a stale five-argument copy of this function would pass cases 1-2 while
--      leaving every payment-bearing mail-in submission going through a
--      still-broken six-argument overload -- this is what stops that.
--   4. An exhibitor submitting their OWN entry with no explicit handler: the
--      fallback must still land on the caller (== the owner, enforced by the
--      existing ownership guard). This is the non-official branch,
--      deliberately UNCHANGED by the fix, and case 4 is what proves it did
--      not regress.
--
-- The printed `entries.handler` text is asserted unchanged in every case --
-- this bug was already writing it correctly; only the FK was wrong, and a fix
-- that also touched the text would be over-reaching.
--
-- Run against a database where all migrations are applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/myk9_824_submit_entries_handler_owner_fallback_test.sql
-- All fixtures roll back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000824010', 'MYK9-824 Test Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date,
                          accept_check_payments, accept_cash_payments, pre_entry_fee)
VALUES (
  '00000000-0000-0000-0000-000000824100', 'MYK9-824 Mail-In Handler Show', 'UKC',
  current_date + 5, current_date + 6, '00000000-0000-0000-0000-000000824010', 'published',
  (current_date - 10)::timestamptz, (current_date + 4)::timestamptz,
  true, true, 30
);

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type)
VALUES (
  '00000000-0000-0000-0000-000000824200', '00000000-0000-0000-0000-000000824100',
  'MYK9-824 Saturday Trial', current_date + 5, 'UKC', 'Nosework'
);

INSERT INTO public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
VALUES
  ('00000000-0000-0000-0000-000000824301', '00000000-0000-0000-0000-000000824200',
   'Novice B Container', 'Container', 'Novice B', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000000824302', '00000000-0000-0000-0000-000000824200',
   'Novice B Interior', 'Interior', 'Novice B', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000000824303', '00000000-0000-0000-0000-000000824200',
   'Novice B Exterior', 'Exterior', 'Novice B', 'upcoming', 'manual', 30);

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  -- The typed handler ("ZZ Rehearsal Handler Hana") deliberately has NO
  -- matching person row: this is the "no directory match" case the bug report
  -- describes, not a resolvable one.
  ('00000000-0000-0000-0000-000000824001', 'ZZ Rehearsal', 'Owner One', 'myk9-824-owner@example.test'),
  ('00000000-0000-0000-0000-000000824002', 'Test', 'Secretary', 'myk9-824-secretary@example.test'),
  ('00000000-0000-0000-0000-000000824003', 'ZZ Rehearsal', 'Co Owner', 'myk9-824-coowner@example.test'),
  ('00000000-0000-0000-0000-000000824004', 'MYK9-824', 'Exhibitor', 'myk9-824-exhibitor@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000824101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-824-secretary@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000824102', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-824-exhibitor@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

UPDATE public.people
SET auth_user_id = fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000824002'::uuid, '00000000-0000-0000-0000-000000824101'::uuid),
  ('00000000-0000-0000-0000-000000824004'::uuid, '00000000-0000-0000-0000-000000824102'::uuid)
) AS fixture(person_id, auth_id)
WHERE public.people.id = fixture.person_id;

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000824002', roles.id,
       '00000000-0000-0000-0000-000000824010', true,
       '00000000-0000-0000-0000-000000824101'
FROM public.roles WHERE roles.name = 'secretary';

-- `breed` and `call_name` are NOT NULL without defaults on public.dogs.
INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id, co_owner_id)
VALUES
  ('00000000-0000-0000-0000-000000824401', 'ZZRover', 'ZZRover', 'Mixed Breed', 'active',
   '00000000-0000-0000-0000-000000824001', '00000000-0000-0000-0000-000000824003'),
  ('00000000-0000-0000-0000-000000824402', 'MYK9-824 Own Dog', 'Ownie', 'Beagle', 'active',
   '00000000-0000-0000-0000-000000824004', NULL);

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
VALUES
  ('00000000-0000-0000-0000-000000824401', 'UKC', 'SR82400001', true),
  ('00000000-0000-0000-0000-000000824402', 'UKC', 'SR82400002', true);

-- Mail-in enrollment: `handler_id` is the OWNER (the exhibitor of record), not
-- the secretary keying the entry. Matches how the wizard creates a mail-in
-- registration for someone else.
INSERT INTO public.enrollments (id, show_id, handler_id)
VALUES
  ('00000000-0000-0000-0000-000000824500', '00000000-0000-0000-0000-000000824100',
   '00000000-0000-0000-0000-000000824001'),
  ('00000000-0000-0000-0000-000000824501', '00000000-0000-0000-0000-000000824100',
   '00000000-0000-0000-0000-000000824004');

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  secretary_auth  CONSTANT uuid := '00000000-0000-0000-0000-000000824101';
  exhibitor_auth  CONSTANT uuid := '00000000-0000-0000-0000-000000824102';
  show_id         CONSTANT uuid := '00000000-0000-0000-0000-000000824100';
  mailin_reg_id   CONSTANT uuid := '00000000-0000-0000-0000-000000824500';
  own_reg_id      CONSTANT uuid := '00000000-0000-0000-0000-000000824501';
  owner_person    CONSTANT uuid := '00000000-0000-0000-0000-000000824001';
  secretary_person CONSTANT uuid := '00000000-0000-0000-0000-000000824002';
  coowner_person  CONSTANT uuid := '00000000-0000-0000-0000-000000824003';
  exhibitor_person CONSTANT uuid := '00000000-0000-0000-0000-000000824004';
  zzrover         CONSTANT uuid := '00000000-0000-0000-0000-000000824401';
  own_dog         CONSTANT uuid := '00000000-0000-0000-0000-000000824402';
  class_a         CONSTANT uuid := '00000000-0000-0000-0000-000000824301';
  class_b         CONSTANT uuid := '00000000-0000-0000-0000-000000824302';
  class_c         CONSTANT uuid := '00000000-0000-0000-0000-000000824303';
  result          jsonb;
  written_entry_id uuid;
  written_handler_id uuid;
  written_handler_text text;
  enrollment_total numeric;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', secretary_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', secretary_auth, 'role', 'authenticated')::text, true);

  ----------------------------------------------------------------------------
  -- 1. THE BUG. Secretary submits a mail-in entry for ZZRover, typing a
  --    handler name that matches no person (no handler_id sent). Must NOT
  --    write the secretary's own person id.
  ----------------------------------------------------------------------------
  result := public.submit_show_entries(
    show_id, mailin_reg_id,
    jsonb_build_array(jsonb_build_object(
      'dog_id', zzrover, 'class_id', class_a,
      'handler_name', 'ZZ Rehearsal Handler Hana', 'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000000824901'::uuid, 'check');

  IF jsonb_array_length(result->'entries') <> 1 THEN
    RAISE EXCEPTION 'FAIL mail-in entry with unmatched typed handler was not created: %', result;
  END IF;

  written_entry_id := (result->'entries'->0->>'entry_id')::uuid;
  SELECT handler_id, handler INTO written_handler_id, written_handler_text
  FROM public.entries WHERE id = written_entry_id;

  IF written_handler_id = secretary_person THEN
    RAISE EXCEPTION 'FAIL unmatched typed handler defaulted to the SUBMITTING SECRETARY (MYK9-824 regression)';
  END IF;
  IF written_handler_id IS DISTINCT FROM owner_person THEN
    RAISE EXCEPTION 'FAIL unmatched typed handler did not default to the dog owner: got %, expected %',
      written_handler_id, owner_person;
  END IF;
  IF written_handler_text <> 'ZZ Rehearsal Handler Hana' THEN
    RAISE EXCEPTION 'FAIL printed handler text was altered: %', written_handler_text;
  END IF;

  ----------------------------------------------------------------------------
  -- 2. Positive control: the SAME secretary submits with an explicit,
  --    resolvable handler_id (the dog's co-owner). That value must be
  --    preserved untouched -- a fix that always substitutes the owner
  --    regardless of what the client sent would still pass case 1 alone.
  ----------------------------------------------------------------------------
  result := public.submit_show_entries(
    show_id, mailin_reg_id,
    jsonb_build_array(jsonb_build_object(
      'dog_id', zzrover, 'class_id', class_b,
      'handler_id', coowner_person,
      'handler_name', 'ZZ Rehearsal Co Owner', 'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000000824902'::uuid, 'check');

  IF jsonb_array_length(result->'entries') <> 1 THEN
    RAISE EXCEPTION 'FAIL entry with an explicit resolvable handler_id was not created: %', result;
  END IF;

  written_entry_id := (result->'entries'->0->>'entry_id')::uuid;
  SELECT handler_id INTO written_handler_id FROM public.entries WHERE id = written_entry_id;

  IF written_handler_id IS DISTINCT FROM coowner_person THEN
    RAISE EXCEPTION 'FAIL explicit handler_id was overwritten: got %, expected %',
      written_handler_id, coowner_person;
  END IF;

  ----------------------------------------------------------------------------
  -- 3. THE SAME regression as case 1, through the SIX-argument, payment-
  --    bearing call (`p_payment` non-NULL) -- the exact call shape
  --    `submitShowRegistration.ts` makes when a secretary records cash/check
  --    received with a mail-in entry. Still logged in as the secretary.
  ----------------------------------------------------------------------------
  result := public.submit_show_entries(
    show_id, mailin_reg_id,
    jsonb_build_array(jsonb_build_object(
      'dog_id', zzrover, 'class_id', class_c,
      'handler_name', 'ZZ Rehearsal Handler Hana', 'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000000824904'::uuid, 'check',
    jsonb_build_object('method', 'check', 'reference', 'CHK-824'));

  IF jsonb_array_length(result->'entries') <> 1 THEN
    RAISE EXCEPTION 'FAIL payment-bearing mail-in entry was not created: %', result;
  END IF;

  written_entry_id := (result->'entries'->0->>'entry_id')::uuid;
  SELECT handler_id, handler INTO written_handler_id, written_handler_text
  FROM public.entries WHERE id = written_entry_id;

  IF written_handler_id = secretary_person THEN
    RAISE EXCEPTION
      'FAIL the SIX-argument payment-bearing overload still defaults an unmatched typed handler to the SUBMITTING SECRETARY (MYK9-824 regression, payment path)';
  END IF;
  IF written_handler_id IS DISTINCT FROM owner_person THEN
    RAISE EXCEPTION
      'FAIL payment-bearing path: unmatched typed handler did not default to the dog owner: got %, expected %',
      written_handler_id, owner_person;
  END IF;
  IF written_handler_text <> 'ZZ Rehearsal Handler Hana' THEN
    RAISE EXCEPTION 'FAIL payment-bearing path altered the printed handler text: %', written_handler_text;
  END IF;

  -- The payment itself still recorded (this call also exercises that the
  -- rebuild kept the MYK9-677 payment block intact, not just the fallback).
  -- Cases 1 and 2 passed no `p_payment`, so that block never ran for them;
  -- this is the only call in this test that grows `total_amount`.
  SELECT total_amount INTO enrollment_total FROM public.enrollments WHERE id = mailin_reg_id;
  IF enrollment_total IS DISTINCT FROM 3000 THEN
    RAISE EXCEPTION
      'FAIL enrollment total after the $30 payment-bearing entry is % (expected 3000)',
      enrollment_total;
  END IF;

  ----------------------------------------------------------------------------
  -- 4. Non-official branch, deliberately UNCHANGED: an exhibitor submitting
  --    their own entry with no explicit handler still defaults to themself
  --    (== the dog's owner, enforced by the existing ownership guard).
  ----------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', exhibitor_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', exhibitor_auth, 'role', 'authenticated')::text, true);

  result := public.submit_show_entries(
    show_id, own_reg_id,
    jsonb_build_array(jsonb_build_object(
      'dog_id', own_dog, 'class_id', class_a,
      'handler_name', 'MYK9-824 Exhibitor', 'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000000824903'::uuid, 'check');

  IF jsonb_array_length(result->'entries') <> 1 THEN
    RAISE EXCEPTION 'FAIL exhibitor self-service entry was not created: %', result;
  END IF;

  written_entry_id := (result->'entries'->0->>'entry_id')::uuid;
  SELECT handler_id INTO written_handler_id FROM public.entries WHERE id = written_entry_id;

  IF written_handler_id IS DISTINCT FROM exhibitor_person THEN
    RAISE EXCEPTION 'FAIL exhibitor self-service fallback regressed: got %, expected %',
      written_handler_id, exhibitor_person;
  END IF;

  RAISE NOTICE 'PASS myk9_824_submit_entries_handler_owner_fallback_test';
END;
$$;

ROLLBACK;
