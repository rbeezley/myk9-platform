-- Behavioral test for 20260926231700_myk9_841_staff_on_behalf_entries_auto_accepted.sql (MYK9-841).
--
-- Owner decision (2026-09-26, MYK9-832 item 1): when a secretary/show manager
-- keys a mail-in entry ON BEHALF OF someone else, she is the reviewer, so the
-- entry is accepted on submit instead of landing in her own review lane.
-- Exhibitor self-entries, and a staff member entering their OWN dog, are
-- unchanged.
--
-- Why each case earns its place:
--   1. A show official (secretary) submits for a dog owned by someone else,
--      with no explicit handler_id (typed handler, kept as unknown by
--      MYK9-662): `entry_status` must be 'confirmed' (kind 'accepted'), not
--      'submitted'. This is the acceptance criterion itself.
--   2. An exhibitor submits their OWN entry (self-service, not an official):
--      `entry_status` must remain 'submitted', unchanged by this migration.
--      Proves the official-only branch didn't leak into the exhibitor path.
--   3. THE SAME secretary submits for HER OWN dog (handler resolves to her
--      own person id): `entry_status` must remain 'submitted'. Proves the
--      fix keys off "on behalf of someone else", not off "is staff" alone --
--      a secretary reviewing her own entry is not reviewing anyone.
--   4. THE SAME secretary submits for HER OWN dog again, but with an
--      explicit handler_id naming ANOTHER person (an alternate handler she
--      shows the dog with): `entry_status` must STILL be 'submitted'. This
--      is the regression case -- deciding "own entry" by comparing the
--      resolved HANDLER to the caller (rather than by dog OWNERSHIP, i.e.
--      dogs.owner_id) wrongly auto-accepted this as on-behalf-of, even
--      though the secretary owns the dog. Fails before the fix. Ownership
--      is dogs.owner_id only, the same rule the self-service authorization
--      check in submit_show_entries uses -- not co_owner_id (Codex round 2,
--      P1: an earlier revision counted co-owners too, so the two ownership
--      rules in that function disagreed about what "own dog" means).
--
-- Run against a database where all migrations are applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/myk9_841_staff_on_behalf_entries_accepted_test.sql
-- All fixtures roll back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000841010', 'MYK9-841 Test Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date,
                          accept_check_payments, accept_cash_payments, pre_entry_fee)
VALUES (
  '00000000-0000-0000-0000-000000841100', 'MYK9-841 Mail-In Accept Show', 'UKC',
  current_date + 5, current_date + 6, '00000000-0000-0000-0000-000000841010', 'published',
  (current_date - 10)::timestamptz, (current_date + 4)::timestamptz,
  true, true, 30
);

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type)
VALUES (
  '00000000-0000-0000-0000-000000841200', '00000000-0000-0000-0000-000000841100',
  'MYK9-841 Saturday Trial', current_date + 5, 'UKC', 'Nosework'
);

INSERT INTO public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
VALUES
  ('00000000-0000-0000-0000-000000841301', '00000000-0000-0000-0000-000000841200',
   'Novice B Container', 'Container', 'Novice B', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000000841302', '00000000-0000-0000-0000-000000841200',
   'Novice B Interior', 'Interior', 'Novice B', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000000841303', '00000000-0000-0000-0000-000000841200',
   'Novice B Exterior', 'Exterior', 'Novice B', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000000841304', '00000000-0000-0000-0000-000000841200',
   'Novice B Buried', 'Buried', 'Novice B', 'upcoming', 'manual', 30);

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000841001', 'MYK9-841', 'Owner', 'myk9-841-owner@example.test'),
  ('00000000-0000-0000-0000-000000841002', 'Test', 'Secretary', 'myk9-841-secretary@example.test'),
  ('00000000-0000-0000-0000-000000841003', 'MYK9-841', 'Exhibitor', 'myk9-841-exhibitor@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000841101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-841-secretary@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000841102', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-841-exhibitor@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

UPDATE public.people
SET auth_user_id = fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000841002'::uuid, '00000000-0000-0000-0000-000000841101'::uuid),
  ('00000000-0000-0000-0000-000000841003'::uuid, '00000000-0000-0000-0000-000000841102'::uuid)
) AS fixture(person_id, auth_id)
WHERE public.people.id = fixture.person_id;

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000841002', roles.id,
       '00000000-0000-0000-0000-000000841010', true,
       '00000000-0000-0000-0000-000000841101'
