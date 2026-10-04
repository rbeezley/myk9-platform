-- Behavioral test for the submit_show_entries half of
-- 20260930214300_myk9_878_junior_handler_fee_pricing.sql (MYK9-878). The pricing
-- function and the offline trigger are myk9_878_price_entry_fee_test.sql.
--
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.
-- (Behavioral SQL tests run only in CI; there is no container runtime locally.)
--
-- Cases, each as the real caller, PostgREST-shaped (`authenticated`). Richard dropped
-- the automatic owner/age-derived arm (MYK9-664 oracle, Codex P1), so the junior fee is
-- charged ONLY on an explicit secretary / site-admin override:
--   1. a junior exhibitor (a real junior with a date of birth on file) enters their own
--      dog with no override: the NORMAL fee, outcome says no junior fee applied;
--   2. the secretary enters an adult-owned dog: the normal fee;
--   3. the secretary OVERRIDES on that adult-owned dog: junior fee, stamped with
--      the secretary's people.id, and the outcome says so;
--   4. two-entry bootstrap: the secretary enters one dog twice with an UNRELATED
--      junior as the named handler: neither entry is junior-priced;
--   5. the exhibitor asks for the override: refused 42501 (positive control: case 1);
--   6. the secretary overrides on a show with NO junior fee: the normal fee, no stamp;
--   7. cash received follows the SERVER fee: with an override the ledger row and the
--      enrollment total are the junior fee, not the client's normal fee;
--   8. a client that sends LESS than the server fee is still refused (unchanged).
-- Junior = 15 on the trial date; adult = 1980-01-01. The dates of birth are seeded on
-- purpose: they must make no difference to any fee.

BEGIN;

-- MYK9-979: this file predates the per-show online-entries switch
-- (shows.online_entries_enabled, DEFAULT false) and exercises the online-
-- entries-ON path: exhibitor submit_show_entries calls and/or the Stripe
-- publish refusal. Every fixture show it creates takes online entries.
-- Transaction-local like every other fixture here: the ROLLBACK at the end of
-- this file restores the column default. The switch itself is covered by
-- myk9_979_online_entries_switch_test.sql.
ALTER TABLE public.shows ALTER COLUMN online_entries_enabled SET DEFAULT true;

CREATE FUNCTION pg_temp.expect(label text, got text, want text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF got IS DISTINCT FROM want THEN
    RAISE EXCEPTION 'FAIL %: expected %, got %', label, want, got;
  END IF;
  RAISE NOTICE 'PASS %', label;
END;
$$;

-- Schema-only databases carry no seeded roles; match entries_insert_show_scope_test.sql.
INSERT INTO public.roles (id, name, description, is_system)
VALUES ('00000000-0000-0000-0000-000000878a81', 'secretary', 'MYK9-878 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000878a10', 'MYK9-878 Submit Club');

-- Entries open, shows a month out: every entry is a 30.00 pre-entry (no day-of).
-- S1 has a 15.00 junior fee; S2 has none.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date,
                          accept_check_payments, accept_cash_payments,
                          pre_entry_fee, day_of_show_fee, junior_handler_fee)
SELECT v.id, v.name, 'AKC',
       (today + 30)::timestamp AT TIME ZONE 'UTC', (today + 30)::timestamp AT TIME ZONE 'UTC',
       '00000000-0000-0000-0000-000000878a10', 'published',
       (today - 30)::timestamp AT TIME ZONE 'UTC', (today + 10)::timestamp AT TIME ZONE 'UTC',
       true, true, 30, 35, v.junior_fee
