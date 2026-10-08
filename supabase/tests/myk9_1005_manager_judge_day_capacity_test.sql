-- MYK9-1005 (migration 20261005163700): the secretary's judge-day cards read
-- get_show_judge_day_capacity_for_manager, which counts EVERY account's held
-- spots, the secretary's own included (Codex P2 on #2771).
--
-- One show, two judge days:
--   Jo   one-dog day: class C1. Sam (who manages the show) also has a cart,
--        and his own checkout holds C1's only spot.
--   Kim  three-dog day: classes C2 and C3. Bea's checkout holds a spot in C2;
--        dog W waits in C3.
--
-- Properties asserted here:
--   M1  Shape and ACL: SECURITY DEFINER, search_path '', authenticated may
--       execute, anon and PUBLIC may not.
--   M2  THE P2: the cart's read leaves out Sam's own hold, so Jo's day reads
--       one spot free to him; the manager read counts it and the day reads
--       full, as the waitlist offer will decide.
--   M3  One read carries the card: judge name, classes, the server's
--       capacity / taken / mail-in / remaining, and the dogs waiting.
--   M4  When the hold ends the day has its spot back.
--   M5  Someone who does not manage the show gets no rows.

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

-- A fixture id: 00000000-0000-0000-0000-000001005<suffix>.
CREATE FUNCTION pg_temp.id(p_suffix text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $f$
  SELECT ('00000000-0000-0000-0000-000001005' || p_suffix)::uuid
$f$;

-- The manager read for the fixture show, one day per line:
-- judge|classes|capacity/taken/mail-in/remaining|waiting
CREATE FUNCTION pg_temp.manager_days()
RETURNS text LANGUAGE sql AS $f$
  SELECT COALESCE(string_agg(
           d.judge_full_name || '|' || array_to_string(d.class_names, ',') || '|'
             || d.day_capacity || '/' || d.day_taken || '/' || d.day_mail_in_reserved
             || '/' || d.day_remaining || '|' || d.waitlist_count,
           ' ; ' ORDER BY d.judge_full_name), '')
    FROM public.get_show_judge_day_capacity_for_manager(pg_temp.id('101')) d
$f$;

CREATE FUNCTION pg_temp.act_as(p_auth_user uuid)
RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claim.sub', p_auth_user::text, true);
  SELECT set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', p_auth_user), true);
$f$;

-- ---------------------------------------------------------------------------
-- M1. Shape and ACL
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fn constant text := 'public.get_show_judge_day_capacity_for_manager(uuid)';
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT p.prosecdef || ' ' || array_to_string(p.proconfig, ',')
       FROM pg_proc p WHERE p.oid = v_fn::regprocedure),
    'true search_path=""', 'M1 the manager read is SECURITY DEFINER with an empty search_path');
  PERFORM pg_temp.expect_eq(
    has_function_privilege('anon', v_fn, 'EXECUTE') || ' '
      || has_function_privilege('authenticated', v_fn, 'EXECUTE'),
    'false true', 'M1 authenticated may call it, anon may not');
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM pg_proc p, aclexplode(p.proacl) a
      WHERE p.oid = v_fn::regprocedure AND a.grantee = 0),
    '0', 'M1 PUBLIC holds no EXECUTE');
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  (pg_temp.id('011'), 'Sam', 'Secretary', 'myk91005-sam@example.test'),
  (pg_temp.id('021'), 'Bea', 'MYK9-1005', 'myk91005-bea@example.test'),
  (pg_temp.id('031'), 'Jo', 'Judge', 'myk91005-jo@example.test'),
  (pg_temp.id('032'), 'Kim', 'Judge', 'myk91005-kim@example.test'),
  (pg_temp.id('061'), 'Ozzy', 'Outsider', 'myk91005-ozzy@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email,
       '', now(), now(), now(), '{}', '{}', false, false, false
FROM (VALUES (pg_temp.id('012'), 'myk91005-sam@example.test'),
             (pg_temp.id('022'), 'myk91005-bea@example.test'),
             (pg_temp.id('062'), 'myk91005-ozzy@example.test')) AS u (id, email);

INSERT INTO public.exhibitor_profiles (person_id, auth_user_id)
SELECT p.person_id, p.auth_user_id
FROM (VALUES (pg_temp.id('011'), pg_temp.id('012')), (pg_temp.id('021'), pg_temp.id('022')))
  AS p (person_id, auth_user_id)
WHERE NOT EXISTS (SELECT 1 FROM public.exhibitor_profiles ep WHERE ep.auth_user_id = p.auth_user_id);

INSERT INTO public.clubs (id, name) VALUES (pg_temp.id('041'), 'MYK9-1005 fixture club');

-- Sam manages the show: club_admin of its club. Ozzy has no role anywhere.
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT pg_temp.id('011'), r.id, pg_temp.id('041'), true, pg_temp.id('012')
FROM public.roles r WHERE r.name = 'club_admin';

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date, pre_entry_fee,
                          default_judge_day_capacity)