FROM public.roles WHERE roles.name = 'secretary';

-- `breed` and `call_name` are NOT NULL without defaults on public.dogs.
INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id, co_owner_id)
VALUES
  -- Case 1: on-behalf-of. Owned by someone OTHER than the secretary.
  ('00000000-0000-0000-0000-000000841401', 'MYK9-841 OnBehalf Dog', 'Behalfie', 'Mixed Breed',
   'active', '00000000-0000-0000-0000-000000841001', NULL),
  -- Case 2: exhibitor's own dog (self-service).
  ('00000000-0000-0000-0000-000000841402', 'MYK9-841 Exhibitor Dog', 'Ownie', 'Beagle',
   'active', '00000000-0000-0000-0000-000000841003', NULL),
  -- Case 3: the SECRETARY's own dog.
  ('00000000-0000-0000-0000-000000841403', 'MYK9-841 Secretary Dog', 'Deskie', 'Poodle',
   'active', '00000000-0000-0000-0000-000000841002', NULL);

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
VALUES
  ('00000000-0000-0000-0000-000000841401', 'UKC', 'SR84100001', true),
  ('00000000-0000-0000-0000-000000841402', 'UKC', 'SR84100002', true),
  ('00000000-0000-0000-0000-000000841403', 'UKC', 'SR84100003', true);

