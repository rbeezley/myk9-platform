-- MYK9-1019 (migration 20261005184700): one show-wide "Allow wait lists"
-- setting; a class follows it unless it has its own exception.
--
-- One published show, one trial, three classes, each with an entry limit of
-- one and filled by Otto's dog:
--   CN  allow_waitlist NULL   follows the show
--   CY  allow_waitlist true   its own exception: on
--   CX  allow_waitlist false  its own exception: off
--
-- For show off, then on, then off again, every reader must give the same
-- answer for every class:
--   class_allows_waitlist          the one rule
--   class_entry_availability       allow_waitlist and self_service_block
--   get_show_class_availability    what the wizard and the cart read
--   evaluate_entry_capacity        the submit's decision ('waitlisted' or
--                                  'denied') for a new dog of Ann's
-- Expected (the table the TS parity test classAllowsWaitlist.test.ts pins):
--   show off: CN no, CY yes, CX no
--   show on:  CN yes, CY yes, CX no
--
-- Also:
--   S1  shows.allow_waitlist is NOT NULL DEFAULT false; classes.allow_waitlist
--       has no default, so a new class follows its show.
--   S2  class_allows_waitlist is SECURITY INVOKER with an empty search_path,
--       and only service_role may call it.
--   S3  An unknown class reads false, never NULL.
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

-- A fixture id: 00000000-0000-0000-0000-000001019<suffix>.
CREATE FUNCTION pg_temp.id(p_suffix text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $f$
  SELECT ('00000000-0000-0000-0000-000001019' || p_suffix)::uuid
$f$;

CREATE FUNCTION pg_temp.act_as(p_auth_user uuid)
RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claim.sub', p_auth_user::text, true);
  SELECT set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', p_auth_user), true);
$f$;

-- ---------------------------------------------------------------------------
-- S1. The columns
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_eq(
  (SELECT is_nullable || ' ' || column_default
     FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shows' AND column_name = 'allow_waitlist'),
  'NO false', 'S1 shows.allow_waitlist is NOT NULL DEFAULT false');
SELECT pg_temp.expect_eq(
  (SELECT is_nullable || ' ' || COALESCE(column_default, '<none>')
     FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'classes' AND column_name = 'allow_waitlist'),
  'YES <none>', 'S1 classes.allow_waitlist is nullable with no default');

-- ---------------------------------------------------------------------------
-- S2. The helper's shape and ACL
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fn constant text := 'public.class_allows_waitlist(uuid)';
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT p.prosecdef || ' ' || p.provolatile::text || ' ' || array_to_string(p.proconfig, ',')
       FROM pg_proc p WHERE p.oid = v_fn::regprocedure),
    'false s search_path=""', 'S2 class_allows_waitlist is SECURITY INVOKER, STABLE, empty search_path');
  PERFORM pg_temp.expect_eq(
    has_function_privilege('anon', v_fn, 'EXECUTE') || ' '
      || has_function_privilege('authenticated', v_fn, 'EXECUTE') || ' '
      || has_function_privilege('service_role', v_fn, 'EXECUTE'),
    'false false true', 'S2 only service_role may call class_allows_waitlist');
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM pg_proc p, aclexplode(p.proacl) a
      WHERE p.oid = v_fn::regprocedure AND a.grantee = 0),
    '0', 'S2 PUBLIC holds no EXECUTE');
END;
$$;

SELECT pg_temp.expect_eq(public.class_allows_waitlist(pg_temp.id('999'))::text, 'false',
  'S3 an unknown class reads false');

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  (pg_temp.id('011'), 'Ann', 'MYK9-1019', 'myk91019-ann@example.test'),
  (pg_temp.id('021'), 'Otto', 'MYK9-1019', 'myk91019-otto@example.test');

-- People first, so handle_new_user adopts each one by email and creates the
-- exhibitor_profiles row itself.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email,
       '', now(), now(), now(), '{}', '{}', false, false, false
FROM (VALUES (pg_temp.id('012'), 'myk91019-ann@example.test'),
             (pg_temp.id('022'), 'myk91019-otto@example.test')) AS u (id, email);