FROM (SELECT (now() AT TIME ZONE 'UTC')::date AS today) AS anchor,
     (VALUES
       ('00000000-0000-0000-0000-000000878a11'::uuid, 'MYK9-878 Junior Fee Show', 15::numeric),
       ('00000000-0000-0000-0000-000000878a12'::uuid, 'MYK9-878 No Junior Fee Show', NULL::numeric)
     ) AS v(id, name, junior_fee);

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone)
VALUES
  ('00000000-0000-0000-0000-000000878a21', '00000000-0000-0000-0000-000000878a11',
   'MYK9-878 Trial 1', (now() AT TIME ZONE 'UTC')::date + 30, 'AKC', 'Scent Work', 'UTC'),
  ('00000000-0000-0000-0000-000000878a22', '00000000-0000-0000-0000-000000878a12',
   'MYK9-878 Trial 2', (now() AT TIME ZONE 'UTC')::date + 30, 'AKC', 'Scent Work', 'UTC');

INSERT INTO public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
SELECT ('00000000-0000-0000-0000-0000008783' || lpad(n::text, 2, '0'))::uuid,
       '00000000-0000-0000-0000-000000878a21', 'MYK9-878 Class ' || n,
       'Container', 'Novice', 'upcoming', 'manual', 30
FROM generate_series(1, 6) AS n;
INSERT INTO public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
VALUES ('00000000-0000-0000-0000-000000878331', '00000000-0000-0000-0000-000000878a22',
        'MYK9-878 No Junior Fee Class', 'Container', 'Novice', 'upcoming', 'manual', 30);

-- 001 junior exhibitor (owns JR), 002 adult owner (owns AD and OT; mail-in),
-- 003 unrelated junior, 004 secretary.
INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000878a01', 'MYK9-878', 'JuniorExhibitor', 'myk9-878-jr-exhibitor@example.test'),
  ('00000000-0000-0000-0000-000000878a02', 'MYK9-878', 'AdultOwner', 'myk9-878-adult-owner@example.test'),
  ('00000000-0000-0000-0000-000000878a03', 'MYK9-878', 'UnrelatedJunior', 'myk9-878-unrelated@example.test'),
  ('00000000-0000-0000-0000-000000878a04', 'MYK9-878', 'Secretary', 'myk9-878-secretary@example.test');

INSERT INTO public.people_private (person_id, date_of_birth)
SELECT p.person_id, ((now() AT TIME ZONE 'UTC')::date + 30 - INTERVAL '15 years')::date
FROM (VALUES ('00000000-0000-0000-0000-000000878a01'::uuid),
             ('00000000-0000-0000-0000-000000878a03'::uuid)) AS p(person_id);
INSERT INTO public.people_private (person_id, date_of_birth)
VALUES ('00000000-0000-0000-0000-000000878a02', DATE '1980-01-01');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000878b01', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-878-jr-exhibitor@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000878b04', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-878-secretary@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

UPDATE public.people
SET auth_user_id = fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000878a01'::uuid, '00000000-0000-0000-0000-000000878b01'::uuid),
  ('00000000-0000-0000-0000-000000878a04'::uuid, '00000000-0000-0000-0000-000000878b04'::uuid)
) AS fixture(person_id, auth_id)
WHERE public.people.id = fixture.person_id;

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000878a04', roles.id,
       '00000000-0000-0000-0000-000000878a10', true,
       '00000000-0000-0000-0000-000000878b04'
FROM public.roles WHERE roles.name = 'secretary';

INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
VALUES
  ('00000000-0000-0000-0000-000000878c01', 'MYK9-878 JR', 'JR', 'Beagle', 'active',
   '00000000-0000-0000-0000-000000878a01'),
  ('00000000-0000-0000-0000-000000878c02', 'MYK9-878 AD', 'AD', 'Beagle', 'active',
   '00000000-0000-0000-0000-000000878a02'),
  ('00000000-0000-0000-0000-000000878c03', 'MYK9-878 OT', 'OT', 'Beagle', 'active',
   '00000000-0000-0000-0000-000000878a02');

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
VALUES
  ('00000000-0000-0000-0000-000000878c01', 'AKC', 'SR8780101', true),
  ('00000000-0000-0000-0000-000000878c02', 'AKC', 'SR8780102', true),
  ('00000000-0000-0000-0000-000000878c03', 'AKC', 'SR8780103', true);

