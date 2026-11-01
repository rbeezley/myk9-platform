-- MYK9-1309 (migration 20261022034100): the two MYK9-1281 reseed behaviours,
-- now functions, called directly instead of read as seed source text.
--
--   Part A  public.seed_demo_assert_date_coherence(): which shows it owns, and
--           that each check raises on an owned show and only warns otherwise.
--   Part B  public.seed_demo_retire_stale_fixture_shows(): one fixture show per
--           protected table survives, an untouched one is deleted, and shows
--           outside the fixture range are never touched.
--   Part D  (MYK9-1595) The retire ignores the fixture's own seeded entries and
--           retires only stale fixtures, never today's ready one.
--   Part E  (MYK9-1595) A mint retires stale fixtures first and names the new
--           show "Show-day fixture · <Mon D>".
--   Part C  Neither function is callable by PUBLIC, anon or authenticated.
--
-- Part B drops the protected tables' FKs to shows / trials / classes inside
-- the transaction first. Several are RESTRICT or NO ACTION, and with them in
-- place the per-show EXCEPTION sub-block would keep a show even if its skip
-- term were deleted, so survival would prove nothing about the skip list.
-- Child rows are inserted with session_replication_role = replica (no
-- triggers, no FK checks); their non-show references are placeholders.
--
-- All fixtures roll back. Run with psql -X -v ON_ERROR_STOP=1 after migrations.

BEGIN;

-- A show with one trial on its start day and one class, all fixed ids.
CREATE FUNCTION pg_temp.mk_show(p_id uuid, p_name text, p_start date, p_close date)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                            entry_open_date, entry_close_date)
  VALUES (p_id, p_name, 'AKC', p_start::timestamp AT TIME ZONE 'UTC',
          (p_start + 1)::timestamp AT TIME ZONE 'UTC',
          'dededede-0000-0000-0000-000000000001', 'published',
          (p_start - 40)::timestamp AT TIME ZONE 'UTC', p_close::timestamp AT TIME ZONE 'UTC');
$$;

-- Runs p_sql and requires it to raise an exception whose message contains
-- p_fragment. The sub-block rolls back whatever p_sql wrote.
CREATE FUNCTION pg_temp.expect_raise(p_label text, p_sql text, p_fragment text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN raise_exception THEN
    IF position(p_fragment IN SQLERRM) = 0 THEN
      RAISE EXCEPTION 'FAIL % raised the wrong error: %', p_label, SQLERRM;
    END IF;
    RAISE NOTICE 'PASS % (%)', p_label, SQLERRM;
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL % did not raise "%"', p_label, p_fragment;
END;
$$;

-- --- shared fixtures: the demo club, and the accounts and dogs the show-day
-- fixture restore needs (as in myk9_731_restore_show_day_fixture_containment_test.sql).
INSERT INTO public.clubs (id, name, authorized_at)
VALUES ('dededede-0000-0000-0000-000000000001', 'MYK9-1309 Heartland Club', now());

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000001309001', 'Casey', 'Morgan', 'exhibitor@myk9t.com'),
  ('00000000-0000-0000-0000-000001309002', 'Jordan', 'Ellis', 'secretary@myk9t.com'),
  ('00000000-0000-0000-0000-000001309003', 'MYK9-1309', 'Judge', 'judge@myk9t.com');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000001309102', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'secretary@myk9t.com', '', now(), now(), now(),
   '{}', '{}', false, false, false);

INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
VALUES
  ('dededede-0000-0000-0000-000000000041', 'Willow', 'Willow', 'Border Collie', 'active',
   '00000000-0000-0000-0000-000001309001'),
  ('dededede-0000-0000-0000-000000000046', 'Cooper', 'Cooper', 'Labrador Retriever', 'active',
   '00000000-0000-0000-0000-000001309002');

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
VALUES
  ('dededede-0000-0000-0000-000000000041', 'AKC', 'SS130900041', true),
  ('dededede-0000-0000-0000-000000000046', 'AKC', 'SS130900046', true);

SAVEPOINT part_a;

-- ===========================================================================
-- Part A. seed_demo_assert_date_coherence()
-- ===========================================================================
-- Today's ready show-day fixture: the one fixture-range show the seed owns.
SELECT public.seed_demo_restore_show_day_fixture();

CREATE TEMP TABLE a_fixture ON COMMIT DROP AS
SELECT s.id, s.start_date, s.name FROM public.shows s WHERE s.id = public.seed_demo_show_day_fixture_today();

DO $$
DECLARE
  v_fixture_start date := (SELECT (start_date AT TIME ZONE 'UTC')::date FROM a_fixture);