INSERT INTO public.exhibitor_profiles (person_id, auth_user_id)
SELECT p.person_id, p.auth_user_id
FROM (VALUES (pg_temp.id('011'), pg_temp.id('012')), (pg_temp.id('021'), pg_temp.id('022')))
  AS p (person_id, auth_user_id)
WHERE NOT EXISTS (SELECT 1 FROM public.exhibitor_profiles ep WHERE ep.auth_user_id = p.auth_user_id);

INSERT INTO public.clubs (id, name) VALUES (pg_temp.id('041'), 'MYK9-1019 fixture club');

-- No allow_waitlist given: the show starts at the column default.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date, pre_entry_fee,
                          default_judge_day_capacity)
VALUES (pg_temp.id('101'), 'MYK9-1019 Show', 'AKC', current_date + 20, current_date + 21,
        pg_temp.id('041'), 'published', (current_date - 10)::timestamptz,
        (current_date + 10)::timestamptz, 30, 125);

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type)
VALUES (pg_temp.id('201'), pg_temp.id('101'), 'MYK9-1019 Trial', current_date + 20, 'AKC', 'Scent Work');

-- status_source = 'manual' so the auto-derivation trigger leaves the status alone.
INSERT INTO public.classes (id, trial_id, name, element, level, status, status_source, entry_fee,
                            max_entries, allow_waitlist)
VALUES
  (pg_temp.id('301'), pg_temp.id('201'), 'MYK9-1019 CN', 'Buried', 'Novice', 'upcoming', 'manual', 30, 1, NULL),
  (pg_temp.id('302'), pg_temp.id('201'), 'MYK9-1019 CY', 'Container', 'Novice', 'upcoming', 'manual', 30, 1, true),
  (pg_temp.id('303'), pg_temp.id('201'), 'MYK9-1019 CX', 'Interior', 'Novice', 'upcoming', 'manual', 30, 1, false);

-- A class created without the column follows its show.
INSERT INTO public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
VALUES (pg_temp.id('304'), pg_temp.id('201'), 'MYK9-1019 CD', 'Exterior', 'Novice', 'upcoming', 'manual', 30);
SELECT pg_temp.expect_eq(
  (SELECT COALESCE(allow_waitlist::text, 'null') FROM public.classes WHERE id = pg_temp.id('304')),
  'null', 'S1 a class inserted without allow_waitlist stores NULL (follows the show)');
SELECT pg_temp.expect_eq(
  (SELECT allow_waitlist::text FROM public.shows WHERE id = pg_temp.id('101')),
  'false', 'S1 a show inserted without allow_waitlist stores false');

-- Otto's dog fills every limited class; Ann has one new dog per phase, so a
-- wait-list row one phase writes never answers for the next.
INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
SELECT pg_temp.id(d.suffix), 'MYK9-1019 Dog ' || d.suffix, 'D' || d.suffix, 'Beagle', 'active', d.owner
FROM (VALUES ('401', pg_temp.id('021')),
             ('411', pg_temp.id('011')), ('412', pg_temp.id('011')), ('413', pg_temp.id('011')))
  AS d (suffix, owner);
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
SELECT d.id, 'AKC', 'SR1019' || right(d.id::text, 3), true
FROM public.dogs d
WHERE d.id IN (SELECT pg_temp.id(s) FROM unnest(ARRAY['401', '411', '412', '413']) s);

INSERT INTO public.entries (id, show_id, trial_id, class_id, dog_id, entry_status)
SELECT pg_temp.id('5' || right(c.suffix, 2)), pg_temp.id('101'), pg_temp.id('201'),
       pg_temp.id(c.suffix), pg_temp.id('401'), 'confirmed'
FROM unnest(ARRAY['301', '302', '303']) AS c (suffix);

-- Every reader, for every class, as one line: CN|CY|CX, each
-- helper/availability/block/wizard/decision.
CREATE FUNCTION pg_temp.readers(p_dog_suffix text)
RETURNS text LANGUAGE plpgsql AS $f$
DECLARE
  v_exhibitor uuid;
  v_out text[] := ARRAY[]::text[];
  v_class text;
  v_helper text;
  v_avail text;
  v_block text;
  v_wizard text;
  v_decision text;
