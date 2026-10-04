-- MYK9-1003 (migration 20261004224300): automatic wait list offers have a
-- per-show switch, tell the secretary, send the same in-app message as a
-- manual offer, and never add a second open offer to a class.
--
-- Properties asserted here:
--   S1  shows.waitlist_auto_offer is NOT NULL DEFAULT true (today's behaviour).
--   S2  Switch off: offer_waitlist_spots_from_cron offers nothing for that
--       show (no row, no entry, the dog still waiting), and a direct
--       promote_waitlist_entry_from_cron call on its row returns NULL.
--   S3  Switch on: the first dog in line is offered, with a pending-payment
--       entry; turning the off show's switch on makes the next run offer it.
--   N1  An automatic offer leaves a 'waitlist_auto_offer' notice for each of
--       the club's secretaries, deep-linked to the Waitlist tab, and none for
--       a club admin while the club has a secretary.
--   N2  An automatic offer sends the exhibitor the in-app message (thread +
--       message from the secretary), the same writer the manual path uses.
--   N3  A manual offer leaves no notice (the secretary made it).
--   R1  A class with a manual open offer gets no automatic offer, even with a
--       second free seat: never two open offers from a manual + automatic pair.
--   R2  A class whose one free seat the automatic offer took refuses a manual
--       offer ('Class is full'): one open offer.
--   G1  The automatic offer takes only the first dog in line; a mail-in first
--       dog is reported ('mail_in') and not offered; a full class is skipped
--       without an error.
--   E1  An offer expired earlier in the same run frees the class: the next run
--       offers the next dog at once (no skipped tick).
--   M1  send_waitlist_offer_message: a secretary sends the payment-link copy as
--       themselves; anyone else gets 42501; a non-https link gets 22023.
--   A1  The new functions are SECURITY DEFINER with search_path '' and the
--       expected EXECUTE grants.
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

-- Fixture ids: 00000000-0000-0000-0000-000001003<nnn>.
CREATE FUNCTION pg_temp.fid(p_suffix text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $f$
  SELECT ('00000000-0000-0000-0000-000001003' || p_suffix)::uuid
$f$;

-- Open offers in a class.
CREATE FUNCTION pg_temp.open_offers(p_class text)
RETURNS text LANGUAGE sql AS $f$
  SELECT count(*)::text FROM public.waitlist_entries w
   WHERE w.class_id = pg_temp.fid(p_class) AND w.status = 'offered'
$f$;

CREATE FUNCTION pg_temp.wl_status(p_id text)
RETURNS text LANGUAGE sql AS $f$
  SELECT w.status FROM public.waitlist_entries w WHERE w.id = pg_temp.fid(p_id)
$f$;

-- ---------------------------------------------------------------------------
-- A1 / S1. Shape and ACL
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fn text;
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT is_nullable || ' ' || column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'shows'
        AND column_name = 'waitlist_auto_offer'),
    'NO true', 'S1 shows.waitlist_auto_offer NOT NULL DEFAULT true');

  FOREACH v_fn IN ARRAY ARRAY[
    'public.offer_waitlist_spots_from_cron()',
    'public.promote_waitlist_entry_from_cron(uuid)',
    'public.notify_waitlist_auto_offer(uuid)',
    'public.send_waitlist_offer_message_internal(uuid, uuid, text)',
    'public.send_waitlist_offer_message(uuid, text)'
  ] LOOP
    PERFORM pg_temp.expect_eq(
      (SELECT p.prosecdef || ' ' || array_to_string(p.proconfig, ',')
         FROM pg_proc p WHERE p.oid = v_fn::regprocedure),
      'true search_path=""', 'A1 ' || v_fn || ' SECURITY DEFINER, empty search_path');
  END LOOP;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.offer_waitlist_spots_from_cron()',
    'public.promote_waitlist_entry_from_cron(uuid)',
    'public.notify_waitlist_auto_offer(uuid)',
    'public.send_waitlist_offer_message_internal(uuid, uuid, text)'
  ] LOOP
    PERFORM pg_temp.expect_eq(
      has_function_privilege('anon', v_fn, 'EXECUTE') || ' '
        || has_function_privilege('authenticated', v_fn, 'EXECUTE') || ' '
        || has_function_privilege('service_role', v_fn, 'EXECUTE'),
      'false false true', 'A1 ' || v_fn || ' service_role only');
  END LOOP;

  PERFORM pg_temp.expect_eq(
    has_function_privilege('anon', 'public.send_waitlist_offer_message(uuid, text)', 'EXECUTE') || ' '
      || has_function_privilege('authenticated', 'public.send_waitlist_offer_message(uuid, text)', 'EXECUTE'),
    'false true', 'A1 send_waitlist_offer_message: authenticated, not anon');
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
--   club 001; people 011 secretary, 012 club admin, 013 exhibitor,
--   014 outsider (auth users 021-024).
--   show 101 (switch left at its default), show 102 (switch off).
--   Classes, each holding one filler entry:
--     301 ON      max 2 -> 1 free seat; queue 501 (pos 1), 502 (pos 2)
--     302 OFF     max 2 -> 1 free seat; queue 511 (pos 1)   [show 102]
--     303 RACE2   max 3 -> 2 free seats; queue 521, 522, 523
--     304 RACE1   max 2 -> 1 free seat;  queue 531, 532
--     305 MAILIN  max 2 -> 1 free seat;  queue 541 (mail-in), 542
--     306 FULL    max 1 -> no seat;      queue 551
--     307 EXPIRY  max 2 -> its seat held by open offer 561 (pending entry 661);
--                 queue 562
-- ---------------------------------------------------------------------------
INSERT INTO public.clubs (id, name) VALUES (pg_temp.fid('001'), 'MYK9-1003 Club');

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  (pg_temp.fid('011'), 'MYK9-1003', 'Secretary', 'myk9-1003-sec@example.test'),
  (pg_temp.fid('012'), 'MYK9-1003', 'ClubAdmin', 'myk9-1003-admin@example.test'),
  (pg_temp.fid('013'), 'MYK9-1003', 'Exhibitor', 'myk9-1003-exh@example.test'),
  (pg_temp.fid('014'), 'MYK9-1003', 'Outsider', 'myk9-1003-out@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT pg_temp.fid(v.auth_suffix), '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', v.email, '', now(), now(), now(),
       '{}', '{}', false, false, false
FROM (VALUES
  ('021', 'myk9-1003-sec@example.test'),
  ('022', 'myk9-1003-admin@example.test'),
  ('023', 'myk9-1003-exh@example.test'),
  ('024', 'myk9-1003-out@example.test')
) AS v(auth_suffix, email);

UPDATE public.people p
SET auth_user_id = pg_temp.fid(v.auth_suffix)
FROM (VALUES ('011', '021'), ('012', '022'), ('013', '023'), ('014', '024'))
  AS v(person_suffix, auth_suffix)
WHERE p.id = pg_temp.fid(v.person_suffix);

INSERT INTO public.exhibitor_profiles (person_id, auth_user_id)
SELECT pg_temp.fid('013'), pg_temp.fid('023')
WHERE NOT EXISTS (SELECT 1 FROM public.exhibitor_profiles
                  WHERE auth_user_id = pg_temp.fid('023'));

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT pg_temp.fid(v.person_suffix), r.id, pg_temp.fid('001'), true, pg_temp.fid(v.auth_suffix)
FROM (VALUES ('011', '021', 'secretary'), ('012', '022', 'club_admin'))
  AS v(person_suffix, auth_suffix, role_name)
JOIN public.roles r ON r.name = v.role_name;

INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
VALUES
  (pg_temp.fid('101'), 'MYK9-1003 Auto Show', 'AKC',
   current_date + 30, current_date + 30, 'draft', pg_temp.fid('001')),
  (pg_temp.fid('102'), 'MYK9-1003 Manual Show', 'AKC',
   current_date + 30, current_date + 30, 'draft', pg_temp.fid('001'));

UPDATE public.shows SET waitlist_auto_offer = false WHERE id = pg_temp.fid('102');

INSERT INTO public.trials (id, show_id, name, date)
VALUES
  (pg_temp.fid('201'), pg_temp.fid('101'), 'MYK9-1003 Auto Trial', current_date + 30),
  (pg_temp.fid('202'), pg_temp.fid('102'), 'MYK9-1003 Manual Trial', current_date + 30);

INSERT INTO public.classes (id, trial_id, name, status, status_source, max_entries, allow_waitlist)
VALUES
  (pg_temp.fid('301'), pg_temp.fid('201'), 'Class On', 'upcoming', 'derived', 2, true),
  (pg_temp.fid('302'), pg_temp.fid('202'), 'Class Off', 'upcoming', 'derived', 2, true),
  (pg_temp.fid('303'), pg_temp.fid('201'), 'Class Race2', 'upcoming', 'derived', 3, true),
  (pg_temp.fid('304'), pg_temp.fid('201'), 'Class Race1', 'upcoming', 'derived', 2, true),
  (pg_temp.fid('305'), pg_temp.fid('201'), 'Class MailIn', 'upcoming', 'derived', 2, true),
  (pg_temp.fid('306'), pg_temp.fid('201'), 'Class Full', 'upcoming', 'derived', 1, true),
  (pg_temp.fid('307'), pg_temp.fid('201'), 'Class Expiry', 'upcoming', 'derived', 2, true);

-- Dogs 401-430, all the exhibitor's.
INSERT INTO public.dogs (id, call_name, breed, owner_id)
SELECT pg_temp.fid((400 + n)::text), 'Dog' || (400 + n), 'Beagle', pg_temp.fid('013')
FROM generate_series(1, 30) AS n;

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, registered_name)
SELECT pg_temp.fid((400 + n)::text), 'AKC', 'SW1003' || n, 'Dog ' || n || ' Formally'
FROM generate_series(1, 30) AS n;

