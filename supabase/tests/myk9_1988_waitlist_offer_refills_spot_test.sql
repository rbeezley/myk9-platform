-- MYK9-1988 (migration 20261115163300): when an offer refills an expired offer's
-- spot, the expired offer records it (refilled_by_offer_id), so "an offer has run
-- out" means "its spot has not been offered to another dog since".
--
-- Properties asserted here:
--   A1  waitlist_offer_to_refill is SECURITY DEFINER with search_path '' and
--       service_role only; promote_waitlist_entry_internal stays service_role only.
--   O1  The offer refilled is the earliest MADE (offered_at), not the earliest
--       deadline and not the lowest id.
--   O2  At a past time the picker only takes an offer that had run out by then
--       (the backfill's rule).
--   R1  An offer refills one expired offer: two expired offers and one new offer
--       still leave one not offered again.
--   R2  The link holds when the new offer is accepted (paid).
--   R3  A second new offer refills the second expired offer; a third refills none.
--   R4  A refill that itself runs out is refilled by the next offer (a chain).
--   R5  Another class's expired offer is never refilled by this class's offers.
--   D1  Deleting the refill row keeps the expired offer refilled, and no later
--       offer can claim it a second time.
--   F1  anon and authenticated cannot write refilled_by_offer_id (an exhibitor's
--       direct insert is refused by the trigger); an offer never names itself.
--
-- All fixtures roll back. Run with psql -X -v ON_ERROR_STOP=1 after migrations.

BEGIN;

CREATE FUNCTION pg_temp.expect_eq(p_actual text, p_expected text, p_label text)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'FAIL %: got %, expected %', p_label, p_actual, p_expected;
  END IF;
  RAISE NOTICE 'PASS %', p_label;
END;
$f$;

CREATE FUNCTION pg_temp.expect_sqlstate(p_sql text, p_state text, p_label text)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> p_state THEN
      RAISE EXCEPTION 'FAIL %: SQLSTATE % (%), expected %', p_label, SQLSTATE, SQLERRM, p_state;
    END IF;
    RAISE NOTICE 'PASS % (% %)', p_label, p_state, SQLERRM;
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL %: succeeded, expected SQLSTATE %', p_label, p_state;
END;
$f$;

-- Fixture ids: 00000000-0000-0000-0000-000001988<nnn>.
CREATE FUNCTION pg_temp.fid(p_suffix text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $f$
  SELECT ('00000000-0000-0000-0000-000001988' || p_suffix)::uuid
$f$;

-- The suffix of the offer that refilled an expired offer, or NULL.
CREATE FUNCTION pg_temp.refilled_by(p_id text)
RETURNS text LANGUAGE sql AS $f$
  SELECT right(w.refilled_by_offer_id::text, 3)
    FROM public.waitlist_entries w WHERE w.id = pg_temp.fid(p_id)
$f$;

-- How many expired offers an offer refilled.
CREATE FUNCTION pg_temp.refilled_count(p_offer text)
RETURNS text LANGUAGE sql AS $f$
  SELECT count(*)::text FROM public.waitlist_entries w
   WHERE w.refilled_by_offer_id = pg_temp.fid(p_offer)
$f$;

CREATE FUNCTION pg_temp.expect_error_like(p_sql text, p_pattern text, p_label text)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE p_pattern THEN
      RAISE EXCEPTION 'FAIL %: % (%), expected %', p_label, SQLERRM, SQLSTATE, p_pattern;
    END IF;
    RAISE NOTICE 'PASS % (% %)', p_label, SQLSTATE, SQLERRM;
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL %: succeeded, expected an error like %', p_label, p_pattern;
END;
$f$;

-- The client's rule: expired offers in a class that no offer refills.
CREATE FUNCTION pg_temp.run_out(p_class text)
RETURNS text LANGUAGE sql AS $f$
  SELECT coalesce(string_agg(right(e.id::text, 3), ',' ORDER BY e.offered_at), '')
    FROM public.waitlist_entries e
   WHERE e.class_id = pg_temp.fid(p_class) AND e.status = 'expired'
     AND e.refilled_by_offer_id IS NULL
$f$;

-- ---------------------------------------------------------------------------
-- A1. Shape and ACL
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fn text := 'public.waitlist_offer_to_refill(uuid, timestamp with time zone)';
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT p.prosecdef || ' ' || array_to_string(p.proconfig, ',')
       FROM pg_proc p WHERE p.oid = v_fn::regprocedure),
    'true search_path=""', 'A1 waitlist_offer_to_refill SECURITY DEFINER, empty search_path');
  PERFORM pg_temp.expect_eq(
    has_function_privilege('anon', v_fn, 'EXECUTE') || ' '
      || has_function_privilege('authenticated', v_fn, 'EXECUTE') || ' '
      || has_function_privilege('service_role', v_fn, 'EXECUTE'),
    'false false true', 'A1 waitlist_offer_to_refill service_role only');
  PERFORM pg_temp.expect_eq(
    has_function_privilege('anon', 'public.promote_waitlist_entry_internal(uuid, integer)', 'EXECUTE') || ' '
      || has_function_privilege('authenticated', 'public.promote_waitlist_entry_internal(uuid, integer)', 'EXECUTE') || ' '
      || has_function_privilege('service_role', 'public.promote_waitlist_entry_internal(uuid, integer)', 'EXECUTE'),
    'false false true', 'A1 promote_waitlist_entry_internal still service_role only');
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
--   club 001; exhibitor person 013 (auth 023); show 101, trial 201.
--   Class 301 REFILL (no class limit):
--     502 expired, made 3 days ago, deadline 1 hour ago   (made FIRST)
--     501 expired, made 2 days ago, deadline 1 day ago    (earliest DEADLINE, lowest id)
--     511-514 waiting, positions 1-4
--   Class 302 OTHER: 521 expired, made 4 days ago, deadline 3 days ago; 531 waiting.
-- ---------------------------------------------------------------------------
INSERT INTO public.clubs (id, name) VALUES (pg_temp.fid('001'), 'MYK9-1988 Club');

