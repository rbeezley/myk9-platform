-- delete_show_managed_person.
--
-- MYK9-921 (migration 20261002014700): it stamps deleted_by with the caller's
-- auth uid (people.deleted_by references auth.users), so a caller with a person
-- row no longer dies on people_deleted_by_fkey, and the deleter can Undo it.
--
-- MYK9-934 (migration 20261002143717): site admin only. Secretaries and club
-- admins never delete a person, even one managed through a show they manage.
--
-- Cases:
--   0. positive control: the show's secretary and club admin DO manage the show,
--      and the handler IS managed through it, so the refusals below are the
--      role check's doing;
--   1. the show's secretary, the show's club admin and another club's
--      secretary are all refused (42501), and the person is untouched;
--   2. a site admin WITH a person row deletes the handler: deleted_at is set and
--      deleted_by equals her auth uid, not her people.id;
--   3. the same site admin Undoes it with restore_person inside the window;
--   4. the function's own guards still hold for the site admin: a person not
--      linked through the show is refused (42501); a person with a sign-in
--      account, a live entry or a live dog is left live (no-op);
--   5. the function keeps SECURITY DEFINER, the empty search_path, owner
--      postgres, and EXECUTE for authenticated but not anon.
--
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

-- People first, then auth.users, so handle_new_user adopts the staff rows.
--   921001 secretary of club 921010     921002 secretary of club 921011 (outsider)
--   921004 club admin of club 921010    921005 site admin
--   921003 handler with no account, managed through show 921100 (deleted entry)
--   921006 handler with no account and a LIVE entry at the show
--   921007 no account, co-owns the live dog entered at the show
--   921008 no account, not linked to the show at all
INSERT INTO public.clubs (id, name, authorized_at)
VALUES
  ('00000000-0000-0000-0000-000000921010', 'MYK9-921 Club', now()),
  ('00000000-0000-0000-0000-000000921011', 'MYK9-921 Other Club', now());

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000921001', 'MYK9-921', 'Secretary', 'myk9-921-sec@example.test'),
  ('00000000-0000-0000-0000-000000921002', 'MYK9-921', 'Outsider', 'myk9-921-out@example.test'),
  ('00000000-0000-0000-0000-000000921003', 'MYK9-921', 'Handler', NULL),
  ('00000000-0000-0000-0000-000000921004', 'MYK9-921', 'ClubAdmin', 'myk9-921-cla@example.test'),
  ('00000000-0000-0000-0000-000000921005', 'MYK9-921', 'SiteAdmin', 'myk9-921-adm@example.test'),
  ('00000000-0000-0000-0000-000000921006', 'MYK9-921', 'LiveHandler', NULL),
  ('00000000-0000-0000-0000-000000921007', 'MYK9-921', 'CoOwner', NULL),
  ('00000000-0000-0000-0000-000000921008', 'MYK9-921', 'Stranger', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT v.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email, '',
       now(), now(), now(), '{}', '{}', false, false, false
FROM (VALUES
  ('00000000-0000-0000-0000-000000921101'::uuid, 'myk9-921-sec@example.test'),
  ('00000000-0000-0000-0000-000000921102'::uuid, 'myk9-921-out@example.test'),
  ('00000000-0000-0000-0000-000000921104'::uuid, 'myk9-921-cla@example.test'),
  ('00000000-0000-0000-0000-000000921105'::uuid, 'myk9-921-adm@example.test')
) AS v(id, email);

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT v.person_id, r.id, v.club_id, true, v.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000921001'::uuid, 'secretary', '00000000-0000-0000-0000-000000921010'::uuid, '00000000-0000-0000-0000-000000921101'::uuid),
  ('00000000-0000-0000-0000-000000921002'::uuid, 'secretary', '00000000-0000-0000-0000-000000921011'::uuid, '00000000-0000-0000-0000-000000921102'::uuid),
  ('00000000-0000-0000-0000-000000921004'::uuid, 'club_admin', '00000000-0000-0000-0000-000000921010'::uuid, '00000000-0000-0000-0000-000000921104'::uuid),
  ('00000000-0000-0000-0000-000000921005'::uuid, 'site_admin', NULL::uuid, '00000000-0000-0000-0000-000000921105'::uuid)
) AS v(person_id, role_name, club_id, auth_id)
JOIN public.roles r ON r.name = v.role_name;

INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
VALUES ('00000000-0000-0000-0000-000000921100', 'MYK9-921 Show', 'AKC', current_date, current_date,
        'draft', '00000000-0000-0000-0000-000000921010');
INSERT INTO public.trials (id, show_id, name, date)
VALUES ('00000000-0000-0000-0000-000000921200', '00000000-0000-0000-0000-000000921100', 'MYK9-921 Trial', current_date);
INSERT INTO public.classes (id, trial_id, name)
VALUES
  ('00000000-0000-0000-0000-000000921300', '00000000-0000-0000-0000-000000921200', 'MYK9-921 Class'),
  ('00000000-0000-0000-0000-000000921301', '00000000-0000-0000-0000-000000921200', 'MYK9-921 Class 2');

-- The dog belongs to the secretary and is co-owned by 921007 (no account).
-- 921003 handled it in an entry since removed, so 921003 is managed through the
-- show with no live entries or dogs. 921006 handles it in a LIVE entry.
INSERT INTO public.dogs (id, call_name, breed, owner_id, co_owner_id)
VALUES ('00000000-0000-0000-0000-000000921400', 'MYK9-921 Dog', 'Border Collie',
        '00000000-0000-0000-0000-000000921001', '00000000-0000-0000-0000-000000921007');
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, registered_name)
VALUES ('00000000-0000-0000-0000-000000921400', 'AKC', 'SW921001', 'MYK9-921 Dog');
INSERT INTO public.entries (id, class_id, trial_id, show_id, dog_id, handler_id)
VALUES
  ('00000000-0000-0000-0000-000000921500', '00000000-0000-0000-0000-000000921300',
   '00000000-0000-0000-0000-000000921200', '00000000-0000-0000-0000-000000921100',
   '00000000-0000-0000-0000-000000921400', '00000000-0000-0000-0000-000000921003'),
  ('00000000-0000-0000-0000-000000921501', '00000000-0000-0000-0000-000000921301',
   '00000000-0000-0000-0000-000000921200', '00000000-0000-0000-0000-000000921100',
   '00000000-0000-0000-0000-000000921400', '00000000-0000-0000-0000-000000921006');
UPDATE public.entries SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000921500';

DO $$
DECLARE
  v_person uuid;
BEGIN
  IF (SELECT count(*) FROM public.people
      WHERE id IN ('00000000-0000-0000-0000-000000921001', '00000000-0000-0000-0000-000000921002',
                   '00000000-0000-0000-0000-000000921004', '00000000-0000-0000-0000-000000921005')
        AND auth_user_id IS NOT NULL) <> 4 THEN
    RAISE EXCEPTION 'FIXTURE handle_new_user did not give all four staff a person row';
  END IF;
  FOREACH v_person IN ARRAY ARRAY[
    '00000000-0000-0000-0000-000000921001', '00000000-0000-0000-0000-000000921003',
    '00000000-0000-0000-0000-000000921006', '00000000-0000-0000-0000-000000921007'
  ]::uuid[] LOOP
    IF NOT public.can_manage_show_person_for_show('00000000-0000-0000-0000-000000921100', v_person) THEN
      RAISE EXCEPTION 'FIXTURE person % is not managed through the show', v_person;
    END IF;
  END LOOP;
  IF public.can_manage_show_person_for_show('00000000-0000-0000-0000-000000921100',
                                            '00000000-0000-0000-0000-000000921008') THEN
    RAISE EXCEPTION 'FIXTURE the stranger is linked to the show';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 0. Positive control: the show's secretary and club admin manage the show.