-- One filler entry per class (dogs 401-407), plus the expiring offer's
-- pending-payment entry 661 (dog 420).
SET LOCAL ROLE service_role;
INSERT INTO public.entries (id, class_id, trial_id, show_id, dog_id, payment_status, entry_status)
SELECT pg_temp.fid((600 + n)::text), pg_temp.fid((300 + n)::text),
       CASE WHEN n = 2 THEN pg_temp.fid('202') ELSE pg_temp.fid('201') END,
       CASE WHEN n = 2 THEN pg_temp.fid('102') ELSE pg_temp.fid('101') END,
       pg_temp.fid((400 + n)::text), 'pending', 'submitted'
FROM generate_series(1, 7) AS n;

INSERT INTO public.entries (id, class_id, trial_id, show_id, dog_id, payment_status, entry_status)
VALUES (pg_temp.fid('661'), pg_temp.fid('307'), pg_temp.fid('201'), pg_temp.fid('101'),
        pg_temp.fid('420'), 'pending', 'pending-payment');
RESET ROLE;

INSERT INTO public.waitlist_entries (
  id, class_id, exhibitor_id, dog_id, position, status, joined_via,
  offered_at, offer_expires_at, promoted_entry_id
)
SELECT pg_temp.fid(v.id), pg_temp.fid(v.class), ep.id, pg_temp.fid(v.dog), v.pos, v.status,
       v.via,
       CASE WHEN v.status = 'offered' THEN now() - interval '2 days' END,
       CASE WHEN v.status = 'offered' THEN now() - interval '1 hour' END,
       CASE WHEN v.status = 'offered' THEN pg_temp.fid('661') END
