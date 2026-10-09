-- MYK9-1071 (migration 20261009214700): version columns on dog_registrations and
-- people, and the queued person save public.update_person_details_versioned.
--
-- Cases:
--   1. Schema: both columns are integer NOT NULL DEFAULT 1, both bump triggers
--      exist, anon gains no privilege on either `version` column while keeping its
--      existing people column SELECT (positive control), and the function is
--      executable by authenticated only.
--   2. The version bumps by exactly one on every UPDATE of either table, through
--      RLS as the dog's owner and through update_person_details, and a forged
--      `version` in the UPDATE is overwritten.
--   3. update_person_details_versioned:
--      a. a show manager saves a mail-in entrant: returns version + 1, the column
--         and the people_private patch land;
--      b. the person saves their own row with the right version: version + 1;
--      c. a NULL expected version is no precondition;
--      d. a stale version raises 40001 with the current version in DETAIL and
--         writes nothing;
--      e. `email` is refused (22023) even for the person themself, and nothing
--         is written;
--      f. another exhibitor is refused 42501, with the right version AND with a
--         wrong one, so a refusal never reveals the version through a 40001;
--      g. anon cannot execute it (42501);
--      h. a NULL from update_person_details becomes 42501 (the inner function is
--         stubbed inside this rolled-back transaction, LAST, to reach that branch).
--
-- Fixture pattern from myk9_664_people_private_test.sql: people rows are seeded
-- BEFORE their auth.users rows so the signup trigger adopts them. That adoption is an
-- UPDATE, so versions are read back rather than assumed to be 1.
-- All fixtures roll back. Run with psql -X -v ON_ERROR_STOP=1 after migrations.

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

