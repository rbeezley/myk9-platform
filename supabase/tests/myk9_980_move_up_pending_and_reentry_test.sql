-- MYK9-980 (migration 20261004064300): two server-side guards the client
-- already enforces.
--
--   0. Both functions keep SECURITY DEFINER, search_path '' and their ACLs:
--      move_up_entry for authenticated and service_role, never anon;
--      evaluate_entry_capacity for service_role only.
--   M. move_up_entry refuses every status the client's isPendingEntryStatus
--      calls pending (submitted, pending, draft, no-status, pending-payment,
--      paid, promotion-expired) with 22023, HINT entry_not_accepted, and
--      writes nothing; an accepted ('confirmed') entry still moves.
--   R. No online re-entry into a class the dog was withdrawn or pulled from.
--      R1 exhibitor submit_show_entries into a class with a 'withdrawn' row,
--         a 'scratched' (Pull) row, and a check_in_status 'pulled' row: each
--         'denied' with the reason, and no entry is written.
--      R2 exhibitor positive controls: a fresh class is created; a withdrawn
--         row still awaiting payment (payment_status 'pending') does not
--         block; a soft-deleted withdrawn row does not block.
--      R3 staff are exempt: a club admin keying the entry (source defaults to
--         'organizer') and a club admin using the exhibitor wizard (source
--         'self_service', v_is_official) both create the entry.
--      R4 paid-cart fulfillment (create_online_paid_entry, service_role):
--         'denied' with no entry for a withdrawn class, 'created_entry' for a
--         fresh one. The webhook books 'denied' as a no-service line (refund
--         by hand, MYK9-964).
--      R5 a full class with a wait list does not wait-list the dog either:
--         the re-entry check runs before capacity.
--
-- Fixture patterns from myk9_979_online_entries_switch_test.sql (people
-- first, auth.users second with the same email, then auth_user_id; club
-- admin; exhibitor enrollment) and move_up_supersession_test.sql (rows
-- written as service_role so the payment-field trigger allows them). Every
-- (dog, class) pair holding a non-withdrawn, non-scratched row is distinct,
-- so entries_dog_class_unique_idx never applies to a fixture.
--
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.

BEGIN;

CREATE FUNCTION pg_temp.expect(label text, got text, want text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF got IS DISTINCT FROM want THEN
    RAISE EXCEPTION 'FAIL %: expected %, got %', label, want, got;
  END IF;
  RAISE NOTICE 'PASS %', label;
END;
$$;

-- ---------------------------------------------------------------------------
-- 0. Definitions and grants
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect('move_up_entry is SECURITY DEFINER with an empty search_path',
  (SELECT p.prosecdef::text || '|' || array_to_string(p.proconfig, ',')
     FROM pg_proc p WHERE p.oid = 'public.move_up_entry(uuid, uuid, uuid, text)'::regprocedure),
  'true|search_path=""');
SELECT pg_temp.expect('evaluate_entry_capacity is SECURITY DEFINER with an empty search_path',
  (SELECT p.prosecdef::text || '|' || array_to_string(p.proconfig, ',')
     FROM pg_proc p
    WHERE p.oid = 'public.evaluate_entry_capacity(uuid, uuid, uuid, uuid, text, boolean)'::regprocedure),
  'true|search_path=""');
SELECT pg_temp.expect('move_up_entry EXECUTE: anon, authenticated, service_role',
  has_function_privilege('anon', 'public.move_up_entry(uuid, uuid, uuid, text)', 'EXECUTE')::text
  || '|' || has_function_privilege('authenticated', 'public.move_up_entry(uuid, uuid, uuid, text)', 'EXECUTE')::text
  || '|' || has_function_privilege('service_role', 'public.move_up_entry(uuid, uuid, uuid, text)', 'EXECUTE')::text,
  'false|true|true');
SELECT pg_temp.expect('evaluate_entry_capacity EXECUTE: anon, authenticated, service_role',
  has_function_privilege('anon', 'public.evaluate_entry_capacity(uuid, uuid, uuid, uuid, text, boolean)', 'EXECUTE')::text
  || '|' || has_function_privilege('authenticated', 'public.evaluate_entry_capacity(uuid, uuid, uuid, uuid, text, boolean)', 'EXECUTE')::text
  || '|' || has_function_privilege('service_role', 'public.evaluate_entry_capacity(uuid, uuid, uuid, uuid, text, boolean)', 'EXECUTE')::text,
  'false|false|true');

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
INSERT INTO public.clubs (id, name, authorized_at)
VALUES ('00000000-0000-0000-0000-000000980001', 'MYK9-980 Club', now());

INSERT INTO public.club_stripe_accounts (club_id, stripe_account_id, onboarding_complete, payouts_enabled, livemode)
VALUES ('00000000-0000-0000-0000-000000980001', 'acct_myk9980_ready', true, true, false);

SET LOCAL ROLE service_role;
UPDATE public.platform_settings SET stripe_livemode = false WHERE id = true;
RESET ROLE;

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date, online_entries_enabled,
                          accept_check_payments, accept_cash_payments, pre_entry_fee)