INSERT INTO public.people (id, first_name, last_name, email)
VALUES (pg_temp.fid('013'), 'MYK9-1988', 'Exhibitor', 'myk9-1988-exh@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES (pg_temp.fid('023'), '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'myk9-1988-exh@example.test', '', now(), now(), now(),
        '{}', '{}', false, false, false);

UPDATE public.people SET auth_user_id = pg_temp.fid('023') WHERE id = pg_temp.fid('013');

INSERT INTO public.exhibitor_profiles (person_id, auth_user_id)
SELECT pg_temp.fid('013'), pg_temp.fid('023')
WHERE NOT EXISTS (SELECT 1 FROM public.exhibitor_profiles
                  WHERE auth_user_id = pg_temp.fid('023'));

INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
VALUES (pg_temp.fid('101'), 'MYK9-1988 Show', 'AKC',
        current_date + 30, current_date + 30, 'draft', pg_temp.fid('001'));

INSERT INTO public.trials (id, show_id, name, date)
VALUES (pg_temp.fid('201'), pg_temp.fid('101'), 'MYK9-1988 Trial', current_date + 30);

INSERT INTO public.classes (id, trial_id, name, status, status_source, max_entries, allow_waitlist)
VALUES
  (pg_temp.fid('301'), pg_temp.fid('201'), 'Class Refill', 'upcoming', 'derived', NULL, true),
  (pg_temp.fid('302'), pg_temp.fid('201'), 'Class Other', 'upcoming', 'derived', NULL, true);

-- Dogs 401-410, all the exhibitor's.
INSERT INTO public.dogs (id, call_name, breed, owner_id)
SELECT pg_temp.fid((400 + n)::text), 'Dog' || (400 + n), 'Beagle', pg_temp.fid('013')
FROM generate_series(1, 10) AS n;

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, registered_name)
SELECT pg_temp.fid((400 + n)::text), 'AKC', 'SW1988' || n, 'Dog ' || n || ' Formally'
FROM generate_series(1, 10) AS n;

INSERT INTO public.waitlist_entries (
  id, class_id, exhibitor_id, dog_id, position, status, joined_via, offered_at, offer_expires_at
)
SELECT pg_temp.fid(v.id), pg_temp.fid(v.class), ep.id, pg_temp.fid(v.dog), v.pos, v.status,
       'online', now() - v.made, now() - v.lapsed
FROM public.exhibitor_profiles ep
CROSS JOIN (VALUES
  ('502', '301', '401', 1, 'expired', interval '3 days', interval '1 hour'),
  ('501', '301', '402', 2, 'expired', interval '2 days', interval '1 day'),
  ('511', '301', '403', 3, 'waiting', NULL, NULL),
  ('512', '301', '404', 4, 'waiting', NULL, NULL),
  ('513', '301', '405', 5, 'waiting', NULL, NULL),
  ('514', '301', '406', 6, 'waiting', NULL, NULL),
  ('521', '302', '407', 1, 'expired', interval '4 days', interval '3 days'),
  ('531', '302', '408', 2, 'waiting', NULL, NULL)
) AS v(id, class, dog, pos, status, made, lapsed)
WHERE ep.auth_user_id = pg_temp.fid('023');

DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM public.waitlist_entries w
      WHERE w.id::text LIKE '00000000-0000-0000-0000-0000019885%'),
    '8', 'FIXTURE eight wait list rows seeded');
  PERFORM pg_temp.expect_eq(pg_temp.run_out('301'), '502,501',
    'FIXTURE class 301 has two offers run out, none refilled');
END;
$$;