-- Runs one statement as `caller` (NULL = anon) the way PostgREST does. Returns the
-- single scalar result as text ('null' when none), or 'err:<SQLSTATE>:<DETAIL>'.
CREATE FUNCTION pg_temp.q(caller uuid, stmt text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_result text;
  v_state text;
  v_detail text;
BEGIN
  IF caller IS NULL THEN
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    PERFORM set_config('role', 'anon', true);
  ELSE
    PERFORM set_config('request.jwt.claim.sub', caller::text, true);
    PERFORM set_config('request.jwt.claims',
      jsonb_build_object('sub', caller, 'role', 'authenticated')::text, true);
    PERFORM set_config('role', 'authenticated', true);
  END IF;
  BEGIN
    EXECUTE stmt INTO v_result;
    v_result := coalesce(v_result, 'null');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_detail = PG_EXCEPTION_DETAIL;
    v_result := 'err:' || v_state || ':' || coalesce(v_detail, '');
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v_result;
END;
$$;

CREATE FUNCTION pg_temp.person_version(p_id uuid)
RETURNS integer LANGUAGE sql AS $$
  SELECT version FROM public.people WHERE id = p_id
$$;

-- ---------------------------------------------------------------------------
-- 1. Schema.
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect('version columns are integer NOT NULL DEFAULT 1 on both tables',
  (SELECT string_agg(table_name || ':' || data_type || ':' || is_nullable || ':' || column_default,
                     ',' ORDER BY table_name)
     FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'version'
      AND table_name IN ('dog_registrations', 'people')),
  'dog_registrations:integer:NO:1,people:integer:NO:1');

SELECT pg_temp.expect('both version triggers exist and call increment_replication_version',
  (SELECT string_agg(c.relname::text || ':' || t.tgname::text || ':' || p.proname::text,
                     ',' ORDER BY c.relname)
     FROM pg_trigger t
     JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgname IN ('dog_registrations_version_increment', 'people_version_increment')),
  'dog_registrations:dog_registrations_version_increment:increment_replication_version,'
  || 'people:people_version_increment:increment_replication_version');

SELECT pg_temp.expect('anon cannot read people.version',
  has_column_privilege('anon', 'public.people', 'version', 'SELECT')::text, 'false');
SELECT pg_temp.expect('positive control: anon keeps its people.first_name column SELECT',
  has_column_privilege('anon', 'public.people', 'first_name', 'SELECT')::text, 'true');
SELECT pg_temp.expect('anon reads exactly the four people columns it had before',
  (SELECT string_agg(a.attname::text, ',' ORDER BY a.attname)
     FROM pg_attribute a
    WHERE a.attrelid = 'public.people'::regclass AND a.attnum > 0 AND NOT a.attisdropped
      AND has_column_privilege('anon', 'public.people', a.attname::text, 'SELECT')),
  'email,first_name,id,last_name');
SELECT pg_temp.expect('anon cannot read dog_registrations.version',
  has_column_privilege('anon', 'public.dog_registrations', 'version', 'SELECT')::text, 'false');
SELECT pg_temp.expect('anon cannot update people',
  has_table_privilege('anon', 'public.people', 'UPDATE')::text, 'false');
SELECT pg_temp.expect('authenticated can read both version columns',
  (has_column_privilege('authenticated', 'public.people', 'version', 'SELECT')
   AND has_column_privilege('authenticated', 'public.dog_registrations', 'version', 'SELECT'))::text,
  'true');
SELECT pg_temp.expect('versioned save: authenticated may execute',
  has_function_privilege('authenticated',
    'public.update_person_details_versioned(uuid, integer, jsonb, jsonb)', 'EXECUTE')::text,
  'true');
SELECT pg_temp.expect('versioned save: anon may not execute',
  has_function_privilege('anon',
    'public.update_person_details_versioned(uuid, integer, jsonb, jsonb)', 'EXECUTE')::text,
  'false');
SELECT pg_temp.expect('versioned save: no PUBLIC grant',
  (SELECT count(*)::text
     FROM pg_proc p, aclexplode(p.proacl) a
    WHERE p.oid = 'public.update_person_details_versioned(uuid, integer, jsonb, jsonb)'::regprocedure
      AND a.grantee = 0),
  '0');
SELECT pg_temp.expect('versioned save is SECURITY DEFINER with an empty search_path',
  (SELECT p.prosecdef::text || ':' || array_to_string(p.proconfig, ',')
     FROM pg_proc p
    WHERE p.oid = 'public.update_person_details_versioned(uuid, integer, jsonb, jsonb)'::regprocedure),
  'true:search_path=""');

-- ---------------------------------------------------------------------------
-- Fixtures.
--   1071011 secretary of club A (auth 1071101), manages show A
--   1071014 self: signs in (auth 1071104), handles an entry in show A
--   1071015 mail-in entrant, no sign-in, handles an entry in show A
--   1071016 other exhibitor (auth 1071106), entered in nothing
-- ---------------------------------------------------------------------------
INSERT INTO public.clubs (id, name, authorized_at)
VALUES ('00000000-0000-0000-0000-000001071001', 'MYK9-1071 Club A', now());
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES ('00000000-0000-0000-0000-000001071002', 'MYK9-1071 Show A', 'AKC',
        date '2026-10-10', date '2026-10-10', '00000000-0000-0000-0000-000001071001', 'published');
INSERT INTO public.trials (id, show_id, name, date, registry_id)
VALUES ('00000000-0000-0000-0000-000001071003', '00000000-0000-0000-0000-000001071002',
        'MYK9-1071 Trial A', date '2026-10-10', 'AKC');
INSERT INTO public.classes (id, trial_id, name, status)
VALUES ('00000000-0000-0000-0000-000001071004', '00000000-0000-0000-0000-000001071003',
        'Container Novice', 'upcoming');

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000001071011', 'MYK9-1071', 'SecretaryA', 'myk9-1071-sec-a@example.test'),
  ('00000000-0000-0000-0000-000001071014', 'MYK9-1071', 'Self', 'myk9-1071-self@example.test'),
  ('00000000-0000-0000-0000-000001071015', 'MYK9-1071', 'MailIn', null),
  ('00000000-0000-0000-0000-000001071016', 'MYK9-1071', 'Other', 'myk9-1071-other@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT v.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email, '',
       now(), now(), now(), '{}', '{}', false, false, false
FROM (VALUES
  ('00000000-0000-0000-0000-000001071101'::uuid, 'myk9-1071-sec-a@example.test'),
  ('00000000-0000-0000-0000-000001071104'::uuid, 'myk9-1071-self@example.test'),
  ('00000000-0000-0000-0000-000001071106'::uuid, 'myk9-1071-other@example.test')
) AS v(id, email);

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000001071011', r.id, '00000000-0000-0000-0000-000001071001',
       true, '00000000-0000-0000-0000-000001071101'
FROM public.roles r WHERE r.name = 'secretary';

INSERT INTO public.dogs (id, name, call_name, breed, owner_id)
VALUES
  ('00000000-0000-0000-0000-000001071021', 'MYK9-1071 Dog Self', 'Self', 'Beagle',
   '00000000-0000-0000-0000-000001071014'),
  ('00000000-0000-0000-0000-000001071022', 'MYK9-1071 Dog MailIn', 'MailIn', 'Beagle',
   '00000000-0000-0000-0000-000001071015');
INSERT INTO public.dog_registrations (id, dog_id, organization, registration_number, is_primary)
VALUES
  ('00000000-0000-0000-0000-000001071031', '00000000-0000-0000-0000-000001071021',
   'AKC (American Kennel Club)', 'SR1071021', true),
  ('00000000-0000-0000-0000-000001071032', '00000000-0000-0000-0000-000001071022',
   'AKC (American Kennel Club)', 'SR1071022', true);

INSERT INTO public.entries (id, dog_id, class_id, show_id, trial_id, handler, handler_id,
  entry_status, payment_status, entry_fee, check_in_status)
VALUES
  ('00000000-0000-0000-0000-000001071041', '00000000-0000-0000-0000-000001071021',
   '00000000-0000-0000-0000-000001071004', '00000000-0000-0000-0000-000001071002',
   '00000000-0000-0000-0000-000001071003', 'MYK9-1071 Self',
   '00000000-0000-0000-0000-000001071014', 'confirmed', 'pending', 25, 'no-status'),
  ('00000000-0000-0000-0000-000001071042', '00000000-0000-0000-0000-000001071022',
   '00000000-0000-0000-0000-000001071004', '00000000-0000-0000-0000-000001071002',
   '00000000-0000-0000-0000-000001071003', 'MYK9-1071 MailIn',
   '00000000-0000-0000-0000-000001071015', 'confirmed', 'pending', 25, 'no-status');

DO $$
BEGIN
  IF (SELECT count(*) FROM public.people
       WHERE id IN ('00000000-0000-0000-0000-000001071011', '00000000-0000-0000-0000-000001071014',
                    '00000000-0000-0000-0000-000001071016')
         AND auth_user_id IS NOT NULL) <> 3 THEN
    RAISE EXCEPTION 'FAIL fixture: seeded people were not adopted at signup';
  END IF;
END;
$$;

SELECT pg_temp.expect('positive control: secretary A can manage the mail-in entrant',
  pg_temp.q('00000000-0000-0000-0000-000001071101',
    $s$SELECT public.can_manage_show_person('00000000-0000-0000-0000-000001071015')$s$),
  'true');
SELECT pg_temp.expect('positive control: the other exhibitor cannot manage the mail-in entrant',
  pg_temp.q('00000000-0000-0000-0000-000001071106',
    $s$SELECT public.can_manage_show_person('00000000-0000-0000-0000-000001071015')$s$),
  'false');

-- ---------------------------------------------------------------------------
-- 2. The version bumps on every UPDATE, and cannot be forged.
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect('a new registration starts at version 1',
  (SELECT version::text FROM public.dog_registrations
    WHERE id = '00000000-0000-0000-0000-000001071031'),
  '1');
SELECT pg_temp.expect('the dog owner updates a registration through RLS; version becomes 2',
  pg_temp.q('00000000-0000-0000-0000-000001071104',
    $s$UPDATE public.dog_registrations SET registered_name = 'MYK9-1071 Registered'
       WHERE id = '00000000-0000-0000-0000-000001071031' RETURNING version$s$),
  '2');
SELECT pg_temp.expect('a forged registration version is overwritten (2 -> 3, not 999)',
  pg_temp.q('00000000-0000-0000-0000-000001071104',
    $s$UPDATE public.dog_registrations SET version = 999, status = 'pending'
       WHERE id = '00000000-0000-0000-0000-000001071031' RETURNING version$s$),
  '3');

CREATE TEMP TABLE v0 ON COMMIT DROP AS
SELECT pg_temp.person_version('00000000-0000-0000-0000-000001071014') AS self_v,
       pg_temp.person_version('00000000-0000-0000-0000-000001071015') AS mailin_v,
       pg_temp.person_version('00000000-0000-0000-0000-000001071016') AS other_v;

SELECT pg_temp.expect('a forged people version is overwritten (bumped by one)',
  pg_temp.q('00000000-0000-0000-0000-000001071104',
    $s$UPDATE public.people SET version = 999, phone = '555-0100'
       WHERE id = '00000000-0000-0000-0000-000001071014' RETURNING version$s$),
  ((SELECT self_v FROM v0) + 1)::text);
SELECT pg_temp.expect('update_person_details bumps the people version by one',
  pg_temp.q('00000000-0000-0000-0000-000001071104',
    $s$SELECT (public.update_person_details('00000000-0000-0000-0000-000001071014',
       '{"city":"Plainfield"}'::jsonb) ->> 'version')$s$),
  ((SELECT self_v FROM v0) + 2)::text);

-- ---------------------------------------------------------------------------
-- 3. update_person_details_versioned.
-- ---------------------------------------------------------------------------
-- a. Show manager saves a mail-in entrant.
SELECT pg_temp.expect('a. manager save returns version + 1',
  pg_temp.q('00000000-0000-0000-0000-000001071101',
    format($s$SELECT public.update_person_details_versioned(
       '00000000-0000-0000-0000-000001071015', %s,
       '{"phone":"555-0115","city":"Edison"}'::jsonb,
       '{"date_of_birth":"1990-02-03"}'::jsonb)$s$, (SELECT mailin_v FROM v0))),
  ((SELECT mailin_v FROM v0) + 1)::text);
SELECT pg_temp.expect('a. the people columns landed',
  (SELECT phone || '|' || city FROM public.people WHERE id = '00000000-0000-0000-0000-000001071015'),
  '555-0115|Edison');
SELECT pg_temp.expect('a. the people_private patch landed in the same call',
  (SELECT date_of_birth::text FROM public.people_private
    WHERE person_id = '00000000-0000-0000-0000-000001071015'),
  '1990-02-03');

-- b. The person saves their own row (self is now at self_v + 2, from section 2).
SELECT pg_temp.expect('b. self save with the current version returns version + 1',
  pg_temp.q('00000000-0000-0000-0000-000001071104',
    format($s$SELECT public.update_person_details_versioned(
       '00000000-0000-0000-0000-000001071014', %s, '{"state":"NJ"}'::jsonb)$s$,
       (SELECT self_v FROM v0) + 2)),
  ((SELECT self_v FROM v0) + 3)::text);

-- c. NULL expected version: no precondition.
SELECT pg_temp.expect('c. a NULL expected version saves without a precondition',
  pg_temp.q('00000000-0000-0000-0000-000001071104',
    $s$SELECT public.update_person_details_versioned(
       '00000000-0000-0000-0000-000001071014', NULL, '{"zip_code":"07060"}'::jsonb)$s$),
  ((SELECT self_v FROM v0) + 4)::text);

-- d. Stale version.
SELECT pg_temp.expect('d. a stale version raises 40001 with the current version in DETAIL',
  pg_temp.q('00000000-0000-0000-0000-000001071104',
    format($s$SELECT public.update_person_details_versioned(
       '00000000-0000-0000-0000-000001071014', %s, '{"city":"Stale"}'::jsonb)$s$,
       (SELECT self_v FROM v0))),
  'err:40001:' || ((SELECT self_v FROM v0) + 4)::text);
SELECT pg_temp.expect('d. the stale save wrote nothing',
  (SELECT city || '|' || version::text FROM public.people
    WHERE id = '00000000-0000-0000-0000-000001071014'),
  'Plainfield|' || ((SELECT self_v FROM v0) + 4)::text);

-- e. Email is refused, even for the person themself with the right version.
SELECT pg_temp.expect('e. email is refused with 22023',
  pg_temp.q('00000000-0000-0000-0000-000001071104',
    format($s$SELECT public.update_person_details_versioned(
       '00000000-0000-0000-0000-000001071014', %s,
       '{"email":"myk9-1071-self@example.test","city":"Email"}'::jsonb)$s$,
       (SELECT self_v FROM v0) + 4)),
  'err:22023:');
SELECT pg_temp.expect('e. the refused email save wrote nothing',
  (SELECT city || '|' || version::text FROM public.people
    WHERE id = '00000000-0000-0000-0000-000001071014'),
  'Plainfield|' || ((SELECT self_v FROM v0) + 4)::text);

-- f. Another exhibitor, with the right version and with a wrong one.
SELECT pg_temp.expect('f. another exhibitor is refused 42501 with the right version',
  pg_temp.q('00000000-0000-0000-0000-000001071106',
    format($s$SELECT public.update_person_details_versioned(
       '00000000-0000-0000-0000-000001071015', %s, '{"city":"Hijack"}'::jsonb)$s$,
       (SELECT mailin_v FROM v0) + 1)),
  'err:42501:');
SELECT pg_temp.expect('f. another exhibitor with a wrong version still gets 42501, not 40001',
  pg_temp.q('00000000-0000-0000-0000-000001071106',
    $s$SELECT public.update_person_details_versioned(
       '00000000-0000-0000-0000-000001071015', 12345, '{"city":"Hijack"}'::jsonb)$s$),
  'err:42501:');
SELECT pg_temp.expect('f. positive control: the other exhibitor can save their own row',
  pg_temp.q('00000000-0000-0000-0000-000001071106',
    format($s$SELECT public.update_person_details_versioned(
       '00000000-0000-0000-0000-000001071016', %s, '{"city":"Rahway"}'::jsonb)$s$,
       (SELECT other_v FROM v0))),
  ((SELECT other_v FROM v0) + 1)::text);
SELECT pg_temp.expect('f. the mail-in entrant is unchanged by the refused saves',
  (SELECT city FROM public.people WHERE id = '00000000-0000-0000-0000-000001071015'),
  'Edison');

-- g. anon.
SELECT pg_temp.expect('g. anon cannot execute the versioned save',
  pg_temp.q(NULL,
    $s$SELECT public.update_person_details_versioned(
       '00000000-0000-0000-0000-000001071015', NULL, '{"city":"Anon"}'::jsonb)$s$),
  'err:42501:');

-- h. LAST: stub the inner function to return NULL (rolled back with everything else).
CREATE OR REPLACE FUNCTION public.update_person_details(
  p_person_id uuid,
  p_people jsonb DEFAULT '{}'::jsonb,
  p_private jsonb DEFAULT '{}'::jsonb,
  p_require_unlinked boolean DEFAULT false
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$ SELECT NULL::jsonb $$;

SELECT pg_temp.expect('h. a NULL from update_person_details becomes 42501',
  pg_temp.q('00000000-0000-0000-0000-000001071104',
    $s$SELECT public.update_person_details_versioned(
       '00000000-0000-0000-0000-000001071014', NULL, '{"city":"Null"}'::jsonb)$s$),
  'err:42501:');

ROLLBACK;