VALUES ('00000000-0000-0000-0000-000000980101', 'MYK9-980 Show', 'UKC',
        current_date + 20, current_date + 21, '00000000-0000-0000-0000-000000980001', 'published',
        (current_date - 10)::timestamptz, (current_date + 10)::timestamptz, true, true, true, 30);

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type)
VALUES ('00000000-0000-0000-0000-000000980201', '00000000-0000-0000-0000-000000980101',
        'MYK9-980 Trial', current_date + 20, 'UKC', 'Nosework');

-- Classes 01..14. status_source 'manual' so the derivation trigger cannot
-- rewrite the fixture status. 14 is full (max_entries 1) with a wait list.
INSERT INTO public.classes (id, trial_id, name, element, level, status, status_source, entry_fee,
                            max_entries, allow_waitlist)
SELECT ('00000000-0000-0000-0000-0000009803' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000980201', 'MYK9-980 Class ' || n,
       'Container', 'Novice B', 'upcoming', 'manual', 30,
       CASE WHEN n = 14 THEN 1 END, n = 14
FROM generate_series(1, 14) AS n;

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000980011', 'MYK9-980', 'ClubAdmin', 'myk9-980-admin@example.test'),
  ('00000000-0000-0000-0000-000000980012', 'MYK9-980', 'Exhibitor', 'myk9-980-exhibitor@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000980021', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-980-admin@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000980022', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-980-exhibitor@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

UPDATE public.people
SET auth_user_id = fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000980011'::uuid, '00000000-0000-0000-0000-000000980021'::uuid),
  ('00000000-0000-0000-0000-000000980012'::uuid, '00000000-0000-0000-0000-000000980022'::uuid)
) AS fixture(person_id, auth_id)
WHERE public.people.id = fixture.person_id;

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000980011', roles.id, '00000000-0000-0000-0000-000000980001',
       true, '00000000-0000-0000-0000-000000980021'
FROM public.roles WHERE roles.name = 'club_admin';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.exhibitor_profiles
       WHERE person_id = '00000000-0000-0000-0000-000000980012') <> 1 THEN
    RAISE EXCEPTION 'FIXTURE the exhibitor has no exhibitor_profiles row';
  END IF;
END $$;

-- Dogs 01..04, all owned by the exhibitor. `breed` and `call_name` are NOT
-- NULL without defaults. One primary UKC registration each satisfies
-- trg_entries_require_dog_registration.
INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
SELECT ('00000000-0000-0000-0000-0000009804' || lpad(n::text, 2, '0'))::uuid,
       'MYK9-980 Dog ' || n, 'D' || n, 'Beagle', 'active',
       '00000000-0000-0000-0000-000000980012'
FROM generate_series(1, 4) AS n;
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
SELECT d.id, 'UKC', 'SR980' || substr(d.id::text, 35) || '01', true
FROM public.dogs d
WHERE d.id::text LIKE '00000000-0000-0000-0000-0000009804%';

INSERT INTO public.enrollments (id, show_id, handler_id)
VALUES ('00000000-0000-0000-0000-000000980501', '00000000-0000-0000-0000-000000980101',
        '00000000-0000-0000-0000-000000980012');