-- ---------------------------------------------------------------------------
-- O1 / O2. Which expired offer an offer refills
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    right(public.waitlist_offer_to_refill(pg_temp.fid('301'), now())::text, 3), '502',
    'O1 the earliest-made expired offer, not the earliest deadline (501) or lowest id (501)');
  PERFORM pg_temp.expect_eq(
    right(public.waitlist_offer_to_refill(pg_temp.fid('301'), now() - interval '12 hours')::text, 3),
    '501', 'O2 twelve hours ago only 501 had run out');
  PERFORM pg_temp.expect_eq(
    public.waitlist_offer_to_refill(pg_temp.fid('301'), now() - interval '36 hours')::text, NULL,
    'O2 thirty-six hours ago neither offer had run out');
END;
$$;

-- ---------------------------------------------------------------------------
-- R1-R5. Offers made through promote_waitlist_entry_internal, as the edge
-- functions call it (service_role).
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
DO $$
BEGIN
  PERFORM public.promote_waitlist_entry_internal(pg_temp.fid('511'));
  PERFORM pg_temp.expect_eq(pg_temp.refilled_by('502'), '511', 'R1 the new offer refills 502');
  PERFORM pg_temp.expect_eq(pg_temp.run_out('301'), '501',
    'R1 two expired offers and one new offer: one still not offered again');

  -- What the paid-offer webhook leaves: the offer row accepted.
  UPDATE public.waitlist_entries SET status = 'accepted' WHERE id = pg_temp.fid('511');
  PERFORM pg_temp.expect_eq(pg_temp.run_out('301'), '501',
    'R2 an accepted (paid) refill still refills 502');

  PERFORM public.promote_waitlist_entry_internal(pg_temp.fid('512'));
  PERFORM pg_temp.expect_eq(pg_temp.refilled_by('501'), '512', 'R3 the second offer refills 501');
  PERFORM pg_temp.expect_eq(pg_temp.run_out('301'), '', 'R3 nothing left run out');

  PERFORM public.promote_waitlist_entry_internal(pg_temp.fid('513'));
  PERFORM pg_temp.expect_eq(pg_temp.refilled_count('513'), '0', 'R3 a third offer refills nothing');

  -- 513's own offer runs out (made two hours ago, deadline an hour ago).
  UPDATE public.waitlist_entries
     SET status = 'expired', offered_at = now() - interval '2 hours',
         offer_expires_at = now() - interval '1 hour'
   WHERE id = pg_temp.fid('513');
  PERFORM pg_temp.expect_eq(pg_temp.run_out('301'), '513', 'R4 the run-out refill counts');
  PERFORM public.promote_waitlist_entry_internal(pg_temp.fid('514'));
  PERFORM pg_temp.expect_eq(pg_temp.refilled_by('513'), '514', 'R4 the next offer refills it');
  PERFORM pg_temp.expect_eq(pg_temp.run_out('301'), '', 'R4 nothing left run out');

  PERFORM pg_temp.expect_eq(pg_temp.run_out('302'), '521',
    'R5 the other class''s expired offer is untouched by class 301''s offers');
  PERFORM public.promote_waitlist_entry_internal(pg_temp.fid('531'));
  PERFORM pg_temp.expect_eq(pg_temp.refilled_by('521'), '531', 'R5 its own class refills it');
END;
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- D1. The refill row is deleted (a dog's hard delete removes its waitlist rows)
-- ---------------------------------------------------------------------------
DELETE FROM public.waitlist_entries WHERE id = pg_temp.fid('511');
DO $$
BEGIN
  PERFORM pg_temp.expect_eq(pg_temp.refilled_by('502'), '511',
    'D1 502 stays refilled after its refill row is deleted');
  PERFORM pg_temp.expect_eq(pg_temp.run_out('301'), '', 'D1 nothing in 301 runs out again');
  PERFORM pg_temp.expect_eq(
    public.waitlist_offer_to_refill(pg_temp.fid('301'), now())::text, NULL,
    'D1 no later offer can claim 502 a second time');
END;
$$;

-- ---------------------------------------------------------------------------
-- F1. Only the server writes the link
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_sqlstate(
  $q$UPDATE public.waitlist_entries SET refilled_by_offer_id = id
      WHERE id = '00000000-0000-0000-0000-000001988512'$q$,
  '23514', 'F1 an offer cannot refill itself');

-- The exhibitor's own row, written as literals so the statement reads no table
-- under the exhibitor's RLS.
SELECT set_config('myk9_1988.forged_insert', format(
  $q$INSERT INTO public.waitlist_entries (
       id, class_id, exhibitor_id, dog_id, position, status, joined_via, refilled_by_offer_id)
     VALUES (%L, %L, %L, %L, 9, 'expired', 'online', %L)$q$,
  pg_temp.fid('541'), pg_temp.fid('302'), ep.id, pg_temp.fid('409'), pg_temp.fid('531')), true)
FROM public.exhibitor_profiles ep WHERE ep.auth_user_id = pg_temp.fid('023');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001988023', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000001988023","role":"authenticated","app_metadata":{}}', true);
SELECT pg_temp.expect_error_like(
  current_setting('myk9_1988.forged_insert'),
  '%set by the server only%', 'F1 an exhibitor''s direct insert cannot mark a spot refilled');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

ROLLBACK;