VALUES (pg_temp.id('101'), 'MYK9-1005 Show', 'AKC', current_date + 20, current_date + 21,
        pg_temp.id('041'), 'published', (current_date - 10)::timestamptz,
        (current_date + 10)::timestamptz, 30, 125);

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type)
VALUES (pg_temp.id('201'), pg_temp.id('101'), 'MYK9-1005 Trial', current_date + 20, 'AKC', 'Scent Work');

INSERT INTO public.classes (id, trial_id, name, element, level, status, status_source, entry_fee,
                            max_entries, allow_waitlist)
VALUES
  (pg_temp.id('301'), pg_temp.id('201'), 'MYK9-1005 C1', 'Buried', 'Novice', 'upcoming', 'manual', 30, NULL, true),
  (pg_temp.id('302'), pg_temp.id('201'), 'MYK9-1005 C2', 'Container', 'Novice', 'upcoming', 'manual', 30, NULL, true),
  (pg_temp.id('303'), pg_temp.id('201'), 'MYK9-1005 C3', 'Interior', 'Novice', 'upcoming', 'manual', 30, NULL, true);

-- Jo's day takes one dog; Kim's takes three.
INSERT INTO public.judge_assignments (person_id, show_id, trial_id, class_id, status,
                                      day_capacity_override)
VALUES
  (pg_temp.id('031'), pg_temp.id('101'), pg_temp.id('201'), pg_temp.id('301'), 'confirmed', 1),
  (pg_temp.id('032'), pg_temp.id('101'), pg_temp.id('201'), pg_temp.id('302'), 'confirmed', 3),
  (pg_temp.id('032'), pg_temp.id('101'), pg_temp.id('201'), pg_temp.id('303'), 'confirmed', 3);

INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
SELECT pg_temp.id(d.suffix), 'MYK9-1005 Dog ' || d.suffix, 'D' || d.suffix, 'Beagle', 'active', d.owner
FROM (VALUES ('401', pg_temp.id('011')), ('411', pg_temp.id('021')), ('421', pg_temp.id('021')))
  AS d (suffix, owner);
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
SELECT d.id, 'AKC', 'SR1005' || right(d.id::text, 3), true
FROM public.dogs d
WHERE d.id IN (SELECT pg_temp.id(s) FROM unnest(ARRAY['401', '411', '421']) s);

SET LOCAL ROLE service_role;
INSERT INTO public.entry_carts (id, exhibitor_id, show_id, status, expires_at)
SELECT c.id, ep.id, pg_temp.id('101'), 'active', now() + interval '30 minutes'
FROM (VALUES (pg_temp.id('601'), pg_temp.id('012')), (pg_temp.id('611'), pg_temp.id('022'))) AS c (id, auth_id)
JOIN public.exhibitor_profiles ep ON ep.auth_user_id = c.auth_id;

INSERT INTO public.entry_cart_items (id, cart_id, dog_id, class_id, entry_fee_cents)
VALUES
  (pg_temp.id('701'), pg_temp.id('601'), pg_temp.id('401'), pg_temp.id('301'), 3000),
  (pg_temp.id('711'), pg_temp.id('611'), pg_temp.id('411'), pg_temp.id('302'), 3000);

-- Sam's own checkout holds Jo's only spot; Bea's holds one of Kim's.
INSERT INTO public.cart_spot_holds (cart_id, cart_item_id, class_id, expires_at)
VALUES
  (pg_temp.id('601'), pg_temp.id('701'), pg_temp.id('301'), now() + interval '30 minutes'),
  (pg_temp.id('611'), pg_temp.id('711'), pg_temp.id('302'), now() + interval '30 minutes');

-- Dog W waits in C3.
INSERT INTO public.waitlist_entries (id, class_id, exhibitor_id, dog_id, position, joined_via)
SELECT pg_temp.id('801'), pg_temp.id('303'), ep.id, pg_temp.id('421'), 1, 'online'
FROM public.exhibitor_profiles ep WHERE ep.auth_user_id = pg_temp.id('022');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- M2 / M3. Sam, who manages the show and holds Jo's last spot himself
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as(pg_temp.id('012'));
DO $$
BEGIN
  -- The precondition the P2 is about: the cart's read gives Sam his own hold back.
  PERFORM pg_temp.expect_eq(
    (SELECT a.day_taken || '/' || a.day_remaining
       FROM public.get_show_class_judge_day_availability(pg_temp.id('101')) a
      WHERE a.class_id = pg_temp.id('301')),
    '0/1', 'M2 fixture: the cart''s read leaves out Sam''s own hold (Jo''s day reads open to him)');
  PERFORM pg_temp.expect_eq(
    pg_temp.manager_days(),
    'Jo Judge|MYK9-1005 C1|1/1/0/0|0 ; Kim Judge|MYK9-1005 C2,MYK9-1005 C3|3/1/0/2|1',
    'M2 M3 the manager read counts every hold, Sam''s own included: Jo''s day is full; '
      || 'Kim''s day carries its classes, Bea''s hold and the dog waiting');
  PERFORM pg_temp.expect_eq(
    (SELECT array_to_string(d.class_ids, ',')
       FROM public.get_show_judge_day_capacity_for_manager(pg_temp.id('101')) d
      WHERE d.judge_id = pg_temp.id('032')),
    pg_temp.id('302') || ',' || pg_temp.id('303'),
    'M3 class ids line up with class names');