-- Existing rows. Dog 01:
--   class 01  'submitted'   the move-up subject (its status is cycled in M)
--   class 03  'withdrawn'   refunded           (R1)
--   class 04  'scratched'   paid  (a Pull)     (R1)
--   class 05  'confirmed' + check_in 'pulled'  (R1)
--   class 06  'withdrawn'   payment pending    (R2: does not block)
--   class 07  'withdrawn'   deleted            (R2: does not block)
--   class 08  'withdrawn'   refunded           (R3: club admin keys it)
--   class 09  'withdrawn'   refunded           (R3: club admin, exhibitor wizard)
-- Dog 02:
--   class 01  'confirmed'   accepted, moved up in M
--   class 11  'withdrawn'   refunded           (R4: paid cart denied)
-- Dog 03:
--   class 14  'withdrawn'   refunded           (R5: full class, wait list)
-- Dog 04:
--   class 14  'confirmed'   fills class 14 (max_entries 1)
SET LOCAL ROLE service_role;
INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, entry_status, check_in_status,
  payment_status, entry_fee, deleted_at
)
VALUES
  ('00000000-0000-0000-0000-000000980601', '00000000-0000-0000-0000-000000980401',
   '00000000-0000-0000-0000-000000980301', '00000000-0000-0000-0000-000000980101',
   '00000000-0000-0000-0000-000000980201', 'submitted', 'no-status', 'pending', 30, NULL),
  ('00000000-0000-0000-0000-000000980603', '00000000-0000-0000-0000-000000980401',
   '00000000-0000-0000-0000-000000980303', '00000000-0000-0000-0000-000000980101',
   '00000000-0000-0000-0000-000000980201', 'withdrawn', 'no-status', 'refunded', 30, NULL),
  ('00000000-0000-0000-0000-000000980604', '00000000-0000-0000-0000-000000980401',
   '00000000-0000-0000-0000-000000980304', '00000000-0000-0000-0000-000000980101',
   '00000000-0000-0000-0000-000000980201', 'scratched', 'no-status', 'paid', 30, NULL),
  ('00000000-0000-0000-0000-000000980605', '00000000-0000-0000-0000-000000980401',
   '00000000-0000-0000-0000-000000980305', '00000000-0000-0000-0000-000000980101',
   '00000000-0000-0000-0000-000000980201', 'confirmed', 'pulled', 'paid', 30, NULL),
  ('00000000-0000-0000-0000-000000980606', '00000000-0000-0000-0000-000000980401',
   '00000000-0000-0000-0000-000000980306', '00000000-0000-0000-0000-000000980101',
   '00000000-0000-0000-0000-000000980201', 'withdrawn', 'no-status', 'pending', 30, NULL),
  ('00000000-0000-0000-0000-000000980607', '00000000-0000-0000-0000-000000980401',
   '00000000-0000-0000-0000-000000980307', '00000000-0000-0000-0000-000000980101',
   '00000000-0000-0000-0000-000000980201', 'withdrawn', 'no-status', 'refunded', 30, now()),
  ('00000000-0000-0000-0000-000000980608', '00000000-0000-0000-0000-000000980401',
   '00000000-0000-0000-0000-000000980308', '00000000-0000-0000-0000-000000980101',
   '00000000-0000-0000-0000-000000980201', 'withdrawn', 'no-status', 'refunded', 30, NULL),
  ('00000000-0000-0000-0000-000000980609', '00000000-0000-0000-0000-000000980401',
   '00000000-0000-0000-0000-000000980309', '00000000-0000-0000-0000-000000980101',
   '00000000-0000-0000-0000-000000980201', 'withdrawn', 'no-status', 'refunded', 30, NULL),
  ('00000000-0000-0000-0000-000000980621', '00000000-0000-0000-0000-000000980402',
   '00000000-0000-0000-0000-000000980301', '00000000-0000-0000-0000-000000980101',
   '00000000-0000-0000-0000-000000980201', 'confirmed', 'no-status', 'paid', 30, NULL),
  ('00000000-0000-0000-0000-000000980631', '00000000-0000-0000-0000-000000980402',
   '00000000-0000-0000-0000-000000980311', '00000000-0000-0000-0000-000000980101',
   '00000000-0000-0000-0000-000000980201', 'withdrawn', 'no-status', 'refunded', 30, NULL),
  ('00000000-0000-0000-0000-000000980641', '00000000-0000-0000-0000-000000980403',
   '00000000-0000-0000-0000-000000980314', '00000000-0000-0000-0000-000000980101',
   '00000000-0000-0000-0000-000000980201', 'withdrawn', 'no-status', 'refunded', 30, NULL),
  ('00000000-0000-0000-0000-000000980642', '00000000-0000-0000-0000-000000980404',
   '00000000-0000-0000-0000-000000980314', '00000000-0000-0000-0000-000000980101',
   '00000000-0000-0000-0000-000000980201', 'confirmed', 'no-status', 'paid', 30, NULL);