BEGIN
  IF v_fixture_start IS NULL THEN
    RAISE EXCEPTION 'FIXTURE the restore did not leave a ready show-day fixture';
  END IF;

  -- A coherent seed show with its trial in range.
  PERFORM pg_temp.mk_show('dededede-0000-0000-0000-000000000010', 'Heartland Scent Work Classic',
                          current_date + 45, current_date + 38);
  INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone)
  VALUES ('00000000-0000-0000-0000-000001309510', 'dededede-0000-0000-0000-000000000010',
          'MYK9-1309 Trial', current_date + 45, 'AKC', 'scent_work', 'America/Chicago');

  -- Not the seed's, every one incoherent; none may fail the assert:
  -- a club's own show sharing the seed show's name and start date, closing
  -- after it starts and holding a trial outside its dates;
  PERFORM pg_temp.mk_show('00000000-0000-0000-0000-000001309700', 'Heartland Scent Work Classic',
                          current_date + 45, current_date + 50);
  INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone)
  VALUES ('00000000-0000-0000-0000-000001309710', '00000000-0000-0000-0000-000001309700',
          'MYK9-1309 Club Trial', current_date + 90, 'AKC', 'scent_work', 'America/Chicago');
  -- an older fixture show a walk kept, sharing today's fixture's name and start;
  PERFORM pg_temp.mk_show('dededede-0000-0000-0731-130900000001', (SELECT name FROM a_fixture),
                          v_fixture_start, v_fixture_start + 3);
  INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone)
  VALUES ('00000000-0000-0000-0000-000001309720', 'dededede-0000-0000-0731-130900000001',
          'MYK9-1309 Old Fixture Trial', v_fixture_start + 30, 'AKC', 'scent_work', 'America/Chicago');
  -- the retired fixed fixture ...014;
  PERFORM pg_temp.mk_show('dededede-0000-0000-0000-000000000014', 'Heartland Scent Work Week',
                          current_date - 20, current_date - 10);
  -- and a soft-deleted seed-namespace show.
  PERFORM pg_temp.mk_show('dededede-0000-0000-0000-000000000099', 'Heartland Scent Work Classic',
                          current_date + 45, current_date + 60);
  UPDATE public.shows SET deleted_at = now() WHERE id = 'dededede-0000-0000-0000-000000000099';
END;
$$;

-- A1. Coherent owned shows pass; a club show, a kept older fixture, ...014 and
-- a soft-deleted show are not owned, and a duplicate pair with one of them
-- only warns.
DO $$
BEGIN
  PERFORM public.seed_demo_assert_date_coherence();
  RAISE NOTICE 'PASS A1 the assert passes when only shows it does not own are incoherent or share a name (club show, kept fixture, ...014, soft-deleted)';
END;
$$;

-- A2. A seed show in a different literal shape (upper case, another id group)
-- is owned: closing after it starts fails the reseed.
SELECT pg_temp.expect_raise(
  'A2 a seed-namespace show in a different literal shape that closes after it starts',
  $sql$
    SELECT pg_temp.mk_show('DEDEDEDE-0000-0000-1309-0000000000A2', 'MYK9-1309 Fifth Show',
                           current_date + 45, current_date + 46);
    SELECT public.seed_demo_assert_date_coherence();
  $sql$,
  'closes entries after it starts');

-- A3. A trial outside an owned show's dates fails the reseed.
SELECT pg_temp.expect_raise(
  'A3 an owned show with a trial outside its start/end range',
  $sql$
    INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone)
    VALUES ('00000000-0000-0000-0000-000001309511', 'dededede-0000-0000-0000-000000000010',
            'MYK9-1309 Stray Trial', current_date + 44, 'AKC', 'scent_work', 'America/Chicago');
    SELECT public.seed_demo_assert_date_coherence();
  $sql$,
  'has a trial dated outside its start/end range');

SELECT pg_temp.expect_raise(
  'A3b an owned show with a trial after its end date',
  $sql$
    INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone)
    VALUES ('00000000-0000-0000-0000-000001309512', 'dededede-0000-0000-0000-000000000010',
            'MYK9-1309 Late Trial', current_date + 47, 'AKC', 'scent_work', 'America/Chicago');
    SELECT public.seed_demo_assert_date_coherence();
  $sql$,
  'has a trial dated outside its start/end range');

-- A4. Two owned shows sharing a name and start date fail the reseed.
SELECT pg_temp.expect_raise(
  'A4 two owned shows share a name and start date',
  $sql$
    SELECT pg_temp.mk_show('dededede-0000-0000-0000-0000000000a4', 'Heartland Scent Work Classic',
                           current_date + 45, current_date + 38);
    SELECT public.seed_demo_assert_date_coherence();
  $sql$,
  'share the name');

-- A5. Today's fixture is owned: closing after it starts fails the reseed.
SELECT pg_temp.expect_raise(
  'A5 today''s show-day fixture closes after it starts',
  $sql$
    UPDATE public.shows SET entry_close_date = start_date + interval '2 days'
    WHERE id = (SELECT id FROM a_fixture);
    SELECT public.seed_demo_assert_date_coherence();
  $sql$,
  'closes entries after it starts');

-- A6. Every case above rolled back its own writes: the assert passes again.
DO $$
BEGIN
  PERFORM public.seed_demo_assert_date_coherence();
  RAISE NOTICE 'PASS A6 the assert passes again once the incoherent rows are gone';
END;
$$;

ROLLBACK TO SAVEPOINT part_a;