FROM public.exhibitor_profiles ep
CROSS JOIN (VALUES
  ('501', '301', '411', 1, 'waiting', 'online'),
  ('502', '301', '412', 2, 'waiting', 'online'),
  ('511', '302', '413', 1, 'waiting', 'online'),
  ('521', '303', '414', 1, 'waiting', 'online'),
  ('522', '303', '415', 2, 'waiting', 'online'),
  ('523', '303', '416', 3, 'waiting', 'online'),
  ('531', '304', '417', 1, 'waiting', 'online'),
  ('532', '304', '418', 2, 'waiting', 'online'),
  ('541', '305', '419', 1, 'waiting', 'mail_in'),
  ('542', '305', '421', 2, 'waiting', 'online'),
  ('551', '306', '422', 1, 'waiting', 'online'),
  ('561', '307', '420', 1, 'offered', 'online'),
  ('562', '307', '423', 2, 'waiting', 'online')
) AS v(id, class, dog, pos, status, via)
WHERE ep.auth_user_id = pg_temp.fid('023');

DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM public.waitlist_entries w
      WHERE w.id::text LIKE '00000000-0000-0000-0000-0000010035%'),
    '13', 'FIXTURE thirteen wait list rows seeded');
  PERFORM pg_temp.expect_eq(
    (SELECT waitlist_auto_offer::text FROM public.shows WHERE id = pg_temp.fid('101')),
    'true', 'FIXTURE a show left at the default offers automatically');
END;
$$;

-- ---------------------------------------------------------------------------
-- R1 setup: the secretary offers class 303's first dog by hand.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001003021', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000001003021","role":"authenticated","app_metadata":{}}', true);
SELECT public.promote_waitlist_entry(pg_temp.fid('521')) IS NOT NULL AS manual_offer_made;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

DO $$
BEGIN
  PERFORM pg_temp.expect_eq(pg_temp.wl_status('521'), 'offered', 'R1 setup: manual offer made');