RESET ROLE;

-- ---------------------------------------------------------------------------
-- M. move_up_entry and pending entries, as the club admin
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000980021', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000980021","role":"authenticated","app_metadata":{}}', true);

DO $$
DECLARE
  v_status text;
  v_state text;
  v_msg text;
  v_hint text;
  v_count int;
BEGIN
  FOREACH v_status IN ARRAY ARRAY[
    'submitted', 'pending', 'draft', 'no-status', 'pending-payment', 'paid', 'promotion-expired'
  ] LOOP
    -- 'pending' is not a value the CHECK constraint allows, so it cannot be
    -- stored; the server set names it anyway to match the client classifier.
    CONTINUE WHEN v_status = 'pending';
    -- Superuser write of the fixture status (bypasses RLS; triggers still run).
    EXECUTE 'RESET ROLE';
    UPDATE public.entries SET entry_status = v_status
     WHERE id = '00000000-0000-0000-0000-000000980601';
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      PERFORM public.move_up_entry(
        '00000000-0000-0000-0000-000000980601',
        '00000000-0000-0000-0000-000000980302',
        '00000000-0000-0000-0000-000000980701'
      );
      RAISE EXCEPTION 'FAIL M move_up_entry moved a % entry', v_status;
    EXCEPTION WHEN SQLSTATE '22023' THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT, v_hint = PG_EXCEPTION_HINT;
      IF v_msg IS DISTINCT FROM 'This entry has not been accepted yet. Accept it before moving it up.'
         OR v_hint IS DISTINCT FROM 'entry_not_accepted' THEN
        RAISE EXCEPTION 'FAIL M a % entry was refused for the wrong reason: % (hint %)', v_status, v_msg, v_hint;
      END IF;
    END;
    RAISE NOTICE 'PASS M move_up_entry refuses a % entry with 22023 entry_not_accepted', v_status;
  END LOOP;

  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_count FROM public.entries
   WHERE id = '00000000-0000-0000-0000-000000980701'
      OR (id = '00000000-0000-0000-0000-000000980601' AND entry_status = 'moved');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL M a refused move-up wrote % rows', v_count;
  END IF;
  RAISE NOTICE 'PASS M refused move-ups write nothing';
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- Positive control: an accepted entry still moves.
  PERFORM public.move_up_entry(
    '00000000-0000-0000-0000-000000980621',
    '00000000-0000-0000-0000-000000980302',
    '00000000-0000-0000-0000-000000980702'
  );
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_count FROM public.entries
   WHERE (id = '00000000-0000-0000-0000-000000980702'
          AND class_id = '00000000-0000-0000-0000-000000980302'
          AND entry_status = 'confirmed')
      OR (id = '00000000-0000-0000-0000-000000980621' AND entry_status = 'moved');
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'FAIL M an accepted entry did not move up (% of 2 rows)', v_count;
  END IF;
  RAISE NOTICE 'PASS M an accepted (confirmed) entry still moves up';
