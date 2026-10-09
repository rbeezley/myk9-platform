-- MYK9-1059 (migration 20261009174300): dogs and people record who created
-- them (created_by, an auth uid) and from which show (created_from_show_id).
--
-- Cases:
--   0. positive controls: the club A secretary manages show A, the club B
--      secretary and the exhibitor do not, and the club B secretary manages
--      show B;
--   1. created_by is stamped from the JWT on INSERT and a forged value is
--      ignored, for people and dogs, through PostgREST-shaped inserts AND
--      through the SECURITY DEFINER create_dog_with_registrations RPC;
--   2. created_from_show_id is kept when the inserter manages the show, and
--      silently dropped to NULL (the insert still lands) when it does not;
--   3. on UPDATE created_by cannot change, created_from_show_id cannot be moved
--      to another show, and it may be cleared; each update also changes an
--      ordinary column, which proves RLS let the UPDATE reach the row;
--   4. sessions with no auth.uid() (service_role, seeds) keep supplied values;
--   5. deleting a show clears created_from_show_id (ON DELETE SET NULL) even
--      while a JWT is in effect;
--   6. anon can neither read nor write the columns and cannot insert; the
--      trigger function is executable by no API role; the FKs are SET NULL and
--      the partial indexes exist.
--
-- people.id (10590xx) and auth uid (10591xx) are deliberately different.
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

