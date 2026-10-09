-- Behavioral test for 20261007205300_myk9_1048_online_entries_next_run_order.sql (MYK9-1048).
--
-- An entry created by `submit_show_entries` into a class that already has a
-- run order must take the next position, by the same rule as the offline
-- late-entry writer (`nextRunOrderByClass` in submitOfflineLateEntry.ts):
-- MAX(run_order) + 1 over the class's non-deleted entries with run_order > 0,
-- whatever their status; NULL when the class has no order yet.
--
-- Why each case earns its place:
--   1. Class A is ordered 1, 2 (live), 3 (pulled), 4 (withdrawn), plus a
--      SOFT-DELETED row at 9. Two dogs into A in ONE submission get 5 and 6:
--      pulled/withdrawn rows count (a fix that filtered by status would give
--      3, 4 or 4, 5), the deleted row does not (a fix that ignored deleted_at
--      would give 10, 11), and the second dog sees the first (a position
--      computed once per submission would give 5, 5).
--   2. In the SAME submission, class C (ordered up to 10) gets 11: each class
--      has its own next position, not one shared counter.
--   3. In the SAME submission, class B has rows but no order (NULL and 0):
--      the new entry stays NULL. A fix using COALESCE(max, 0) + 1 would
--      invent position 1 for a class nobody has ordered.
--   4. In the SAME submission, class D's only positive run_order is on a
--      soft-deleted row: the class has no live order, so NULL.
--   5. A SECOND submission into A appends after the first's rows (7).
--   6. CARD CHECKOUT (fulfill_cart_line -> create_online_paid_entry), one
--      paid cart, three lines worked in order:
--        a. a dog withdrawn from A re-entering A -> DENIED by the capacity
--           decision, no entry, so no position is taken;
--        b. a dog into A -> 8 (after case 5's 7; 9 would mean the denied
--           line took one);
--        c. a dog into unordered B -> NULL.
--   7. A REDELIVERED fulfill of line (b) replays the recorded outcome: same
--      entry id, still one entry for that dog in A, and A's last position
--      is still 8.
--
-- Concurrency (two sessions racing on one class) cannot be exercised from a
-- single psql session; the guarantee is the class advisory lock, asserted
-- structurally by the migration's own text and shared with
-- evaluate_entry_capacity.
--
-- Run against a database where all migrations are applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/myk9_1048_submit_entries_next_run_order_test.sql
-- All fixtures roll back.

BEGIN;

-- MYK9-979: fixture shows take online entries (transaction-local default).
ALTER TABLE public.shows ALTER COLUMN online_entries_enabled SET DEFAULT true;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000001048010', 'MYK9-1048 Test Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date,
                          accept_check_payments, accept_cash_payments, pre_entry_fee)
VALUES (
  '00000000-0000-0000-0000-000001048100', 'MYK9-1048 Run Order Show', 'UKC',
  current_date + 5, current_date + 6, '00000000-0000-0000-0000-000001048010', 'published',
  (current_date - 10)::timestamptz, (current_date + 4)::timestamptz,
  true, true, 30
);

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type)
VALUES (
  '00000000-0000-0000-0000-000001048200', '00000000-0000-0000-0000-000001048100',
  'MYK9-1048 Saturday Trial', current_date + 5, 'UKC', 'Nosework'
);