END;
$$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- R1-R2. The exhibitor, through submit_show_entries
-- ---------------------------------------------------------------------------
CREATE FUNCTION pg_temp.submit_as(p_auth uuid, p_class uuid, p_dog uuid, p_submission uuid,
                                  p_source text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_entry jsonb;
  v_result jsonb;
BEGIN
  v_entry := jsonb_build_object('dog_id', p_dog, 'class_id', p_class,
                                'handler_name', 'MYK9-980 Exhibitor', 'client_fee_cents', 3000);
  IF p_source IS NOT NULL THEN
    v_entry := v_entry || jsonb_build_object('submission_source', p_source);
  END IF;
  PERFORM set_config('request.jwt.claim.sub', p_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', p_auth, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_result := public.submit_show_entries(
    '00000000-0000-0000-0000-000000980101', '00000000-0000-0000-0000-000000980501',
    jsonb_build_array(v_entry), p_submission, 'check');
  EXECUTE 'RESET ROLE';
  RETURN v_result->'outcomes'->0;
END;
$$;

CREATE FUNCTION pg_temp.live_rows(p_dog uuid, p_class uuid)
RETURNS text LANGUAGE sql AS $$
  SELECT count(*)::text FROM public.entries
   WHERE dog_id = p_dog AND class_id = p_class AND deleted_at IS NULL
     AND entry_status NOT IN ('withdrawn', 'scratched')
     AND check_in_status IS DISTINCT FROM 'pulled';
$$;

-- R1: withdrawn, scratched (Pull), pulled at check-in. Each denied, nothing written.
SELECT pg_temp.expect('R1 exhibitor re-entry into a withdrawn class is denied with the reason',
  (SELECT o->>'outcome' || '|' || coalesce(o->>'denial_reason', '') FROM pg_temp.submit_as(
     '00000000-0000-0000-0000-000000980022', '00000000-0000-0000-0000-000000980303',
     '00000000-0000-0000-0000-000000980401', '00000000-0000-0000-0000-000000980901') o),
  'denied|dog was withdrawn or pulled from this class');
SELECT pg_temp.expect('R1 a denied withdrawn re-entry writes no entry',
  pg_temp.live_rows('00000000-0000-0000-0000-000000980401', '00000000-0000-0000-0000-000000980303'), '0');

SELECT pg_temp.expect('R1 exhibitor re-entry into a class the dog was Pulled (scratched) from is denied',
  (SELECT o->>'outcome' || '|' || coalesce(o->>'denial_reason', '') FROM pg_temp.submit_as(
     '00000000-0000-0000-0000-000000980022', '00000000-0000-0000-0000-000000980304',
     '00000000-0000-0000-0000-000000980401', '00000000-0000-0000-0000-000000980902') o),
  'denied|dog was withdrawn or pulled from this class');
SELECT pg_temp.expect('R1 a denied scratched re-entry writes no entry',
  pg_temp.live_rows('00000000-0000-0000-0000-000000980401', '00000000-0000-0000-0000-000000980304'), '0');

SELECT pg_temp.expect('R1 exhibitor re-entry into a class the dog was pulled from at check-in is denied',
  (SELECT o->>'outcome' || '|' || coalesce(o->>'denial_reason', '') FROM pg_temp.submit_as(
     '00000000-0000-0000-0000-000000980022', '00000000-0000-0000-0000-000000980305',
     '00000000-0000-0000-0000-000000980401', '00000000-0000-0000-0000-000000980903') o),
  'denied|dog was withdrawn or pulled from this class');

-- R2: positive controls.
SELECT pg_temp.expect('R2 exhibitor entry into a fresh class is created',
  (SELECT o->>'outcome' FROM pg_temp.submit_as(
     '00000000-0000-0000-0000-000000980022', '00000000-0000-0000-0000-000000980310',
     '00000000-0000-0000-0000-000000980401', '00000000-0000-0000-0000-000000980904') o),
  'created');
SELECT pg_temp.expect('R2 a withdrawn row still awaiting payment does not block',
  (SELECT o->>'outcome' FROM pg_temp.submit_as(
     '00000000-0000-0000-0000-000000980022', '00000000-0000-0000-0000-000000980306',
     '00000000-0000-0000-0000-000000980401', '00000000-0000-0000-0000-000000980905') o),
  'created');
SELECT pg_temp.expect('R2 a soft-deleted withdrawn row does not block',
  (SELECT o->>'outcome' FROM pg_temp.submit_as(
     '00000000-0000-0000-0000-000000980022', '00000000-0000-0000-0000-000000980307',
     '00000000-0000-0000-0000-000000980401', '00000000-0000-0000-0000-000000980906') o),
  'created');

-- ---------------------------------------------------------------------------
-- R3. Staff are exempt
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect('R3 a club admin keying the entry (organizer) re-enters a withdrawn class',
  (SELECT o->>'outcome' FROM pg_temp.submit_as(
     '00000000-0000-0000-0000-000000980021', '00000000-0000-0000-0000-000000980308',
     '00000000-0000-0000-0000-000000980401', '00000000-0000-0000-0000-000000980907') o),
  'created');
SELECT pg_temp.expect('R3 a club admin using the exhibitor wizard (self_service) re-enters a withdrawn class',
  (SELECT o->>'outcome' FROM pg_temp.submit_as(
     '00000000-0000-0000-0000-000000980021', '00000000-0000-0000-0000-000000980309',
     '00000000-0000-0000-0000-000000980401', '00000000-0000-0000-0000-000000980908',
     'self_service') o),
  'created');

-- The rule is keyed on the self-service source as well as the caller: a
-- staff-only source is exempt even without the official flag.
SET LOCAL ROLE service_role;
SELECT pg_temp.expect('R3 an organizer-source request is not refused for a withdrawn class',
  (SELECT c.outcome FROM public.evaluate_entry_capacity(
     '00000000-0000-0000-0000-000000980311', '00000000-0000-0000-0000-000000980402',
     NULL, NULL, 'organizer', false) c),
  'available');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- R4. Paid-cart fulfillment, as stripe-webhook calls it
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_exhibitor uuid;
  r record;
  v_count int;
BEGIN
  SELECT id INTO v_exhibitor FROM public.exhibitor_profiles
   WHERE person_id = '00000000-0000-0000-0000-000000980012';

  SELECT * INTO r FROM public.create_online_paid_entry(
    '00000000-0000-0000-0000-000000980402', '00000000-0000-0000-0000-000000980311', NULL, 30,
    NULL, NULL, 'pi_test_980_denied', now(),
    '00000000-0000-0000-0000-000000980101', '00000000-0000-0000-0000-000000980201',
    v_exhibitor, false);
  IF r.outcome IS DISTINCT FROM 'denied' OR r.entry_id IS NOT NULL OR r.waitlist_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL R4 paid cart into a withdrawn class returned %/%/%',
      r.outcome, r.entry_id, r.waitlist_entry_id;
  END IF;
  SELECT count(*) INTO v_count FROM public.entries
   WHERE stripe_payment_intent_id = 'pi_test_980_denied';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL R4 a denied paid line wrote % entries', v_count;
  END IF;
  RAISE NOTICE 'PASS R4 paid cart line into a withdrawn class is denied and writes no entry';

  SELECT * INTO r FROM public.create_online_paid_entry(
    '00000000-0000-0000-0000-000000980402', '00000000-0000-0000-0000-000000980312', NULL, 30,
    NULL, NULL, 'pi_test_980_created', now(),
    '00000000-0000-0000-0000-000000980101', '00000000-0000-0000-0000-000000980201',
    v_exhibitor, false);
  IF r.outcome IS DISTINCT FROM 'created_entry' OR r.entry_id IS NULL THEN
    RAISE EXCEPTION 'FAIL R4 paid cart into a fresh class returned %', r.outcome;
  END IF;
  RAISE NOTICE 'PASS R4 paid cart line into a fresh class is created';

  -- R5. A full class with a wait list: denied, not wait-listed.
  SELECT * INTO r FROM public.create_online_paid_entry(
    '00000000-0000-0000-0000-000000980403', '00000000-0000-0000-0000-000000980314', NULL, 30,
    NULL, NULL, 'pi_test_980_full', now(),
    '00000000-0000-0000-0000-000000980101', '00000000-0000-0000-0000-000000980201',
    v_exhibitor, false);
  SELECT count(*) INTO v_count FROM public.waitlist_entries
   WHERE dog_id = '00000000-0000-0000-0000-000000980403'
     AND class_id = '00000000-0000-0000-0000-000000980314';
  IF r.outcome IS DISTINCT FROM 'denied' OR v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL R5 full class with a wait list returned % with % wait-list rows',
      r.outcome, v_count;
  END IF;
  RAISE NOTICE 'PASS R5 a withdrawn dog is not wait-listed for a full class';
END;
$$;
RESET ROLE;

ROLLBACK;