-- Returns the SQLSTATE p_sql failed with, or 'ok'. Runs as the CURRENT role.
CREATE FUNCTION pg_temp.sqlstate_of(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_state text;
BEGIN
  EXECUTE p_sql;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  RETURN v_state;
END;
$$;

CREATE FUNCTION pg_temp.act_as(p_sub text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_sub, true);
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', p_sub), true);
END;
$$;

CREATE FUNCTION pg_temp.no_jwt()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures, inserted with no JWT (so the guard leaves them alone).
--   1059001 secretary of club A     1059002 secretary of club B
--   1059003 exhibitor, no role
-- People first, then auth.users, so handle_new_user adopts them.
-- ---------------------------------------------------------------------------
SELECT pg_temp.no_jwt();

INSERT INTO public.clubs (id, name, authorized_at)
VALUES
  ('00000000-0000-0000-0000-000001059010', 'MYK9-1059 Club A', now()),
  ('00000000-0000-0000-0000-000001059011', 'MYK9-1059 Club B', now());

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000001059001', 'MYK9-1059', 'SecretaryA', 'myk9-1059-seca@example.test'),
  ('00000000-0000-0000-0000-000001059002', 'MYK9-1059', 'SecretaryB', 'myk9-1059-secb@example.test'),
  ('00000000-0000-0000-0000-000001059003', 'MYK9-1059', 'Exhibitor', 'myk9-1059-exh@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT v.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email, '',
       now(), now(), now(), '{}', '{}', false, false, false
FROM (VALUES
  ('00000000-0000-0000-0000-000001059101'::uuid, 'myk9-1059-seca@example.test'),
  ('00000000-0000-0000-0000-000001059102'::uuid, 'myk9-1059-secb@example.test'),
  ('00000000-0000-0000-0000-000001059103'::uuid, 'myk9-1059-exh@example.test')
) AS v(id, email);

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT v.person_id, r.id, v.club_id, true, v.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000001059001'::uuid, '00000000-0000-0000-0000-000001059010'::uuid, '00000000-0000-0000-0000-000001059101'::uuid),
  ('00000000-0000-0000-0000-000001059002'::uuid, '00000000-0000-0000-0000-000001059011'::uuid, '00000000-0000-0000-0000-000001059102'::uuid)
) AS v(person_id, club_id, auth_id)
JOIN public.roles r ON r.name = 'secretary';

INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
VALUES
  ('00000000-0000-0000-0000-000001059100', 'MYK9-1059 Show A', 'AKC', current_date, current_date,
   'draft', '00000000-0000-0000-0000-000001059010'),
  ('00000000-0000-0000-0000-000001059110', 'MYK9-1059 Show B', 'AKC', current_date, current_date,
   'draft', '00000000-0000-0000-0000-000001059011');

-- A dog the exhibitor owns that a service path stamped with show A.
INSERT INTO public.dogs (id, call_name, breed, owner_id, created_by, created_from_show_id)
VALUES ('00000000-0000-0000-0000-000001059400', 'MYK9-1059 Seeded', 'Border Collie',
        '00000000-0000-0000-0000-000001059003', '00000000-0000-0000-0000-000001059999',
        '00000000-0000-0000-0000-000001059100');

DO $$
BEGIN
  IF (SELECT count(*) FROM public.people
      WHERE id::text LIKE '00000000-0000-0000-0000-0000010590%'
        AND auth_user_id IS NOT NULL) <> 3 THEN
    RAISE EXCEPTION 'FIXTURE handle_new_user did not adopt all three people rows';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 0. Positive controls.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

SELECT pg_temp.act_as('00000000-0000-0000-0000-000001059101');
SELECT pg_temp.expect('secretary A manages show A (positive control)',
  public.can_manage_show('00000000-0000-0000-0000-000001059100')::text, 'true');

SELECT pg_temp.act_as('00000000-0000-0000-0000-000001059102');
SELECT pg_temp.expect('secretary B does not manage show A',
  public.can_manage_show('00000000-0000-0000-0000-000001059100')::text, 'false');
SELECT pg_temp.expect('secretary B manages show B (positive control)',
  public.can_manage_show('00000000-0000-0000-0000-000001059110')::text, 'true');

SELECT pg_temp.act_as('00000000-0000-0000-0000-000001059103');
SELECT pg_temp.expect('the exhibitor does not manage show A',
  public.can_manage_show('00000000-0000-0000-0000-000001059100')::text, 'false');

-- ---------------------------------------------------------------------------
-- 1 + 2. Inserts.
-- ---------------------------------------------------------------------------

-- Secretary A, from show A's add-entry flow, forging created_by.
SELECT pg_temp.act_as('00000000-0000-0000-0000-000001059101');
INSERT INTO public.people (id, first_name, last_name, created_by, created_from_show_id)
VALUES ('00000000-0000-0000-0000-000001059201', 'MYK9-1059', 'AddedAtShowA',
        '00000000-0000-0000-0000-000001059999', '00000000-0000-0000-0000-000001059100');
INSERT INTO public.dogs (id, call_name, breed, owner_id, created_by, created_from_show_id)
VALUES ('00000000-0000-0000-0000-000001059401', 'MYK9-1059 AddedAtShowA', 'Border Collie',
        '00000000-0000-0000-0000-000001059201', '00000000-0000-0000-0000-000001059999',
        '00000000-0000-0000-0000-000001059100');

-- Secretary B claims show A (not hers), then show B (hers).
SELECT pg_temp.act_as('00000000-0000-0000-0000-000001059102');
INSERT INTO public.people (id, first_name, last_name, created_from_show_id)
VALUES
  ('00000000-0000-0000-0000-000001059202', 'MYK9-1059', 'ClaimsShowA', '00000000-0000-0000-0000-000001059100'),
  ('00000000-0000-0000-0000-000001059203', 'MYK9-1059', 'ClaimsShowB', '00000000-0000-0000-0000-000001059110');

-- The exhibitor adds their own dog claiming show A, directly and via the RPC.
SELECT pg_temp.act_as('00000000-0000-0000-0000-000001059103');
INSERT INTO public.dogs (id, call_name, breed, owner_id, created_by, created_from_show_id)
VALUES ('00000000-0000-0000-0000-000001059402', 'MYK9-1059 Own', 'Border Collie',
        '00000000-0000-0000-0000-000001059003', '00000000-0000-0000-0000-000001059101',
        '00000000-0000-0000-0000-000001059100');
SELECT public.create_dog_with_registrations(
  jsonb_build_object(
    'id', '00000000-0000-0000-0000-000001059403',
    'owner_id', '00000000-0000-0000-0000-000001059003',
    'call_name', 'MYK9-1059 ViaRpc',
    'breed', 'Mixed Breed',
    'created_by', '00000000-0000-0000-0000-000001059999'),
  '[]'::jsonb);

RESET ROLE;

SELECT pg_temp.expect('people: created_by is the inserter''s auth uid, forged value ignored; managed show kept',
  (SELECT created_by::text || '|' || created_from_show_id::text FROM public.people
    WHERE id = '00000000-0000-0000-0000-000001059201'),
  '00000000-0000-0000-0000-000001059101|00000000-0000-0000-0000-000001059100');

SELECT pg_temp.expect('dogs: created_by is the inserter''s auth uid, forged value ignored; managed show kept',
  (SELECT created_by::text || '|' || created_from_show_id::text FROM public.dogs
    WHERE id = '00000000-0000-0000-0000-000001059401'),
  '00000000-0000-0000-0000-000001059101|00000000-0000-0000-0000-000001059100');

SELECT pg_temp.expect('people: a non-manager''s show claim is dropped, the row still lands',
  (SELECT created_by::text || '|' || coalesce(created_from_show_id::text, 'NULL') FROM public.people
    WHERE id = '00000000-0000-0000-0000-000001059202'),
  '00000000-0000-0000-0000-000001059102|NULL');

SELECT pg_temp.expect('people: the same secretary''s own show is kept',
  (SELECT created_from_show_id::text FROM public.people
    WHERE id = '00000000-0000-0000-0000-000001059203'),
  '00000000-0000-0000-0000-000001059110');

SELECT pg_temp.expect('dogs: an exhibitor cannot claim a show, nor forge another creator',
  (SELECT created_by::text || '|' || coalesce(created_from_show_id::text, 'NULL') FROM public.dogs
    WHERE id = '00000000-0000-0000-0000-000001059402'),
  '00000000-0000-0000-0000-000001059103|NULL');

SELECT pg_temp.expect('dogs: create_dog_with_registrations (SECURITY DEFINER) stamps the caller''s auth uid',
  (SELECT created_by::text FROM public.dogs WHERE id = '00000000-0000-0000-0000-000001059403'),
  '00000000-0000-0000-0000-000001059103');

-- ---------------------------------------------------------------------------
-- 3. Updates. Each also changes an ordinary column: proof RLS admitted it.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('00000000-0000-0000-0000-000001059103');

-- Own person row: created_by NULL, no show.
UPDATE public.people
   SET phone = '555-1059', created_by = '00000000-0000-0000-0000-000001059999',
       created_from_show_id = '00000000-0000-0000-0000-000001059100'
 WHERE id = '00000000-0000-0000-0000-000001059003';

-- Own dog stamped by the exhibitor.
UPDATE public.dogs
   SET color = 'Blue', created_by = '00000000-0000-0000-0000-000001059999',
       created_from_show_id = '00000000-0000-0000-0000-000001059100'
 WHERE id = '00000000-0000-0000-0000-000001059402';

-- Own dog seeded with show A: try to move it to show B.
UPDATE public.dogs
   SET color = 'Red', created_from_show_id = '00000000-0000-0000-0000-000001059110'
 WHERE id = '00000000-0000-0000-0000-000001059400';
RESET ROLE;

SELECT pg_temp.expect('people UPDATE: created_by and created_from_show_id unchanged, phone changed',
  (SELECT phone || '|' || coalesce(created_by::text, 'NULL') || '|' || coalesce(created_from_show_id::text, 'NULL')
     FROM public.people WHERE id = '00000000-0000-0000-0000-000001059003'),
  '555-1059|NULL|NULL');

SELECT pg_temp.expect('dogs UPDATE: created_by and created_from_show_id unchanged, color changed',
  (SELECT color || '|' || created_by::text || '|' || coalesce(created_from_show_id::text, 'NULL')
     FROM public.dogs WHERE id = '00000000-0000-0000-0000-000001059402'),
  'Blue|00000000-0000-0000-0000-000001059103|NULL');

SELECT pg_temp.expect('dogs UPDATE: created_from_show_id cannot be moved to another show',
  (SELECT color || '|' || created_from_show_id::text || '|' || created_by::text
     FROM public.dogs WHERE id = '00000000-0000-0000-0000-000001059400'),
  'Red|00000000-0000-0000-0000-000001059100|00000000-0000-0000-0000-000001059999');

SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('00000000-0000-0000-0000-000001059103');
UPDATE public.dogs SET created_from_show_id = NULL
 WHERE id = '00000000-0000-0000-0000-000001059400';
RESET ROLE;

SELECT pg_temp.expect('dogs UPDATE: created_from_show_id may be cleared',
  (SELECT coalesce(created_from_show_id::text, 'NULL') FROM public.dogs
    WHERE id = '00000000-0000-0000-0000-000001059400'),
  'NULL');

-- ---------------------------------------------------------------------------
-- 4. A session with no auth.uid() keeps supplied values.
-- ---------------------------------------------------------------------------
SELECT pg_temp.no_jwt();
INSERT INTO public.people (id, first_name, last_name, created_by, created_from_show_id)
VALUES ('00000000-0000-0000-0000-000001059204', 'MYK9-1059', 'ServicePath',
        '00000000-0000-0000-0000-000001059999', '00000000-0000-0000-0000-000001059110');

SELECT pg_temp.expect('no-JWT session: supplied created_by and created_from_show_id kept',
  (SELECT created_by::text || '|' || created_from_show_id::text FROM public.people
    WHERE id = '00000000-0000-0000-0000-000001059204'),
  '00000000-0000-0000-0000-000001059999|00000000-0000-0000-0000-000001059110');

-- ---------------------------------------------------------------------------
-- 5. Deleting a show clears the link, even with a JWT in effect (the guard is
--    active for this session, so this exercises its NULL pass-through).
-- ---------------------------------------------------------------------------
SELECT pg_temp.act_as('00000000-0000-0000-0000-000001059102');
DELETE FROM public.shows WHERE id = '00000000-0000-0000-0000-000001059110';
SELECT pg_temp.no_jwt();

SELECT pg_temp.expect('show delete: every created_from_show_id pointing at it is cleared',
  (SELECT count(*)::text FROM public.people
    WHERE id IN ('00000000-0000-0000-0000-000001059203', '00000000-0000-0000-0000-000001059204')
      AND created_from_show_id IS NULL),
  '2');

SELECT pg_temp.expect('show delete: created_by is untouched',
  (SELECT created_by::text FROM public.people WHERE id = '00000000-0000-0000-0000-000001059203'),
  '00000000-0000-0000-0000-000001059102');

-- ---------------------------------------------------------------------------
-- 6. ACLs and catalog shape.
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect('anon holds no SELECT/INSERT/UPDATE on either new column of either table',
  (SELECT bool_or(has_column_privilege('anon', t.tbl, c.col, p.priv))::text
     FROM (VALUES ('public.dogs'), ('public.people')) AS t(tbl)
    CROSS JOIN (VALUES ('created_by'), ('created_from_show_id')) AS c(col)
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE')) AS p(priv)),
  'false');

SELECT pg_temp.expect('authenticated reads both columns through its table-level grant (RLS scopes rows)',
  (SELECT bool_and(has_column_privilege('authenticated', t.tbl, c.col, 'SELECT'))::text
     FROM (VALUES ('public.dogs'), ('public.people')) AS t(tbl)
    CROSS JOIN (VALUES ('created_by'), ('created_from_show_id')) AS c(col)),
  'true');

SET LOCAL ROLE anon;
SELECT pg_temp.expect('anon cannot select created_by from dogs',
  pg_temp.sqlstate_of('SELECT created_by FROM public.dogs LIMIT 1'), '42501');
SELECT pg_temp.expect('anon cannot select created_from_show_id from people',
  pg_temp.sqlstate_of('SELECT created_from_show_id FROM public.people LIMIT 1'), '42501');
SELECT pg_temp.expect('anon cannot insert a person',
  pg_temp.sqlstate_of($q$INSERT INTO public.people (first_name, last_name, created_from_show_id)
    VALUES ('MYK9-1059', 'Anon', '00000000-0000-0000-0000-000001059100')$q$), '42501');
RESET ROLE;

SELECT pg_temp.expect('the guard function is executable by no API role',
  (SELECT (has_function_privilege('anon', p.oid, 'EXECUTE')
           OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))::text
     FROM pg_proc p WHERE p.oid = 'private.guard_creation_attribution()'::regprocedure),
  'false');

SELECT pg_temp.expect('both created_from_show_id FKs reference shows ON DELETE SET NULL',
  (SELECT string_agg(conrelid::regclass::text || ':' || confrelid::regclass::text || ':' || confdeltype::text, ','
                     ORDER BY conrelid::regclass::text)
     FROM pg_constraint
    WHERE conname IN ('dogs_created_from_show_id_fkey', 'people_created_from_show_id_fkey')),
  'dogs:shows:n,people:shows:n');

SELECT pg_temp.expect('both partial indexes on created_from_show_id exist',
  (SELECT count(*)::text FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN ('dogs_created_from_show_id_idx', 'people_created_from_show_id_idx')
      AND indexdef ILIKE '%WHERE (created_from_show_id IS NOT NULL)%'),
  '2');

ROLLBACK;