INSERT INTO public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
VALUES
  ('00000000-0000-0000-0000-000001048301', '00000000-0000-0000-0000-000001048200',
   'Novice B Container', 'Container', 'Novice B', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000001048302', '00000000-0000-0000-0000-000001048200',
   'Novice B Interior', 'Interior', 'Novice B', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000001048303', '00000000-0000-0000-0000-000001048200',
   'Novice B Exterior', 'Exterior', 'Novice B', 'upcoming', 'manual', 30),
  ('00000000-0000-0000-0000-000001048304', '00000000-0000-0000-0000-000001048200',
   'Novice B Vehicle', 'Vehicle', 'Novice B', 'upcoming', 'manual', 30);

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000001048001', 'MYK9-1048', 'Owner', 'myk9-1048-owner@example.test'),
  ('00000000-0000-0000-0000-000001048002', 'MYK9-1048', 'Secretary', 'myk9-1048-secretary@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000001048101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1048-secretary@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

UPDATE public.people
SET auth_user_id = '00000000-0000-0000-0000-000001048101'
WHERE id = '00000000-0000-0000-0000-000001048002';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000001048002', roles.id,
       '00000000-0000-0000-0000-000001048010', true,
       '00000000-0000-0000-0000-000001048101'
FROM public.roles WHERE roles.name = 'secretary';

-- `breed` and `call_name` are NOT NULL without defaults on public.dogs.
-- 401-408 hold the pre-existing rows; 411-413 are the dogs being entered.
INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
SELECT d.id, d.name, d.name, 'Mixed Breed', 'active', '00000000-0000-0000-0000-000001048001'
FROM (VALUES
  ('00000000-0000-0000-0000-000001048401'::uuid, 'ZZ1048 Live One'),
  ('00000000-0000-0000-0000-000001048402'::uuid, 'ZZ1048 Live Two'),
  ('00000000-0000-0000-0000-000001048403'::uuid, 'ZZ1048 Pulled'),
  ('00000000-0000-0000-0000-000001048404'::uuid, 'ZZ1048 Withdrawn'),
  ('00000000-0000-0000-0000-000001048405'::uuid, 'ZZ1048 Deleted'),
  ('00000000-0000-0000-0000-000001048406'::uuid, 'ZZ1048 Unordered Null'),
  ('00000000-0000-0000-0000-000001048407'::uuid, 'ZZ1048 Unordered Zero'),
  ('00000000-0000-0000-0000-000001048408'::uuid, 'ZZ1048 Deleted Only'),
  ('00000000-0000-0000-0000-000001048411'::uuid, 'ZZ1048 New One'),
  ('00000000-0000-0000-0000-000001048412'::uuid, 'ZZ1048 New Two'),
  ('00000000-0000-0000-0000-000001048413'::uuid, 'ZZ1048 New Three'),
  ('00000000-0000-0000-0000-000001048421'::uuid, 'ZZ1048 Card One'),
  ('00000000-0000-0000-0000-000001048422'::uuid, 'ZZ1048 Card Two'),
  ('00000000-0000-0000-0000-000001048425'::uuid, 'ZZ1048 Card Withdrawn')
) AS d(id, name);

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
SELECT d.id, 'UKC', 'SR1048' || right(d.id::text, 3), true
FROM public.dogs d
WHERE d.id::text LIKE '00000000-0000-0000-0000-000001048%';

-- Pre-existing rows, written directly as the fixture owner.
-- A = 301 (ordered 1..4 live/pulled/withdrawn, deleted at 9)
-- B = 302 (rows, no order: NULL and 0)
-- C = 303 (ordered up to 10)
-- D = 304 (only a soft-deleted row is ordered)
INSERT INTO public.entries (show_id, trial_id, class_id, dog_id, entry_status,
                            check_in_status, run_order, deleted_at)
VALUES
  ('00000000-0000-0000-0000-000001048100', '00000000-0000-0000-0000-000001048200',
   '00000000-0000-0000-0000-000001048301', '00000000-0000-0000-0000-000001048401',
   'confirmed', 'no-status', 1, NULL),
  ('00000000-0000-0000-0000-000001048100', '00000000-0000-0000-0000-000001048200',
   '00000000-0000-0000-0000-000001048301', '00000000-0000-0000-0000-000001048402',
   'confirmed', 'no-status', 2, NULL),
  ('00000000-0000-0000-0000-000001048100', '00000000-0000-0000-0000-000001048200',
   '00000000-0000-0000-0000-000001048301', '00000000-0000-0000-0000-000001048403',
   'confirmed', 'pulled', 3, NULL),
  ('00000000-0000-0000-0000-000001048100', '00000000-0000-0000-0000-000001048200',
   '00000000-0000-0000-0000-000001048301', '00000000-0000-0000-0000-000001048404',
   'withdrawn', 'no-status', 4, NULL),
  ('00000000-0000-0000-0000-000001048100', '00000000-0000-0000-0000-000001048200',
   '00000000-0000-0000-0000-000001048301', '00000000-0000-0000-0000-000001048405',
   'confirmed', 'no-status', 9, now()),
  ('00000000-0000-0000-0000-000001048100', '00000000-0000-0000-0000-000001048200',
   '00000000-0000-0000-0000-000001048302', '00000000-0000-0000-0000-000001048406',
   'confirmed', 'no-status', NULL, NULL),
  ('00000000-0000-0000-0000-000001048100', '00000000-0000-0000-0000-000001048200',
   '00000000-0000-0000-0000-000001048302', '00000000-0000-0000-0000-000001048407',
   'confirmed', 'no-status', 0, NULL),
  ('00000000-0000-0000-0000-000001048100', '00000000-0000-0000-0000-000001048200',
   '00000000-0000-0000-0000-000001048303', '00000000-0000-0000-0000-000001048401',
   'confirmed', 'no-status', 10, NULL),
  ('00000000-0000-0000-0000-000001048100', '00000000-0000-0000-0000-000001048200',
   '00000000-0000-0000-0000-000001048304', '00000000-0000-0000-0000-000001048408',
   'confirmed', 'no-status', 3, now());

-- Case 6a: dog 425 was withdrawn from A (paid, so not a pending line the
-- re-entry guard lets through). run_order NULL, so cases 1-5 are unchanged.
INSERT INTO public.entries (show_id, trial_id, class_id, dog_id, entry_status,
                            payment_status, check_in_status, run_order)
VALUES ('00000000-0000-0000-0000-000001048100', '00000000-0000-0000-0000-000001048200',
        '00000000-0000-0000-0000-000001048301', '00000000-0000-0000-0000-000001048425',
        'withdrawn', 'paid', 'no-status', NULL);

INSERT INTO public.enrollments (id, show_id, handler_id)
VALUES ('00000000-0000-0000-0000-000001048500', '00000000-0000-0000-0000-000001048100',
        '00000000-0000-0000-0000-000001048001');

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  secretary_auth CONSTANT uuid := '00000000-0000-0000-0000-000001048101';
  show_id        CONSTANT uuid := '00000000-0000-0000-0000-000001048100';
  reg_id         CONSTANT uuid := '00000000-0000-0000-0000-000001048500';
  class_a        CONSTANT uuid := '00000000-0000-0000-0000-000001048301';
  class_b        CONSTANT uuid := '00000000-0000-0000-0000-000001048302';
  class_c        CONSTANT uuid := '00000000-0000-0000-0000-000001048303';
  class_d        CONSTANT uuid := '00000000-0000-0000-0000-000001048304';
  new_one        CONSTANT uuid := '00000000-0000-0000-0000-000001048411';
  new_two        CONSTANT uuid := '00000000-0000-0000-0000-000001048412';
  new_three      CONSTANT uuid := '00000000-0000-0000-0000-000001048413';
  result         jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', secretary_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', secretary_auth, 'role', 'authenticated')::text, true);

  ----------------------------------------------------------------------------
  -- Cases 1-4: one submission, five lines across four classes.
  ----------------------------------------------------------------------------
  result := public.submit_show_entries(
    show_id, reg_id,
    jsonb_build_array(
      jsonb_build_object('dog_id', new_one, 'class_id', class_a,
                         'handler_name', 'MYK9-1048 Owner', 'client_fee_cents', 3000),
      jsonb_build_object('dog_id', new_two, 'class_id', class_a,
                         'handler_name', 'MYK9-1048 Owner', 'client_fee_cents', 3000),
      jsonb_build_object('dog_id', new_one, 'class_id', class_c,
                         'handler_name', 'MYK9-1048 Owner', 'client_fee_cents', 3000),
      jsonb_build_object('dog_id', new_one, 'class_id', class_b,
                         'handler_name', 'MYK9-1048 Owner', 'client_fee_cents', 3000),
      jsonb_build_object('dog_id', new_one, 'class_id', class_d,
                         'handler_name', 'MYK9-1048 Owner', 'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000001048901'::uuid, 'check');

  IF jsonb_array_length(result->'entries') <> 5 THEN
    RAISE EXCEPTION 'FAIL expected 5 created entries, got: %', result;
  END IF;
  PERFORM set_config('myk9_1048.first', result::text, true);

  ----------------------------------------------------------------------------
  -- Case 5: a later submission into A appends after case 1's rows.
  ----------------------------------------------------------------------------
  result := public.submit_show_entries(
    show_id, reg_id,
    jsonb_build_array(
      jsonb_build_object('dog_id', new_three, 'class_id', class_a,
                         'handler_name', 'MYK9-1048 Owner', 'client_fee_cents', 3000)),
    '00000000-0000-0000-0000-000001048902'::uuid, 'check');

  IF jsonb_array_length(result->'entries') <> 1 THEN
    RAISE EXCEPTION 'FAIL case 5: expected 1 created entry, got: %', result;
  END IF;

  PERFORM set_config('myk9_1048.second', result::text, true);
END;
$$;

-- Read the rows back as the fixture owner: `entries` is column-allowlisted for
-- API roles, and the assertion is about the stored column, not a view of it.
RESET ROLE;

DO $$
DECLARE
  result    jsonb;
  got       integer;
  got_found boolean;
BEGIN
  result := current_setting('myk9_1048.first')::jsonb;

  SELECT e.run_order INTO got FROM public.entries e
   WHERE e.id = (result->'entries'->0->>'entry_id')::uuid;
  IF got IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'FAIL case 1: first dog into ordered class A got run_order % (expected 5: after live 1-2, pulled 3, withdrawn 4; deleted 9 ignored)', got;
  END IF;

  SELECT e.run_order INTO got FROM public.entries e
   WHERE e.id = (result->'entries'->1->>'entry_id')::uuid;
  IF got IS DISTINCT FROM 6 THEN
    RAISE EXCEPTION 'FAIL case 1: second dog into class A in the same submission got run_order % (expected 6, consecutive)', got;
  END IF;

  SELECT e.run_order INTO got FROM public.entries e
   WHERE e.id = (result->'entries'->2->>'entry_id')::uuid;
  IF got IS DISTINCT FROM 11 THEN
    RAISE EXCEPTION 'FAIL case 2: class C got run_order % (expected 11, its own next position)', got;
  END IF;

  SELECT e.run_order, true INTO got, got_found FROM public.entries e
   WHERE e.id = (result->'entries'->3->>'entry_id')::uuid;
  IF got_found IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL case 3: class B entry not readable';
  END IF;
  IF got IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL case 3: class B has no order (NULL and 0 only) but the new entry got run_order %', got;
  END IF;

  got_found := NULL;
  SELECT e.run_order, true INTO got, got_found FROM public.entries e
   WHERE e.id = (result->'entries'->4->>'entry_id')::uuid;
  IF got_found IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL case 4: class D entry not readable';
  END IF;
  IF got IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL case 4: class D''s only order is a soft-deleted row, but the new entry got run_order %', got;
  END IF;

  result := current_setting('myk9_1048.second')::jsonb;

  SELECT e.run_order INTO got FROM public.entries e
   WHERE e.id = (result->'entries'->0->>'entry_id')::uuid;
  IF got IS DISTINCT FROM 7 THEN
    RAISE EXCEPTION 'FAIL case 5: a later submission into class A got run_order % (expected 7)', got;
  END IF;

  RAISE NOTICE 'PASS myk9_1048_submit_entries_next_run_order_test';
END;
$$;

-- ---------------------------------------------------------------------------
-- Cases 6-7: the card checkout path. The exhibitor (the dogs' owner) pays a
-- cart; the webhook (service_role) works each line through fulfill_cart_line.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES ('00000000-0000-0000-0000-000001048102', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'myk9-1048-owner@example.test', '', now(), now(), now(),
        '{}', '{}', false, false, false);

UPDATE public.people
SET auth_user_id = '00000000-0000-0000-0000-000001048102'
WHERE id = '00000000-0000-0000-0000-000001048001';

INSERT INTO public.exhibitor_profiles (person_id, auth_user_id)
SELECT '00000000-0000-0000-0000-000001048001', '00000000-0000-0000-0000-000001048102'
WHERE NOT EXISTS (SELECT 1 FROM public.exhibitor_profiles
                   WHERE auth_user_id = '00000000-0000-0000-0000-000001048102');

SET LOCAL ROLE service_role;

INSERT INTO public.entry_carts (id, exhibitor_id, show_id, status, expires_at)
SELECT '00000000-0000-0000-0000-000001048601', ep.id, '00000000-0000-0000-0000-000001048100',
       'active', now() + interval '30 minutes'
FROM public.exhibitor_profiles ep
WHERE ep.auth_user_id = '00000000-0000-0000-0000-000001048102';

INSERT INTO public.entry_cart_items (id, cart_id, dog_id, class_id, entry_fee_cents, entry_id, created_at)
VALUES
  ('00000000-0000-0000-0000-000001048731', '00000000-0000-0000-0000-000001048601',
   '00000000-0000-0000-0000-000001048425', '00000000-0000-0000-0000-000001048301',
   3000, NULL, now() - interval '3 minutes'),
  ('00000000-0000-0000-0000-000001048732', '00000000-0000-0000-0000-000001048601',
   '00000000-0000-0000-0000-000001048421', '00000000-0000-0000-0000-000001048301',
   3000, NULL, now() - interval '2 minutes'),
  ('00000000-0000-0000-0000-000001048733', '00000000-0000-0000-0000-000001048601',
   '00000000-0000-0000-0000-000001048422', '00000000-0000-0000-0000-000001048302',
   3000, NULL, now() - interval '1 minute');

-- The session goes on AFTER the lines: every line insert severs it.
UPDATE public.entry_carts SET stripe_checkout_session_id = 'cs_test_1048'
 WHERE id = '00000000-0000-0000-0000-000001048601';

DO $$
DECLARE
  r record;
  outcomes text := '';
BEGIN
  SELECT * INTO r FROM public.begin_cart_fulfillment(
    '00000000-0000-0000-0000-000001048601', 'cs_test_1048', 'pi_test_1048',
    jsonb_build_object(
      '00000000-0000-0000-0000-000001048731', 3000,
      '00000000-0000-0000-0000-000001048732', 3000,
      '00000000-0000-0000-0000-000001048733', 3000));
  IF r.outcome IS DISTINCT FROM 'begun' THEN
    RAISE EXCEPTION 'FAIL case 6 setup: begin_cart_fulfillment returned %', r.outcome;
  END IF;

  SELECT * INTO r FROM public.fulfill_cart_line('cs_test_1048', '00000000-0000-0000-0000-000001048731');
  outcomes := r.outcome;
  SELECT * INTO r FROM public.fulfill_cart_line('cs_test_1048', '00000000-0000-0000-0000-000001048732');
  outcomes := outcomes || ' ' || r.outcome;
  PERFORM set_config('myk9_1048.card_entry', r.entry_id::text, true);
  SELECT * INTO r FROM public.fulfill_cart_line('cs_test_1048', '00000000-0000-0000-0000-000001048733');
  outcomes := outcomes || ' ' || r.outcome;
  PERFORM set_config('myk9_1048.card_entry_b', r.entry_id::text, true);
  IF outcomes IS DISTINCT FROM 'denied created_entry created_entry' THEN
    RAISE EXCEPTION 'FAIL case 6 setup: line outcomes were % (expected denied created_entry created_entry)', outcomes;
  END IF;

  -- Case 7: a redelivery of line (b).
  SELECT * INTO r FROM public.fulfill_cart_line('cs_test_1048', '00000000-0000-0000-0000-000001048732');
  IF r.replayed IS NOT TRUE OR r.entry_id::text IS DISTINCT FROM current_setting('myk9_1048.card_entry') THEN
    RAISE EXCEPTION 'FAIL case 7: redelivered line did not replay its recorded entry (replayed %, entry %)',
      r.replayed, r.entry_id;
  END IF;
END;
$$;

RESET ROLE;

DO $$
DECLARE
  got       integer;
  got_found boolean;
  n         integer;
BEGIN
  SELECT e.run_order INTO got FROM public.entries e
   WHERE e.id = current_setting('myk9_1048.card_entry')::uuid;
  IF got IS DISTINCT FROM 8 THEN
    RAISE EXCEPTION 'FAIL case 6b: card checkout entry into ordered class A got run_order % (expected 8; the denied line takes no position)', got;
  END IF;

  SELECT e.run_order, true INTO got, got_found FROM public.entries e
   WHERE e.id = current_setting('myk9_1048.card_entry_b')::uuid;
  IF got_found IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL case 6c: card checkout entry into class B not found';
  END IF;
  IF got IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL case 6c: card checkout entry into unordered class B got run_order %', got;
  END IF;

  SELECT count(*) INTO n FROM public.entries e
   WHERE e.class_id = '00000000-0000-0000-0000-000001048301'
     AND e.dog_id = '00000000-0000-0000-0000-000001048421'
     AND e.deleted_at IS NULL;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL case 7: % entries for the card dog in class A after a redelivery (expected 1)', n;
  END IF;

  SELECT max(e.run_order) INTO got FROM public.entries e
   WHERE e.class_id = '00000000-0000-0000-0000-000001048301' AND e.deleted_at IS NULL;
  IF got IS DISTINCT FROM 8 THEN
    RAISE EXCEPTION 'FAIL case 7: class A''s last position is % after a redelivery (expected 8)', got;
  END IF;

  RAISE NOTICE 'PASS myk9_1048_submit_entries_next_run_order_test (card checkout)';
END;
$$;

ROLLBACK;