BEGIN
  SELECT ep.id INTO v_exhibitor FROM public.exhibitor_profiles ep
   WHERE ep.auth_user_id = pg_temp.id('012');

  FOREACH v_class IN ARRAY ARRAY['301', '302', '303'] LOOP
    SET LOCAL ROLE service_role;
    v_helper := public.class_allows_waitlist(pg_temp.id(v_class))::text;
    SELECT a.allow_waitlist::text, COALESCE(a.self_service_block, 'open')
      INTO v_avail, v_block
      FROM public.class_entry_availability(ARRAY[pg_temp.id(v_class)]) a;
    SELECT c.outcome INTO v_decision
      FROM public.evaluate_entry_capacity(
        pg_temp.id(v_class), pg_temp.id(p_dog_suffix), v_exhibitor, NULL, 'self_service', false) c;
    RESET ROLE;

    -- The wizard's and the cart's read, as Ann.
    PERFORM pg_temp.act_as(pg_temp.id('012'));
    SET LOCAL ROLE authenticated;
    SELECT a.allow_waitlist::text INTO v_wizard
      FROM public.get_show_class_availability(pg_temp.id('101')) a
     WHERE a.class_id = pg_temp.id(v_class);
    RESET ROLE;

    v_out := v_out || (v_helper || '/' || v_avail || '/' || v_block || '/' || v_wizard
                       || '/' || v_decision);
  END LOOP;
  RETURN array_to_string(v_out, ' | ');
END;
$f$;

-- ---------------------------------------------------------------------------
-- P1. Show off (the default): only CY's own exception takes a wait list.
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_eq(pg_temp.readers('411'),
  'false/false/full/false/denied | true/true/open/true/waitlisted | false/false/full/false/denied',
  'P1 show off: CN follows (no), CY exception (yes), CX exception (no); every reader agrees');

-- ---------------------------------------------------------------------------
-- P2. Show on: CN follows it; CX's exception still wins.
-- ---------------------------------------------------------------------------
UPDATE public.shows SET allow_waitlist = true WHERE id = pg_temp.id('101');
SELECT pg_temp.expect_eq(pg_temp.readers('412'),
  'true/true/open/true/waitlisted | true/true/open/true/waitlisted | false/false/full/false/denied',
  'P2 show on: CN follows (yes), CY exception (yes), CX exception (no); every reader agrees');
SELECT pg_temp.expect_eq(
  (SELECT count(*)::text FROM public.waitlist_entries
    WHERE dog_id = pg_temp.id('412') AND status = 'waiting'),
  '2', 'P2 the wait-listed decisions wrote one waiting row per class that allows it');

-- ---------------------------------------------------------------------------
-- P3. Show off again: CN is refused again, even for a dog already waiting.
-- ---------------------------------------------------------------------------
UPDATE public.shows SET allow_waitlist = false WHERE id = pg_temp.id('101');
SELECT pg_temp.expect_eq(pg_temp.readers('413'),
  'false/false/full/false/denied | true/true/open/true/waitlisted | false/false/full/false/denied',
  'P3 show off again: CN follows back to no; the exceptions are unchanged');
SET LOCAL ROLE service_role;
SELECT pg_temp.expect_eq(
  (SELECT c.outcome FROM public.evaluate_entry_capacity(
     pg_temp.id('301'), pg_temp.id('412'),
     (SELECT ep.id FROM public.exhibitor_profiles ep WHERE ep.auth_user_id = pg_temp.id('012')),
     NULL, 'self_service', false) c),
  'denied', 'P3 a dog already waiting in CN is not taken again once the show is off');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- P4. Clearing an exception hands the class back to the show.
-- ---------------------------------------------------------------------------
UPDATE public.classes SET allow_waitlist = NULL WHERE id = pg_temp.id('302');
SET LOCAL ROLE service_role;
SELECT pg_temp.expect_eq(public.class_allows_waitlist(pg_temp.id('302'))::text, 'false',
  'P4 CY with its exception cleared follows the show (off)');
RESET ROLE;

ROLLBACK;