END;
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- M4. The hold ends
-- ---------------------------------------------------------------------------
UPDATE public.cart_spot_holds h SET expires_at = now() - interval '1 second'
 WHERE h.cart_item_id = pg_temp.id('701');

SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as(pg_temp.id('012'));
DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT d.day_taken || '/' || d.day_remaining
       FROM public.get_show_judge_day_capacity_for_manager(pg_temp.id('101')) d
      WHERE d.judge_id = pg_temp.id('031')),
    '0/1', 'M4 when Sam''s hold ends Jo''s day has its spot back');
END;
$$;

-- ---------------------------------------------------------------------------
-- M5. An outsider
-- ---------------------------------------------------------------------------
SELECT pg_temp.act_as(pg_temp.id('062'));
DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM public.get_show_judge_day_capacity_for_manager(pg_temp.id('101'))),
    '0', 'M5 someone who does not manage the show gets no rows');
END;
$$;
RESET ROLE;

-- MYK9-1017: every strategy still offered by settings reserves the advertised
-- spots until its release date. Only this transaction's fixture is changed.
DO $$
DECLARE
  strategy text;
  release_day date;
  reserved integer;
  submission_source text;
BEGIN
  FOREACH strategy IN ARRAY ARRAY['none', 'fixed', 'percentage'] LOOP
    UPDATE public.shows
       SET mail_in_strategy = strategy,
           mail_in_value = CASE WHEN strategy = 'percentage' THEN 50 ELSE 1 END,
           mail_in_auto_release = true
     WHERE id = pg_temp.id('101');
    FOREACH release_day IN ARRAY ARRAY[CURRENT_DATE + 1, CURRENT_DATE, CURRENT_DATE - 1] LOOP
      UPDATE public.shows SET mail_in_release_date = release_day WHERE id = pg_temp.id('101');
      reserved := CASE WHEN strategy = 'none' OR release_day <= CURRENT_DATE THEN 0 ELSE 1 END;
      PERFORM pg_temp.expect_eq(
        (SELECT c.mail_in_reserved || '/' || c.available_spots
           FROM public.get_judge_day_capacity_live(
             pg_temp.id('032'), pg_temp.id('101'), CURRENT_DATE + 20) c),
        reserved || '/' || (2 - reserved),
        'MYK9-1017 ' || strategy || ' release ' || release_day);
    END LOOP;
    UPDATE public.shows SET mail_in_auto_release = false WHERE id = pg_temp.id('101');
    reserved := CASE WHEN strategy = 'none' THEN 0 ELSE 1 END;
    PERFORM pg_temp.expect_eq(
      (SELECT c.mail_in_reserved || '/' || c.available_spots
         FROM public.get_judge_day_capacity_live(
           pg_temp.id('032'), pg_temp.id('101'), CURRENT_DATE + 20) c),
      reserved || '/' || (2 - reserved),
      'MYK9-1017 ' || strategy || ' keeps its reserve when release is disabled');
  END LOOP;
  UPDATE public.shows
     SET mail_in_strategy = 'fixed', mail_in_value = 2,
         mail_in_auto_release = true, mail_in_release_date = CURRENT_DATE + 1
   WHERE id = pg_temp.id('101');
  FOREACH submission_source IN ARRAY ARRAY['self_service', 'organizer', 'show_desk'] LOOP
    PERFORM pg_temp.expect_eq(
      (SELECT e.outcome FROM public.evaluate_entry_capacity(
        pg_temp.id('302'), pg_temp.id('421'), NULL, NULL, submission_source) e),
      CASE WHEN submission_source = 'self_service' THEN 'denied' ELSE 'available' END,
      'MYK9-1017 saturated reserve gate for ' || submission_source);
  END LOOP;
  UPDATE public.shows SET mail_in_release_date = CURRENT_DATE WHERE id = pg_temp.id('101');
  PERFORM pg_temp.expect_eq(
    (SELECT e.outcome FROM public.evaluate_entry_capacity(
      pg_temp.id('302'), pg_temp.id('421'), NULL, NULL, 'self_service') e),
    'available', 'MYK9-1017 release returns reserved spots to self-service');
END;
$$;

ROLLBACK;