-- One enrollment per (show, handler): idx_enrollments_show_handler is UNIQUE, so the
-- cash case (7) shares e1 with case 1. That is safe for the ledger asserts because
-- case 1 sends no p_payment, so e1 carries no total, no payment and no ledger row
-- until case 7 (asserted below as the exact amounts).
-- e1: the junior exhibitor's (self-service in case 1, secretary-keyed cash in case 7).
-- e2: the adult owner's (mail-in, secretary keys). e3: the adult owner's on the
-- no-junior-fee show.
INSERT INTO public.enrollments (id, show_id, handler_id, payment_status)
VALUES
  ('00000000-0000-0000-0000-000000878d01', '00000000-0000-0000-0000-000000878a11',
   '00000000-0000-0000-0000-000000878a01', 'pending'),
  ('00000000-0000-0000-0000-000000878d02', '00000000-0000-0000-0000-000000878a11',
   '00000000-0000-0000-0000-000000878a02', 'pending'),
  ('00000000-0000-0000-0000-000000878d03', '00000000-0000-0000-0000-000000878a12',
   '00000000-0000-0000-0000-000000878a02', 'pending');

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  exhibitor_auth CONSTANT uuid := '00000000-0000-0000-0000-000000878b01';
  secretary_auth CONSTANT uuid := '00000000-0000-0000-0000-000000878b04';
  s1             CONSTANT uuid := '00000000-0000-0000-0000-000000878a11';
  s2             CONSTANT uuid := '00000000-0000-0000-0000-000000878a12';
  jr_dog         CONSTANT uuid := '00000000-0000-0000-0000-000000878c01';
  ad_dog         CONSTANT uuid := '00000000-0000-0000-0000-000000878c02';
  ot_dog         CONSTANT uuid := '00000000-0000-0000-0000-000000878c03';
  unrelated_jr   CONSTANT uuid := '00000000-0000-0000-0000-000000878a03';
  result         jsonb;