-- 1. They, and another club's secretary, are refused with 42501.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_sub text;
BEGIN
  FOREACH v_sub IN ARRAY ARRAY['00000000-0000-0000-0000-000000921101', '00000000-0000-0000-0000-000000921104'] LOOP
    PERFORM pg_temp.act_as(v_sub);
    IF NOT public.can_manage_show('00000000-0000-0000-0000-000000921100') THEN
      RAISE EXCEPTION 'FIXTURE caller % does not manage the show', right(v_sub, 6);
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS the show''s secretary and club admin both manage the show (positive control)';

  FOREACH v_sub IN ARRAY ARRAY[
    '00000000-0000-0000-0000-000000921101',  -- the show's secretary
    '00000000-0000-0000-0000-000000921104',  -- the show's club admin
    '00000000-0000-0000-0000-000000921102'   -- another club's secretary
  ] LOOP
    PERFORM pg_temp.act_as(v_sub);
    PERFORM pg_temp.expect(
      format('caller %s is refused by delete_show_managed_person', right(v_sub, 6)),
      pg_temp.sqlstate_of($q$SELECT public.delete_show_managed_person(
        '00000000-0000-0000-0000-000000921100', '00000000-0000-0000-0000-000000921003')$q$),
      '42501');
  END LOOP;
END;
$$;
RESET ROLE;

SELECT pg_temp.expect('every refused delete left the person live',
  (SELECT (deleted_at IS NULL AND deleted_by IS NULL)::text FROM public.people
    WHERE id = '00000000-0000-0000-0000-000000921003'),
  'true');

-- ---------------------------------------------------------------------------
-- 2. The site admin (who has a person row) deletes the handler.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000921105');

SELECT public.delete_show_managed_person('00000000-0000-0000-0000-000000921100',
                                         '00000000-0000-0000-0000-000000921003');
RESET ROLE;

SELECT pg_temp.expect('deleted_by is the site admin''s auth uid, not her people.id',
  (SELECT (deleted_at IS NOT NULL)::text || '|' || deleted_by::text FROM public.people
    WHERE id = '00000000-0000-0000-0000-000000921003'),
  'true|00000000-0000-0000-0000-000000921105');

-- ---------------------------------------------------------------------------
-- 3. The deleter Undoes it.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT public.restore_person('00000000-0000-0000-0000-000000921003');
RESET ROLE;

SELECT pg_temp.expect('the deleter restores the person inside the Undo window',
  (SELECT (deleted_at IS NULL AND deleted_by IS NULL)::text FROM public.people
    WHERE id = '00000000-0000-0000-0000-000000921003'),
  'true');

-- ---------------------------------------------------------------------------
-- 4. The function's own guards still hold for the site admin.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000921105');

SELECT pg_temp.expect('site admin: a person not linked through the show is refused',
  pg_temp.sqlstate_of($q$SELECT public.delete_show_managed_person(
    '00000000-0000-0000-0000-000000921100', '00000000-0000-0000-0000-000000921008')$q$),
  '42501');

SELECT public.delete_show_managed_person('00000000-0000-0000-0000-000000921100', v.id)
FROM (VALUES
  ('00000000-0000-0000-0000-000000921001'::uuid),  -- has a sign-in account
  ('00000000-0000-0000-0000-000000921006'::uuid),  -- has a live entry
  ('00000000-0000-0000-0000-000000921007'::uuid)   -- co-owns a live dog
) AS v(id);
RESET ROLE;

SELECT pg_temp.expect('site admin: account holder, live handler and live co-owner all stay live',
  (SELECT count(*)::text FROM public.people
    WHERE id IN ('00000000-0000-0000-0000-000000921001', '00000000-0000-0000-0000-000000921006',
                 '00000000-0000-0000-0000-000000921007', '00000000-0000-0000-0000-000000921008')
      AND deleted_at IS NULL),
  '4');

-- ---------------------------------------------------------------------------
-- 5. Attributes and grants.
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect('delete_show_managed_person keeps definer, search_path, owner and grants',
  (SELECT p.prosecdef::text || ':' || array_to_string(p.proconfig, ';') || ':'
          || pg_get_userbyid(p.proowner) || ':'
          || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text || ':'
          || has_function_privilege('anon', p.oid, 'EXECUTE')::text
     FROM pg_proc p
    WHERE p.oid = 'public.delete_show_managed_person(uuid, uuid)'::regprocedure),
  'true:search_path="":postgres:true:false');

ROLLBACK;