END;
$$;

-- ---------------------------------------------------------------------------
-- Direct guards on promote_waitlist_entry_from_cron (S2, G1)
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    public.promote_waitlist_entry_from_cron(pg_temp.fid('511'))::text, NULL,
    'S2 promote_waitlist_entry_from_cron returns NULL when the show''s switch is off');
  PERFORM pg_temp.expect_eq(pg_temp.wl_status('511'), 'waiting',
    'S2 the switched-off dog is still waiting');
  PERFORM pg_temp.expect_eq(
    public.promote_waitlist_entry_from_cron(pg_temp.fid('502'))::text, NULL,
    'G1 the second dog in line is not offered while the first is waiting');
  PERFORM pg_temp.expect_eq(
    public.promote_waitlist_entry_from_cron(pg_temp.fid('522'))::text, NULL,
    'R1 no automatic offer into a class with a manual open offer (direct call)');
END;
$$;

-- ---------------------------------------------------------------------------
-- The cron's offer step, first run
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE run1 AS
SELECT * FROM public.offer_waitlist_spots_from_cron();
RESET ROLE;

DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT string_agg(substr(r.class_id::text, 34) || ':' || r.outcome || ':'
                       || substr(r.waitlist_entry_id::text, 34), ',' ORDER BY r.class_id)
       FROM run1 r),
    '301:offered:501,304:offered:531,305:mail_in:541',
    'RUN1 offers 301 and 304, reports 305''s mail-in first dog, nothing else');

  -- S2: the switched-off show
  PERFORM pg_temp.expect_eq(pg_temp.wl_status('511'), 'waiting', 'S2 switch off: dog still waiting');
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM public.entries WHERE class_id = pg_temp.fid('302')),
    '1', 'S2 switch off: no entry created');

  -- S3: the switched-on show
  PERFORM pg_temp.expect_eq(
    (SELECT w.status || ' ' || e.entry_status FROM public.waitlist_entries w
       JOIN public.entries e ON e.id = w.promoted_entry_id
      WHERE w.id = pg_temp.fid('501')),
    'offered pending-payment', 'S3 switch on: first dog offered with a pending-payment entry');
  PERFORM pg_temp.expect_eq(pg_temp.wl_status('502'), 'waiting', 'S3 the second dog keeps waiting');

  -- R1, R2, G1
  PERFORM pg_temp.expect_eq(pg_temp.open_offers('303'), '1',
    'R1 manual offer + cron, two free seats: still one open offer');
  PERFORM pg_temp.expect_eq(pg_temp.open_offers('304'), '1', 'R2 cron took the one free seat');
  PERFORM pg_temp.expect_eq(pg_temp.wl_status('541') || ' ' || pg_temp.wl_status('542'),
    'waiting waiting', 'G1 a mail-in first dog stops the automatic offer');
  PERFORM pg_temp.expect_eq(pg_temp.wl_status('551'), 'waiting', 'G1 a full class is skipped');
  PERFORM pg_temp.expect_eq(pg_temp.wl_status('562'), 'waiting',
    'E1 setup: a class with an open offer is skipped');
END;
$$;

-- R2: the secretary tries to offer class 304's next dog after the cron took
-- its only seat.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001003021', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000001003021","role":"authenticated","app_metadata":{}}', true);
SELECT pg_temp.expect_sqlstate(
  $q$SELECT public.promote_waitlist_entry('00000000-0000-0000-0000-000001003532')$q$,
  'P0001', 'R2 a manual offer into the seat the cron took is refused (Class is full)');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

DO $$
BEGIN
  PERFORM pg_temp.expect_eq(pg_temp.open_offers('304'), '1', 'R2 still one open offer');
END;
$$;