-- Case 1's enrollment: `handler_id` is the OWNER of record (mail-in on behalf
-- of an exhibitor, matching how the wizard creates the registration).
-- Case 2's and 3's enrollments: each caller's own registration.
INSERT INTO public.enrollments (id, show_id, handler_id)
VALUES
  ('00000000-0000-0000-0000-000000841500', '00000000-0000-0000-0000-000000841100',
   '00000000-0000-0000-0000-000000841001'),
  ('00000000-0000-0000-0000-000000841501', '00000000-0000-0000-0000-000000841100',
   '00000000-0000-0000-0000-000000841003'),
  ('00000000-0000-0000-0000-000000841502', '00000000-0000-0000-0000-000000841100',
   '00000000-0000-0000-0000-000000841002');

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  secretary_auth   CONSTANT uuid := '00000000-0000-0000-0000-000000841101';
  exhibitor_auth   CONSTANT uuid := '00000000-0000-0000-0000-000000841102';
  show_id          CONSTANT uuid := '00000000-0000-0000-0000-000000841100';
  onbehalf_reg_id  CONSTANT uuid := '00000000-0000-0000-0000-000000841500';
  exhibitor_reg_id CONSTANT uuid := '00000000-0000-0000-0000-000000841501';
  secretary_reg_id CONSTANT uuid := '00000000-0000-0000-0000-000000841502';
  onbehalf_dog     CONSTANT uuid := '00000000-0000-0000-0000-000000841401';
  exhibitor_dog    CONSTANT uuid := '00000000-0000-0000-0000-000000841402';
  secretary_dog    CONSTANT uuid := '00000000-0000-0000-0000-000000841403';
  class_a          CONSTANT uuid := '00000000-0000-0000-0000-000000841301';
  class_b          CONSTANT uuid := '00000000-0000-0000-0000-000000841302';
  class_c          CONSTANT uuid := '00000000-0000-0000-0000-000000841303';
  class_d          CONSTANT uuid := '00000000-0000-0000-0000-000000841304';
  alt_handler      CONSTANT uuid := '00000000-0000-0000-0000-000000841003';
  result           jsonb;
  written_entry_id uuid;
  written_status   text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', secretary_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', secretary_auth, 'role', 'authenticated')::text, true);

  ----------------------------------------------------------------------------
  -- 1. THE ACCEPTANCE CRITERION. Secretary keys a mail-in entry ON BEHALF OF
  --    the owner (typed handler, no handler_id sent -- identity stays NULL
  --    per MYK9-662). Must land ACCEPTED ('confirmed'), not 'submitted'.
  ----------------------------------------------------------------------------
  result := public.submit_show_entries(
    show_id, onbehalf_reg_id,
    jsonb_build_array(jsonb_build_object(
      'dog_id', onbehalf_dog, 'class_id', class_a,
      'handler_name', 'MYK9-841 OnBehalf Dog Owner', 'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000000841901'::uuid, 'check');

  IF jsonb_array_length(result->'entries') <> 1 THEN
    RAISE EXCEPTION 'FAIL on-behalf-of mail-in entry was not created: %', result;
  END IF;

  written_entry_id := (result->'entries'->0->>'entry_id')::uuid;
  SELECT entry_status INTO written_status FROM public.entries WHERE id = written_entry_id;

  IF written_status IS DISTINCT FROM 'confirmed' THEN
    RAISE EXCEPTION
      'FAIL staff on-behalf-of submission did not auto-accept: entry_status = % (expected confirmed)',
      written_status;
  END IF;

  ----------------------------------------------------------------------------
  -- 2. Exhibitor self-submission, deliberately UNCHANGED: not a show official,
  --    so entry_status stays 'submitted' regardless of this migration.
  ----------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', exhibitor_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', exhibitor_auth, 'role', 'authenticated')::text, true);

  result := public.submit_show_entries(
    show_id, exhibitor_reg_id,
    jsonb_build_array(jsonb_build_object(
      'dog_id', exhibitor_dog, 'class_id', class_b,
      'handler_name', 'MYK9-841 Exhibitor', 'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000000841902'::uuid, 'check');

  IF jsonb_array_length(result->'entries') <> 1 THEN
    RAISE EXCEPTION 'FAIL exhibitor self-service entry was not created: %', result;
  END IF;

  written_entry_id := (result->'entries'->0->>'entry_id')::uuid;
  SELECT entry_status INTO written_status FROM public.entries WHERE id = written_entry_id;

  IF written_status IS DISTINCT FROM 'submitted' THEN
    RAISE EXCEPTION
      'FAIL exhibitor self-submission entry_status regressed: got % (expected submitted)',
      written_status;
  END IF;

  ----------------------------------------------------------------------------
  -- 3. Staff submitting for THEIR OWN dog, deliberately UNCHANGED: v_is_official
  --    is true, but the resolved handler is the caller's own person, so this is
  --    not "on behalf of someone else" -- entry_status stays 'submitted'.
  ----------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', secretary_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', secretary_auth, 'role', 'authenticated')::text, true);

  result := public.submit_show_entries(
    show_id, secretary_reg_id,
    jsonb_build_array(jsonb_build_object(
      'dog_id', secretary_dog, 'class_id', class_c,
      'handler_name', 'Test Secretary', 'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000000841903'::uuid, 'check');

  IF jsonb_array_length(result->'entries') <> 1 THEN
    RAISE EXCEPTION 'FAIL staff self-entry (own dog) was not created: %', result;
  END IF;

  written_entry_id := (result->'entries'->0->>'entry_id')::uuid;
  SELECT entry_status INTO written_status FROM public.entries WHERE id = written_entry_id;

  IF written_status IS DISTINCT FROM 'submitted' THEN
    RAISE EXCEPTION
      'FAIL staff entering their OWN dog was auto-accepted (should stay in her own review lane): entry_status = % (expected submitted)',
      written_status;
  END IF;

  ----------------------------------------------------------------------------
  -- 4. THE SAME secretary submits for HER OWN dog again, but names ANOTHER
  --    person as the handler (an alternate handler). "Own entry" is decided
  --    by dog OWNERSHIP (dogs.owner_id), not by the resolved handler, so
  --    this must ALSO stay 'submitted' -- the regression case for this fix.
  ----------------------------------------------------------------------------
  result := public.submit_show_entries(
    show_id, secretary_reg_id,
    jsonb_build_array(jsonb_build_object(
      'dog_id', secretary_dog, 'class_id', class_d,
      'handler_id', alt_handler, 'handler_name', 'MYK9-841 Exhibitor', 'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000000841904'::uuid, 'check');

  IF jsonb_array_length(result->'entries') <> 1 THEN
    RAISE EXCEPTION 'FAIL staff self-entry (own dog, other handler) was not created: %', result;
  END IF;

  written_entry_id := (result->'entries'->0->>'entry_id')::uuid;
  SELECT entry_status INTO written_status FROM public.entries WHERE id = written_entry_id;

  IF written_status IS DISTINCT FROM 'submitted' THEN
    RAISE EXCEPTION
      'FAIL staff entering their OWN dog with another handler was auto-accepted (ownership, not handler, decides "own"): entry_status = % (expected submitted)',
      written_status;
  END IF;

  RAISE NOTICE 'PASS myk9_841_staff_on_behalf_entries_accepted_test';
END;
$$;

ROLLBACK;