-- ===========================================================================
-- Part D. MYK9-1595: the retire ignores the fixture's own minted entries, and
-- only ever retires stale fixtures.
--
-- Run before Part B on purpose: B drops foreign keys inside the transaction,
-- and D needs the real shows -> trials -> classes -> entries cascade, so a
-- retired show's seeded entries really are deleted with it (every DELETE
-- trigger on that cascade fires). Fixtures come in three shapes:
--   seeded entries  ids in dededede-0000-0000-0731-*, 'confirmed' / 'paid',
--                   as the restore mints them;
--   a person's work an entry outside that range;
--   money           a show_payments or refund_requests row.
-- Children are inserted with session_replication_role = replica (no triggers,
-- no FK checks); the retire then runs with triggers and FKs on.
-- ===========================================================================
-- Fixture show n: shows, trials, classes and entries share the marker prefix.
CREATE FUNCTION pg_temp.d_show(n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('dededede-0000-0000-0731-1309d' || lpad(n::text, 7, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.d_trial(n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('dededede-0000-0000-0731-1309f' || lpad(n::text, 7, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.d_class(n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('dededede-0000-0000-0731-1309c' || lpad(n::text, 7, '0'))::uuid;
$$;
-- Seeded entry k (1 or 2) of show n.
CREATE FUNCTION pg_temp.d_entry(n int, k int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('dededede-0000-0000-0731-1309e' || lpad((n * 10 + k)::text, 7, '0'))::uuid;
$$;

-- Show n whose single trial is p_day, with one class and two seeded entries.
CREATE FUNCTION pg_temp.d_mk(n int, p_day date, p_entries boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.mk_show(pg_temp.d_show(n), 'MYK9-1595 fixture ' || n, p_day, p_day - 3);
  INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone)
  VALUES (pg_temp.d_trial(n), pg_temp.d_show(n), 'MYK9-1595 Trial ' || n, p_day,
          'AKC', 'scent_work', 'America/Chicago');
  INSERT INTO public.classes (id, trial_id, name, element, level, status, entry_fee)
  VALUES (pg_temp.d_class(n), pg_temp.d_trial(n), 'MYK9-1595 Class ' || n,
          'Container', 'Novice', 'upcoming', 30);
  IF p_entries THEN
    INSERT INTO public.entries (id, show_id, trial_id, class_id, entry_status, payment_status, entry_fee)
    SELECT pg_temp.d_entry(n, k), pg_temp.d_show(n), pg_temp.d_trial(n), pg_temp.d_class(n),
           'confirmed', 'paid', 30.00
    FROM generate_series(1, 2) AS k;
  END IF;
END;
$$;

-- Today in the fixture's own timezone, as the restore dates a fixture.
CREATE FUNCTION pg_temp.d_today() RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE 'America/Chicago')::date;
$$;

SAVEPOINT part_d;

SELECT public.seed_demo_restore_show_day_fixture();
CREATE TEMP TABLE d_ready ON COMMIT DROP AS
SELECT public.seed_demo_show_day_fixture_today() AS id;

SET LOCAL session_replication_role = replica;
-- stale, seeded entries only (three of them)
SELECT pg_temp.d_mk(1, pg_temp.d_today() - 30, true);
SELECT pg_temp.d_mk(2, pg_temp.d_today() - 20, true);
SELECT pg_temp.d_mk(3, pg_temp.d_today() - 8, true);
-- stale, seeded entries plus one entry that is a person's, outside the marker range
SELECT pg_temp.d_mk(4, pg_temp.d_today() - 30, true);
INSERT INTO public.entries (id, show_id, trial_id, class_id, entry_status, payment_status)
VALUES ('00000000-0000-0000-1309-d00000000004', pg_temp.d_show(4), pg_temp.d_trial(4),
        pg_temp.d_class(4), 'confirmed', 'pending');
-- stale, seeded entries plus money (a payment) and (a refund request)
SELECT pg_temp.d_mk(5, pg_temp.d_today() - 30, true);
INSERT INTO public.show_payments (show_id, enrollment_id, amount, kind, method, received_on)
VALUES (pg_temp.d_show(5), '00000000-0000-0000-1309-d00000000005', 30, 'payment', 'cash',
        pg_temp.d_today());
SELECT pg_temp.d_mk(6, pg_temp.d_today() - 30, true);
INSERT INTO public.refund_requests (show_id, amount_cents, kind, reason,
                                    stripe_checkout_session_id, stripe_payment_intent_id)
VALUES (pg_temp.d_show(6), 3000, 'abandoned_cart', 'MYK9-1595 test',
        'cs_test_myk9_1595_refund', 'pi_test_myk9_1595_refund');
-- running today with its seeded entries but not the ready fixture (no announcement,
-- no visibility settings): in use, so kept
SELECT pg_temp.d_mk(7, pg_temp.d_today(), true);
-- running today but with no entries at all (a same-day reseed deleted them): retired
SELECT pg_temp.d_mk(8, pg_temp.d_today(), false);
-- stale, seeded entries plus a trial packet snapshot (RESTRICT FK, no triggers): retired
-- together with the snapshot (owner decision 2026-11-01)
SELECT pg_temp.d_mk(9, pg_temp.d_today() - 30, true);
INSERT INTO public.trial_packet_snapshots (show_id, snapshot_id, storage_path, generated_at,
                                           sha256, page_count, byte_size, delivery_status,
                                           generated_source)
VALUES (pg_temp.d_show(9), '00000000-0000-0000-1309-d00000000009',
        pg_temp.d_show(9)::text || '/myk9-1595.pdf', now(), repeat('a', 64), 1, 100,
        'pending', 'automated');
-- stale, seeded entries plus an enrollment: kept
SELECT pg_temp.d_mk(10, pg_temp.d_today() - 30, true);
INSERT INTO public.enrollments (show_id, handler_id)
VALUES (pg_temp.d_show(10), '00000000-0000-0000-0000-000001309001');
-- stale, seeded entries plus an entry cart: kept
SELECT pg_temp.d_mk(11, pg_temp.d_today() - 30, true);
INSERT INTO public.entry_carts (show_id, exhibitor_id)
VALUES (pg_temp.d_show(11), '00000000-0000-0000-1309-400000000001');
SET LOCAL session_replication_role = origin;

CREATE TEMP TABLE d_before ON COMMIT DROP AS
SELECT (SELECT count(*) FROM public.refund_requests) AS refunds,
       (SELECT count(*) FROM public.show_payments)   AS payments;

DO $$
DECLARE
  v_ready uuid := (SELECT id FROM d_ready);
  v_retired integer;
  v_after record;
BEGIN
  IF v_ready IS NULL THEN
    RAISE EXCEPTION 'FIXTURE the restore did not leave a ready show-day fixture';
  END IF;

  v_retired := public.seed_demo_retire_stale_fixture_shows();

  -- D1. A stale fixture holding only its own seeded entries is retired, with
  -- its seeded entries, trial and class.
  IF EXISTS (SELECT 1 FROM public.shows WHERE id IN (pg_temp.d_show(1), pg_temp.d_show(2), pg_temp.d_show(3)))
     OR EXISTS (SELECT 1 FROM public.entries WHERE show_id IN (pg_temp.d_show(1), pg_temp.d_show(2), pg_temp.d_show(3)))
     OR EXISTS (SELECT 1 FROM public.classes WHERE id IN (pg_temp.d_class(1), pg_temp.d_class(2), pg_temp.d_class(3))) THEN
    RAISE EXCEPTION 'FAIL D1 a stale fixture holding only its seeded entries was not retired';
  END IF;
  RAISE NOTICE 'PASS D1 stale fixtures holding only their seeded entries are retired with those entries';

  -- D2. One entry outside the marker range keeps the show, and both seeded
  -- entries stay with it.
  IF NOT EXISTS (SELECT 1 FROM public.shows WHERE id = pg_temp.d_show(4))
     OR (SELECT count(*) FROM public.entries WHERE show_id = pg_temp.d_show(4)) <> 3 THEN
    RAISE EXCEPTION 'FAIL D2 a stale fixture with a person''s entry was retired or lost entries';
  END IF;
  RAISE NOTICE 'PASS D2 a stale fixture with one non-seeded entry is kept with all its entries';

  -- D3. Money keeps the show even when every entry on it is seeded.
  IF NOT EXISTS (SELECT 1 FROM public.shows WHERE id = pg_temp.d_show(5))
     OR NOT EXISTS (SELECT 1 FROM public.shows WHERE id = pg_temp.d_show(6)) THEN
    RAISE EXCEPTION 'FAIL D3 a stale fixture carrying a payment or a refund request was retired';
  END IF;
  RAISE NOTICE 'PASS D3 a stale fixture with a payment, or with a refund request, is kept';

  -- D4. Today's ready fixture is never retired; a fixture running today with
  -- its seeded entries is in use; one running today with none is not.
  IF NOT EXISTS (SELECT 1 FROM public.shows WHERE id = v_ready)
     OR public.seed_demo_show_day_fixture_today() IS DISTINCT FROM v_ready THEN
    RAISE EXCEPTION 'FAIL D4 today''s ready fixture was retired or stopped being ready';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shows WHERE id = pg_temp.d_show(7)) THEN
    RAISE EXCEPTION 'FAIL D4 a fixture running today with its seeded entries was retired';
  END IF;
  IF EXISTS (SELECT 1 FROM public.shows WHERE id = pg_temp.d_show(8)) THEN
    RAISE EXCEPTION 'FAIL D4 a fixture running today with no entries left was kept';
  END IF;
  RAISE NOTICE 'PASS D4 today''s ready fixture and a running fixture with entries survive; an emptied one is retired';

  -- D4b. A packet snapshot does not keep a fixture: the show and its snapshot are gone.
  IF EXISTS (SELECT 1 FROM public.shows WHERE id = pg_temp.d_show(9))
     OR EXISTS (SELECT 1 FROM public.trial_packet_snapshots WHERE show_id = pg_temp.d_show(9)) THEN
    RAISE EXCEPTION 'FAIL D4b a stale fixture with a packet snapshot was kept, or its snapshot survived';
  END IF;
  RAISE NOTICE 'PASS D4b a stale seeded-only fixture with a packet snapshot is retired and the snapshot is deleted';

  -- D4c. An enrollment, or a cart, still keeps the show.
  IF NOT EXISTS (SELECT 1 FROM public.shows WHERE id = pg_temp.d_show(10))
     OR NOT EXISTS (SELECT 1 FROM public.shows WHERE id = pg_temp.d_show(11)) THEN
    RAISE EXCEPTION 'FAIL D4c a stale fixture with an enrollment or a cart was retired';
  END IF;
  RAISE NOTICE 'PASS D4c a stale fixture with an enrollment, or with an entry cart, is kept';

  IF v_retired IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'FAIL D5 expected 5 shows retired (1, 2, 3, 8, 9), the function reported %', v_retired;
  END IF;
  RAISE NOTICE 'PASS D5 the function reports 5 shows retired';

  -- D6. Retiring paid seeded entries is not money movement: no refund request
  -- and no payment row appears, so no DELETE trigger on the cascade writes one.
  SELECT (SELECT count(*) FROM public.refund_requests) AS refunds,
         (SELECT count(*) FROM public.show_payments)   AS payments
    INTO v_after;
  IF v_after.refunds IS DISTINCT FROM (SELECT refunds FROM d_before)
     OR v_after.payments IS DISTINCT FROM (SELECT payments FROM d_before) THEN
    RAISE EXCEPTION 'FAIL D6 retiring fixtures changed refund_requests or show_payments';
  END IF;
  RAISE NOTICE 'PASS D6 retiring fixtures with paid seeded entries creates no refund_requests or show_payments rows';

  -- D7. A second run has nothing left to retire.
  IF public.seed_demo_retire_stale_fixture_shows() IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'FAIL D7 a second retire run deleted more shows';
  END IF;
  RAISE NOTICE 'PASS D7 a second run retires nothing';
END;
$$;

ROLLBACK TO SAVEPOINT part_d;

-- ===========================================================================
-- Part E. MYK9-1595: minting a fixture retires the stale ones first, and names
-- the new one.
-- ===========================================================================
SAVEPOINT part_e;

SET LOCAL session_replication_role = replica;
SELECT pg_temp.d_mk(21, pg_temp.d_today() - 30, true);
SELECT pg_temp.d_mk(22, pg_temp.d_today() - 20, true);
SELECT pg_temp.d_mk(23, pg_temp.d_today() - 9, true);
-- a stale fixture with money attached stays
SELECT pg_temp.d_mk(24, pg_temp.d_today() - 30, true);
INSERT INTO public.show_payments (show_id, enrollment_id, amount, kind, method, received_on)
VALUES (pg_temp.d_show(24), '00000000-0000-0000-1309-d00000000024', 30, 'payment', 'cash',
        pg_temp.d_today());
SET LOCAL session_replication_role = origin;

CREATE TEMP TABLE e_before ON COMMIT DROP AS
SELECT (SELECT count(*) FROM public.refund_requests) AS refunds,
       (SELECT count(*) FROM public.show_payments)   AS payments;

DO $$
DECLARE
  v_result jsonb;
  v_ready uuid;
  v_name text;
  v_expected text;
  v_months text[] := ARRAY['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  v_stale_without_money integer;
  v_shows_before integer;
BEGIN
  IF public.seed_demo_show_day_fixture_today() IS NOT NULL THEN
    RAISE EXCEPTION 'FIXTURE a ready fixture existed before the mint path was exercised';
  END IF;

  v_result := public.seed_demo_restore_show_day_fixture();
  v_ready := (v_result ->> 'show_id')::uuid;

  -- E1. The mint path retired every stale fixture without money, kept the one
  -- with a payment, and left exactly one ready fixture.
  IF (v_result ->> 'created')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL E1 the restore did not mint a fixture: %', v_result;
  END IF;
  IF EXISTS (SELECT 1 FROM public.shows
             WHERE id IN (pg_temp.d_show(21), pg_temp.d_show(22), pg_temp.d_show(23))) THEN
    RAISE EXCEPTION 'FAIL E1 a stale fixture without money survived the mint';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shows WHERE id = pg_temp.d_show(24)) THEN
    RAISE EXCEPTION 'FAIL E1 the stale fixture carrying a payment was retired';
  END IF;
  SELECT count(*) INTO v_stale_without_money
  FROM public.shows s
  WHERE s.id >= 'dededede-0000-0000-0731-000000000000'::uuid
    AND s.id <  'dededede-0000-0000-0732-000000000000'::uuid
    AND s.id <> v_ready
    AND NOT EXISTS (SELECT 1 FROM public.show_payments sp WHERE sp.show_id = s.id);
  IF v_stale_without_money <> 0 THEN
    RAISE EXCEPTION 'FAIL E1 % stale fixture(s) without money remain after the mint', v_stale_without_money;
  END IF;
  IF public.seed_demo_show_day_fixture_today() IS DISTINCT FROM v_ready THEN
    RAISE EXCEPTION 'FAIL E1 the minted fixture is not the ready one';
  END IF;
  RAISE NOTICE 'PASS E1 a mint leaves zero stale fixtures without money and exactly one ready fixture';

  -- E2. The name says it is a fixture and carries its start date.
  SELECT s.name INTO v_name FROM public.shows s WHERE s.id = v_ready;
  v_expected := 'Show-day fixture ' || chr(183) || ' '
             || v_months[extract(month FROM pg_temp.d_today())::int] || ' '
             || extract(day FROM pg_temp.d_today())::int;
  IF v_name IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'FAIL E2 the minted fixture is named "%", expected "%"', v_name, v_expected;
  END IF;
  IF EXISTS (SELECT 1 FROM public.shows s
             WHERE s.id >= 'dededede-0000-0000-0731-000000000000'::uuid
               AND s.id <  'dededede-0000-0000-0732-000000000000'::uuid
               AND s.name = 'Heartland Scent Work Week') THEN
    RAISE EXCEPTION 'FAIL E2 a fixture still carries the old literal name';
  END IF;
  RAISE NOTICE 'PASS E2 the minted fixture is named "%"', v_name;

  -- E3. Nothing money-shaped was written by the retire or the mint.
  IF (SELECT count(*) FROM public.refund_requests) IS DISTINCT FROM (SELECT refunds FROM e_before)
     OR (SELECT count(*) FROM public.show_payments) IS DISTINCT FROM (SELECT payments FROM e_before) THEN
    RAISE EXCEPTION 'FAIL E3 the mint changed refund_requests or show_payments';
  END IF;
  RAISE NOTICE 'PASS E3 the mint creates no refund_requests or show_payments rows';

  -- E4. With a ready fixture the restore writes nothing: no retire, no new show.
  SELECT count(*) INTO v_shows_before FROM public.shows;
  v_result := public.seed_demo_restore_show_day_fixture();
  IF (v_result ->> 'created')::boolean IS DISTINCT FROM false
     OR (v_result ->> 'show_id')::uuid IS DISTINCT FROM v_ready
     OR (SELECT count(*) FROM public.shows) IS DISTINCT FROM v_shows_before THEN
    RAISE EXCEPTION 'FAIL E4 a second restore did not return the ready fixture untouched: %', v_result;
  END IF;
  RAISE NOTICE 'PASS E4 a restore with a ready fixture returns it and writes nothing';
END;
$$;

ROLLBACK TO SAVEPOINT part_e;

-- ===========================================================================
-- Part B. seed_demo_retire_stale_fixture_shows()
-- ===========================================================================
-- Fixture-range show n, with trial and class ids derived from n.
CREATE FUNCTION pg_temp.fx_show(n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('dededede-0000-0000-0731-1309' || lpad(n::text, 8, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.fx_trial(n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('00000000-0000-0000-1309-1' || lpad(n::text, 11, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.fx_class(n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('00000000-0000-0000-1309-2' || lpad(n::text, 11, '0'))::uuid;
$$;

-- What each protected fixture show carries.
CREATE TEMP TABLE b_protected (n int PRIMARY KEY, what text NOT NULL) ON COMMIT DROP;
INSERT INTO b_protected VALUES
  (1, 'an entry by show_id'),
  (2, 'an entry reached only through its trial'),
  (3, 'an entry reached only through its class'),
  (4, 'an enrollment'),
  (5, 'a waitlist entry on its class'),
  (6, 'an entry cart'),
  (7, 'a cart item on its class'),
  (8, 'a Stripe order'),
  (9, 'a show payment'),
  (10, 'a show payout'),
  (11, 'an entry payment link'),
  (12, 'a money lock'),
  (13, 'a refund request');

-- An FK the skip list does not name, NO ACTION: the delete must fail, be
-- caught, and keep only that show.
CREATE TABLE public.myk9_1309_unlisted_fk_probe (
  show_id uuid NOT NULL REFERENCES public.shows(id)
);

DO $$
DECLARE
  v_n int;
BEGIN
  -- 1..13 protected, 50 untouched, 51 held by the unlisted FK.
  FOR v_n IN SELECT n FROM b_protected UNION ALL SELECT 50 UNION ALL SELECT 51 LOOP
    PERFORM pg_temp.mk_show(pg_temp.fx_show(v_n), 'Heartland Scent Work Week',
                            current_date - 30, current_date - 33);
    INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone)
    VALUES (pg_temp.fx_trial(v_n), pg_temp.fx_show(v_n), 'MYK9-1309 Trial ' || v_n,
            current_date - 30, 'AKC', 'scent_work', 'America/Chicago');
    INSERT INTO public.classes (id, trial_id, name, element, level, status, entry_fee)
    VALUES (pg_temp.fx_class(v_n), pg_temp.fx_trial(v_n), 'MYK9-1309 Class ' || v_n,
            'Container', 'Novice', 'upcoming', 30);
  END LOOP;

  -- Outside the fixture range, nothing hanging off any of them: a club's show
  -- with the fixture's name, the retired fixed fixture ...014, and a seed show
  -- in another id group.
  PERFORM pg_temp.mk_show('00000000-0000-0000-0000-000001309800', 'Heartland Scent Work Week',
                          current_date - 30, current_date - 33);
  PERFORM pg_temp.mk_show('dededede-0000-0000-0000-000000000014', 'Heartland Scent Work Week',
                          current_date - 30, current_date - 33);
  PERFORM pg_temp.mk_show('dededede-0000-0000-0730-130900000001', 'Heartland Scent Work Week',
                          current_date - 30, current_date - 33);

  INSERT INTO public.myk9_1309_unlisted_fk_probe (show_id) VALUES (pg_temp.fx_show(51));
END;
$$;

-- One child row per protected table. Placeholder ids stand in for dogs,
-- people, profiles, carts and entries this test does not need.
SET LOCAL session_replication_role = replica;

INSERT INTO public.entries (id, show_id, trial_id, class_id, entry_status, payment_status)
VALUES
  ('00000000-0000-0000-1309-300000000001', pg_temp.fx_show(1), NULL, NULL, 'confirmed', 'pending'),
  ('00000000-0000-0000-1309-300000000002', NULL, pg_temp.fx_trial(2), NULL, 'confirmed', 'pending'),
  ('00000000-0000-0000-1309-300000000003', NULL, NULL, pg_temp.fx_class(3), 'confirmed', 'pending');
INSERT INTO public.enrollments (show_id, handler_id)
VALUES (pg_temp.fx_show(4), '00000000-0000-0000-0000-000001309001');
INSERT INTO public.waitlist_entries (class_id, dog_id, exhibitor_id, position)
VALUES (pg_temp.fx_class(5), 'dededede-0000-0000-0000-000000000041',
        '00000000-0000-0000-1309-400000000001', 1);
INSERT INTO public.entry_carts (show_id, exhibitor_id)
VALUES (pg_temp.fx_show(6), '00000000-0000-0000-1309-400000000001');
INSERT INTO public.entry_cart_items (cart_id, class_id, dog_id, entry_fee_cents)
VALUES ('00000000-0000-0000-1309-500000000001', pg_temp.fx_class(7),
        'dededede-0000-0000-0000-000000000041', 3000);
INSERT INTO public.stripe_orders (show_id, amount_cents)
VALUES (pg_temp.fx_show(8), 3000);
INSERT INTO public.show_payments (show_id, enrollment_id, amount, kind, method, received_on)
VALUES (pg_temp.fx_show(9), '00000000-0000-0000-1309-600000000001', 30, 'payment', 'cash', current_date);
INSERT INTO public.show_payouts (show_id, amount_cents)
VALUES (pg_temp.fx_show(10), 3000);
INSERT INTO public.entry_payment_links (show_id, amount_cents, entry_ids, stripe_checkout_session_id)
VALUES (pg_temp.fx_show(11), 3000, ARRAY['00000000-0000-0000-1309-300000000099'::uuid], 'cs_test_myk9_1309_link');
INSERT INTO public.show_money_locks (show_id, lock_id, holder, expires_at)
VALUES (pg_temp.fx_show(12), '00000000-0000-0000-1309-700000000001', 'myk9-1309-test', now() + interval '1 hour');
INSERT INTO public.refund_requests (show_id, amount_cents, kind, reason,
                                    stripe_checkout_session_id, stripe_payment_intent_id)
VALUES (pg_temp.fx_show(13), 3000, 'abandoned_cart', 'MYK9-1309 test',
        'cs_test_myk9_1309_refund', 'pi_test_myk9_1309_refund');


SET LOCAL session_replication_role = origin;

DO $$
DECLARE
  v_missing text;
  v_fk record;
BEGIN
  -- Every protected table holds exactly one row on its fixture show.
  SELECT string_agg(p.n || ' (' || p.what || ')', ', ') INTO v_missing
  FROM b_protected p
  WHERE NOT CASE p.n
    WHEN 1 THEN EXISTS (SELECT 1 FROM public.entries WHERE show_id = pg_temp.fx_show(1))
    WHEN 2 THEN EXISTS (SELECT 1 FROM public.entries WHERE trial_id = pg_temp.fx_trial(2) AND show_id IS NULL AND class_id IS NULL)
    WHEN 3 THEN EXISTS (SELECT 1 FROM public.entries WHERE class_id = pg_temp.fx_class(3) AND show_id IS NULL AND trial_id IS NULL)
    WHEN 4 THEN EXISTS (SELECT 1 FROM public.enrollments WHERE show_id = pg_temp.fx_show(4))
    WHEN 5 THEN EXISTS (SELECT 1 FROM public.waitlist_entries WHERE class_id = pg_temp.fx_class(5))
    WHEN 6 THEN EXISTS (SELECT 1 FROM public.entry_carts WHERE show_id = pg_temp.fx_show(6))
    WHEN 7 THEN EXISTS (SELECT 1 FROM public.entry_cart_items WHERE class_id = pg_temp.fx_class(7))
    WHEN 8 THEN EXISTS (SELECT 1 FROM public.stripe_orders WHERE show_id = pg_temp.fx_show(8))
    WHEN 9 THEN EXISTS (SELECT 1 FROM public.show_payments WHERE show_id = pg_temp.fx_show(9))
    WHEN 10 THEN EXISTS (SELECT 1 FROM public.show_payouts WHERE show_id = pg_temp.fx_show(10))
    WHEN 11 THEN EXISTS (SELECT 1 FROM public.entry_payment_links WHERE show_id = pg_temp.fx_show(11))
    WHEN 12 THEN EXISTS (SELECT 1 FROM public.show_money_locks WHERE show_id = pg_temp.fx_show(12))
    WHEN 13 THEN EXISTS (SELECT 1 FROM public.refund_requests WHERE show_id = pg_temp.fx_show(13))
  END;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'FIXTURE protected rows missing: %', v_missing;
  END IF;

  -- Drop the protected tables' FKs to shows / trials / classes, so a show the
  -- skip list failed to protect would really be deleted (see header).
  FOR v_fk IN
    SELECT con.conrelid::regclass AS tbl, con.conname
    FROM pg_catalog.pg_constraint con
    WHERE con.contype = 'f'
      AND con.confrelid IN ('public.shows'::regclass, 'public.trials'::regclass, 'public.classes'::regclass)
      AND con.conrelid IN ('public.entries'::regclass, 'public.enrollments'::regclass,
                           'public.waitlist_entries'::regclass, 'public.entry_carts'::regclass,
                           'public.entry_cart_items'::regclass, 'public.stripe_orders'::regclass,
                           'public.show_payments'::regclass, 'public.show_payouts'::regclass,
                           'public.entry_payment_links'::regclass, 'public.show_money_locks'::regclass,
                           'public.refund_requests'::regclass)
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', v_fk.tbl, v_fk.conname);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_constraint con
             WHERE con.contype = 'f' AND con.confrelid = 'public.shows'::regclass
               AND con.conrelid = 'public.stripe_orders'::regclass) THEN
    RAISE EXCEPTION 'FIXTURE the protected tables still reference shows';
  END IF;
END;
$$;

-- B1. The run deletes exactly the untouched fixture show, keeps one show per
-- protected table, keeps the unlisted-FK show, and touches nothing outside
-- the fixture range.
DO $$
DECLARE
  v_retired integer := public.seed_demo_retire_stale_fixture_shows();
  v_lost text;
BEGIN
  SELECT string_agg(p.n || ' (' || p.what || ')', ', ') INTO v_lost
  FROM b_protected p
  WHERE NOT EXISTS (SELECT 1 FROM public.shows s WHERE s.id = pg_temp.fx_show(p.n));
  IF v_lost IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL B1.1 fixture shows carrying protected rows were deleted: %', v_lost;
  END IF;
  RAISE NOTICE 'PASS B1.1 a fixture show survives for each of: entries by show, trial and class; enrollments; waitlist entries; entry carts; cart items; Stripe orders; show payments; show payouts; payment links; money locks; refund requests (packet snapshots do not protect a show, Part D)';

  IF EXISTS (SELECT 1 FROM public.shows WHERE id = pg_temp.fx_show(50))
     OR EXISTS (SELECT 1 FROM public.trials WHERE id = pg_temp.fx_trial(50))
     OR EXISTS (SELECT 1 FROM public.classes WHERE id = pg_temp.fx_class(50)) THEN
    RAISE EXCEPTION 'FAIL B1.2 the untouched fixture show (or its trial or class) is still there';
  END IF;
  RAISE NOTICE 'PASS B1.2 the untouched fixture show is deleted with its trial and class';

  IF NOT EXISTS (SELECT 1 FROM public.shows WHERE id = pg_temp.fx_show(51)) THEN
    RAISE EXCEPTION 'FAIL B1.3 the show held by an unlisted FK was deleted';
  END IF;
  RAISE NOTICE 'PASS B1.3 an unlisted FK keeps its show (warned) without aborting the run';

  IF v_retired IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FAIL B1.4 expected 1 show retired, the function reported %', v_retired;
  END IF;
  RAISE NOTICE 'PASS B1.4 the function reports 1 show retired';

  IF NOT EXISTS (SELECT 1 FROM public.shows WHERE id = '00000000-0000-0000-0000-000001309800')
     OR NOT EXISTS (SELECT 1 FROM public.shows WHERE id = 'dededede-0000-0000-0000-000000000014')
     OR NOT EXISTS (SELECT 1 FROM public.shows WHERE id = 'dededede-0000-0000-0730-130900000001') THEN
    RAISE EXCEPTION 'FAIL B1.5 a show outside the fixture range was deleted';
  END IF;
  RAISE NOTICE 'PASS B1.5 a club show with the fixture''s name, ...014 and a seed show outside the fixture range all survive';
END;
$$;

-- ===========================================================================
-- Part C. Seed maintenance only: no client role can execute either function.
-- ===========================================================================
DO $$
DECLARE
  v_role text;
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['public.seed_demo_retire_stale_fixture_shows()',
                              'public.seed_demo_assert_date_coherence()'] LOOP
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_function_privilege(v_role, v_fn, 'EXECUTE') THEN
        RAISE EXCEPTION 'FAIL C1 % can execute %', v_role, v_fn;
      END IF;
    END LOOP;
    -- A NULL proacl is the default ACL, which grants PUBLIC EXECUTE.
    IF (SELECT p.proacl IS NULL FROM pg_catalog.pg_proc p WHERE p.oid = v_fn::regprocedure)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p, aclexplode(p.proacl) a
                  WHERE p.oid = v_fn::regprocedure AND a.grantee = 0) THEN
      RAISE EXCEPTION 'FAIL C1 PUBLIC can execute %', v_fn;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS C1 neither function is executable by PUBLIC, anon or authenticated';
END;
$$;

ROLLBACK;