-- ---------------------------------------------------------------------------
-- N1-N3. The secretary's notice and the exhibitor's message
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT string_agg(n.deep_link_url, ',' ORDER BY n.message)
       FROM public.notifications n
      WHERE n.user_id = pg_temp.fid('021') AND n.type = 'waitlist_auto_offer'),
    '/shows/00000000-0000-0000-0000-000001003101/entries?tab=waitlist,'
      || '/shows/00000000-0000-0000-0000-000001003101/entries?tab=waitlist',
    'N1 two automatic offers, two notices for the secretary, linked to the Waitlist tab');
  PERFORM pg_temp.expect_eq(
    (SELECT n.message FROM public.notifications n
      WHERE n.user_id = pg_temp.fid('021') AND n.message LIKE 'Dog411%'),
    'Dog411 was offered the open spot in Class On automatically. The spot is held for 48 hours for payment. You can turn automatic offers off in Wait list settings.',
    'N1 the notice names the dog, the class and the offer window');
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM public.notifications n WHERE n.user_id = pg_temp.fid('022')),
    '0', 'N1 the club admin is not notified while the club has a secretary');
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM public.notifications n
      WHERE n.type = 'waitlist_auto_offer' AND n.message LIKE 'Dog414%'),
    '0', 'N3 the manual offer left no notice');

  PERFORM pg_temp.expect_eq(
    (SELECT m.sender_id::text || ' | ' || m.body
       FROM public.show_messages m
       JOIN public.show_message_threads t ON t.id = m.thread_id
      WHERE t.show_id = pg_temp.fid('101')
        AND t.participant_id = pg_temp.fid('023')
        AND m.body LIKE '%Class On%'),
    '00000000-0000-0000-0000-000001003021 | A waitlist spot in Class On just opened up for Dog411! Open My Entries to accept the offer before it expires.',
    'N2 the automatic offer sent the exhibitor the in-app message from the secretary');
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM public.show_message_threads t
      WHERE t.show_id = pg_temp.fid('101') AND t.participant_id = pg_temp.fid('023')),
    '1', 'N2 both automatic offers share the exhibitor''s one thread for the show');
END;
$$;

-- ---------------------------------------------------------------------------
-- E1 + S3: expire 561 as the cron does, switch the manual show on, run again.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
UPDATE public.entries SET entry_status = 'promotion-expired' WHERE id = pg_temp.fid('661');
UPDATE public.waitlist_entries SET status = 'expired' WHERE id = pg_temp.fid('561');
UPDATE public.shows SET waitlist_auto_offer = true WHERE id = pg_temp.fid('102');

CREATE TEMP TABLE run2 AS
SELECT * FROM public.offer_waitlist_spots_from_cron();
RESET ROLE;

DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT string_agg(substr(r.class_id::text, 34) || ':' || r.outcome || ':'
                       || substr(r.waitlist_entry_id::text, 34), ',' ORDER BY r.class_id)
       FROM run2 r),
    '302:offered:511,305:mail_in:541,307:offered:562',
    'RUN2 offers the switched-on show and the freed class, nothing twice');
  PERFORM pg_temp.expect_eq(pg_temp.wl_status('511'), 'offered', 'S3 switch turned on: offered');
  PERFORM pg_temp.expect_eq(pg_temp.wl_status('562'), 'offered',
    'E1 the next dog is offered in the run right after the expiry');
  PERFORM pg_temp.expect_eq(pg_temp.open_offers('301') || pg_temp.open_offers('303')
      || pg_temp.open_offers('304'),
    '111', 'RUN2 classes with an open offer get no second one');
END;
$$;

-- ---------------------------------------------------------------------------
-- M1. The manual path's message door
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001003021', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000001003021","role":"authenticated","app_metadata":{}}', true);
DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    public.send_waitlist_offer_message(pg_temp.fid('521'), 'https://checkout.example.test/pay/1003'),
    'sent', 'M1 the secretary sends the manual offer message');
  PERFORM pg_temp.expect_eq(
    public.send_waitlist_offer_message(pg_temp.fid('502'), NULL),
    'not_offered', 'M1 a row that is not an open offer sends nothing');
END;
$$;
SELECT pg_temp.expect_sqlstate(
  $q$SELECT public.send_waitlist_offer_message('00000000-0000-0000-0000-000001003521', 'javascript:alert(1)')$q$,
  '22023', 'M1 a non-https link is refused');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001003024', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000001003024","role":"authenticated","app_metadata":{}}', true);
SELECT pg_temp.expect_sqlstate(
  $q$SELECT public.send_waitlist_offer_message('00000000-0000-0000-0000-000001003521', NULL)$q$,
  '42501', 'M1 an outsider cannot send the offer message');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT m.sender_id::text || ' | ' || m.body
       FROM public.show_messages m
       JOIN public.show_message_threads t ON t.id = m.thread_id
      WHERE t.show_id = pg_temp.fid('101')
        AND t.participant_id = pg_temp.fid('023')
        AND m.body LIKE '%Class Race2%'),
    '00000000-0000-0000-0000-000001003021 | A waitlist spot in Class Race2 just opened up for Dog414! Complete payment to claim it: https://checkout.example.test/pay/1003',
    'M1 the manual message carries the payment link, from the secretary');
END;
$$;

ROLLBACK;