BEGIN
  -- 1. the junior exhibitor, self-service, no override. The client sends the normal fee.
  PERFORM set_config('request.jwt.claim.sub', exhibitor_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', exhibitor_auth, 'role', 'authenticated')::text, true);
  result := public.submit_show_entries(
    s1, '00000000-0000-0000-0000-000000878d01',
    jsonb_build_array(jsonb_build_object(
      'dog_id', jr_dog, 'class_id', '00000000-0000-0000-0000-000000878301',
      'handler_name', 'MYK9-878 JuniorExhibitor', 'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000000878e01'::uuid, 'check');
  PERFORM set_config('myk9878.case1', result::text, true);

  -- 5. the exhibitor asks for the override: refused, nothing written.
  BEGIN
    PERFORM public.submit_show_entries(
      s1, '00000000-0000-0000-0000-000000878d01',
      jsonb_build_array(jsonb_build_object(
        'dog_id', jr_dog, 'class_id', '00000000-0000-0000-0000-000000878303',
        'handler_name', 'MYK9-878 JuniorExhibitor', 'client_fee_cents', 3000,
        'junior_fee_override', true)),
      '00000000-0000-0000-0000-000000878e05'::uuid, 'check');
    RAISE EXCEPTION 'FAIL case 5: an exhibitor charged the junior fee through the override';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS case 5: an exhibitor cannot request the junior fee override (42501)';
  END;

  -- 8. a client that sends LESS than the server fee is still refused.
  BEGIN
    PERFORM public.submit_show_entries(
      s1, '00000000-0000-0000-0000-000000878d01',
      jsonb_build_array(jsonb_build_object(
        'dog_id', jr_dog, 'class_id', '00000000-0000-0000-0000-000000878304',
        'handler_name', 'MYK9-878 JuniorExhibitor', 'client_fee_cents', 1000)),
      '00000000-0000-0000-0000-000000878e08'::uuid, 'check');
    RAISE EXCEPTION 'FAIL case 8: a client fee below the server fee was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    RAISE NOTICE 'PASS case 8: a client fee below the server fee is still refused';
  END;

  -- Everything else is the secretary.
  PERFORM set_config('request.jwt.claim.sub', secretary_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', secretary_auth, 'role', 'authenticated')::text, true);

  -- 2. adult-owned dog, no handler id (resolves to the adult owner): the normal fee.
  result := public.submit_show_entries(
    s1, '00000000-0000-0000-0000-000000878d02',
    jsonb_build_array(jsonb_build_object(
      'dog_id', ad_dog, 'class_id', '00000000-0000-0000-0000-000000878301',
      'handler_name', 'MYK9-878 AdultOwner', 'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000000878e02'::uuid, 'check');
  PERFORM set_config('myk9878.case2', result::text, true);

  -- 3. the same adult-owned dog, secretary override.
  result := public.submit_show_entries(
    s1, '00000000-0000-0000-0000-000000878d02',
    jsonb_build_array(jsonb_build_object(
      'dog_id', ad_dog, 'class_id', '00000000-0000-0000-0000-000000878302',
      'handler_name', 'MYK9-878 AdultOwner', 'client_fee_cents', 1500,
      'junior_fee_override', true)),
    '00000000-0000-0000-0000-000000878e03'::uuid, 'check');
  PERFORM set_config('myk9878.case3', result::text, true);

  -- 4. bootstrap: two entries, an unrelated junior named as the handler.
  result := public.submit_show_entries(
    s1, '00000000-0000-0000-0000-000000878d02',
    jsonb_build_array(
      jsonb_build_object('dog_id', ot_dog, 'class_id', '00000000-0000-0000-0000-000000878303',
        'handler_id', unrelated_jr, 'handler_name', 'MYK9-878 UnrelatedJunior',
        'client_fee_cents', 3000),
      jsonb_build_object('dog_id', ot_dog, 'class_id', '00000000-0000-0000-0000-000000878304',
        'handler_id', unrelated_jr, 'handler_name', 'MYK9-878 UnrelatedJunior',
        'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000000878e04'::uuid, 'check');
  PERFORM set_config('myk9878.case4', result::text, true);

  -- 6. override on the show with no junior fee.
  result := public.submit_show_entries(
    s2, '00000000-0000-0000-0000-000000878d03',
    jsonb_build_array(jsonb_build_object(
      'dog_id', ad_dog, 'class_id', '00000000-0000-0000-0000-000000878331',
      'handler_name', 'MYK9-878 AdultOwner', 'client_fee_cents', 3000,
      'junior_fee_override', true)),
    '00000000-0000-0000-0000-000000878e06'::uuid, 'check');
  PERFORM set_config('myk9878.case6', result::text, true);

  -- 7. cash received with an explicit override: the ledger follows the server fee.
  result := public.submit_show_entries(
    s1, '00000000-0000-0000-0000-000000878d01',
    jsonb_build_array(jsonb_build_object(
      'dog_id', jr_dog, 'class_id', '00000000-0000-0000-0000-000000878302',
      'handler_name', 'MYK9-878 JuniorExhibitor', 'client_fee_cents', 3000,
      'junior_fee_override', true)),
    '00000000-0000-0000-0000-000000878e07'::uuid, 'cash',
    jsonb_build_object('method', 'cash', 'reference', 'MYK9-878'));
  PERFORM set_config('myk9878.case7', result::text, true);
END;
$$;

RESET ROLE;

-- The stamp has no API-role SELECT grant, so every read below is the test owner's.
CREATE FUNCTION pg_temp.entry_of(case_key text, idx int) RETURNS uuid LANGUAGE sql AS $$
  SELECT ((current_setting('myk9878.' || case_key)::jsonb -> 'entries' -> idx) ->> 'entry_id')::uuid;
$$;
CREATE FUNCTION pg_temp.fee_of(case_key text, idx int) RETURNS text LANGUAGE sql AS $$
  SELECT entry_fee::numeric(10, 2)::text FROM public.entries WHERE id = pg_temp.entry_of(case_key, idx);
$$;
CREATE FUNCTION pg_temp.stamp_of(case_key text, idx int) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(junior_fee_override_by::text, 'none')
    FROM public.entries WHERE id = pg_temp.entry_of(case_key, idx);
$$;
CREATE FUNCTION pg_temp.outcome(case_key text, idx int, field text) RETURNS text LANGUAGE sql AS $$
  SELECT (current_setting('myk9878.' || case_key)::jsonb -> 'outcomes' -> idx) ->> field;
$$;

SELECT pg_temp.expect('1 junior exhibitor, no override: stored fee is the normal fee',
  pg_temp.fee_of('case1', 0), '30.00');
SELECT pg_temp.expect('1 junior exhibitor, no override: outcome fee_cents is the normal fee',
  pg_temp.outcome('case1', 0, 'fee_cents'), '3000');
SELECT pg_temp.expect('1 junior exhibitor, no override: outcome says no junior fee applied',
  pg_temp.outcome('case1', 0, 'junior_fee_applied'), 'false');
SELECT pg_temp.expect('1 junior exhibitor, no override: no stamp',
  pg_temp.stamp_of('case1', 0), 'none');

SELECT pg_temp.expect('2 adult-owned dog: normal fee',
  pg_temp.fee_of('case2', 0), '30.00');
SELECT pg_temp.expect('2 adult-owned dog: outcome fee_cents', pg_temp.outcome('case2', 0, 'fee_cents'), '3000');
SELECT pg_temp.expect('2 adult-owned dog: junior fee not applied',
  pg_temp.outcome('case2', 0, 'junior_fee_applied'), 'false');

SELECT pg_temp.expect('3 secretary override: junior fee stored',
  pg_temp.fee_of('case3', 0), '15.00');
SELECT pg_temp.expect('3 secretary override: outcome says so',
  pg_temp.outcome('case3', 0, 'junior_fee_applied'), 'true');
SELECT pg_temp.expect('3 secretary override: stamped with the secretary''s people id',
  pg_temp.stamp_of('case3', 0), '00000000-0000-0000-0000-000000878a04');

SELECT pg_temp.expect('4 bootstrap: first entry for an unrelated junior is the normal fee',
  pg_temp.fee_of('case4', 0), '30.00');
SELECT pg_temp.expect('4 bootstrap: second entry is still the normal fee',
  pg_temp.fee_of('case4', 1), '30.00');

SELECT pg_temp.expect('5 the refused override wrote no entry',
  (SELECT count(*)::text FROM public.entries
    WHERE dog_id = '00000000-0000-0000-0000-000000878c01'
      AND class_id = '00000000-0000-0000-0000-000000878303'), '0');

SELECT pg_temp.expect('6 override on a show with no junior fee: normal fee',
  pg_temp.fee_of('case6', 0), '30.00');
SELECT pg_temp.expect('6 override on a show with no junior fee: no stamp',
  pg_temp.stamp_of('case6', 0), 'none');

SELECT pg_temp.expect('7 cash: entry stored at the junior fee', pg_temp.fee_of('case7', 0), '15.00');
SELECT pg_temp.expect('7 cash: stamped with the secretary''s people id',
  pg_temp.stamp_of('case7', 0), '00000000-0000-0000-0000-000000878a04');
SELECT pg_temp.expect('7 cash: the ledger row is the junior fee, not the client''s 30.00',
  (SELECT sum(amount)::numeric(10, 2)::text FROM public.show_payments
    WHERE enrollment_id = '00000000-0000-0000-0000-000000878d01'), '15.00');
SELECT pg_temp.expect('7 cash: the enrollment total (cents) is the junior fee',
  (SELECT total_amount::text FROM public.enrollments
    WHERE id = '00000000-0000-0000-0000-000000878d01'), '1500');
SELECT pg_temp.expect('7 cash: paid equals the junior fee',
  (SELECT paid_amount::numeric(10, 2)::text FROM public.enrollments
    WHERE id = '00000000-0000-0000-0000-000000878d01'), '15.00');

ROLLBACK;
