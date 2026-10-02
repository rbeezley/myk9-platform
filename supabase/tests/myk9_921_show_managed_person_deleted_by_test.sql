-- MYK9-921 (migration 20261002014700): delete_show_managed_person stamps
-- deleted_by with the caller's auth uid (people.deleted_by references
-- auth.users), so a real secretary's delete no longer dies on
-- people_deleted_by_fkey, and the deleter can Undo it.
--
-- Cases:
--   1. a show manager WITH a person row (every real secretary; the case that
--      used to fail 23503) deletes a person managed through her show:
--      deleted_at is set and deleted_by equals her auth uid, not her people.id;
--   2. the same secretary Undoes it with restore_person inside the window;
--   3. a manager of a different club is still refused (42501), and the person
--      is untouched;
--   4. the function keeps SECURITY DEFINER, the empty search_path, owner
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

-- People first, then auth.users, so handle_new_user adopts the two staff rows.
--   921001 secretary of club 921010     921002 secretary of club 921011 (outsider)
--   921003 handler with no account, managed through show 921100
INSERT INTO public.clubs (id, name, authorized_at)
VALUES
  ('00000000-0000-0000-0000-000000921010', 'MYK9-921 Club', now()),
  ('00000000-0000-0000-0000-000000921011', 'MYK9-921 Other Club', now());

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000921001', 'MYK9-921', 'Secretary', 'myk9-921-sec@example.test'),
  ('00000000-0000-0000-0000-000000921002', 'MYK9-921', 'Outsider', 'myk9-921-out@example.test'),
  ('00000000-0000-0000-0000-000000921003', 'MYK9-921', 'Handler', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000921101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-921-sec@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000921102', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-921-out@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT v.person_id, r.id, v.club_id, true, v.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000921001'::uuid, '00000000-0000-0000-0000-000000921010'::uuid, '00000000-0000-0000-0000-000000921101'::uuid),
  ('00000000-0000-0000-0000-000000921002'::uuid, '00000000-0000-0000-0000-000000921011'::uuid, '00000000-0000-0000-0000-000000921102'::uuid)
) AS v(person_id, club_id, auth_id)
CROSS JOIN public.roles r
WHERE r.name = 'secretary';

INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
VALUES ('00000000-0000-0000-0000-000000921100', 'MYK9-921 Show', 'AKC', current_date, current_date,
        'draft', '00000000-0000-0000-0000-000000921010');
INSERT INTO public.trials (id, show_id, name, date)
VALUES ('00000000-0000-0000-0000-000000921200', '00000000-0000-0000-0000-000000921100', 'MYK9-921 Trial', current_date);
INSERT INTO public.classes (id, trial_id, name)
VALUES ('00000000-0000-0000-0000-000000921300', '00000000-0000-0000-0000-000000921200', 'MYK9-921 Class');

-- The handler handled an entry at the show that has since been removed, so
-- the person is managed through the show and has no live entries or dogs.
-- The dog belongs to the secretary.
INSERT INTO public.dogs (id, call_name, breed, owner_id)
VALUES ('00000000-0000-0000-0000-000000921400', 'MYK9-921 Dog', 'Border Collie',
        '00000000-0000-0000-0000-000000921001');
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, registered_name)
VALUES ('00000000-0000-0000-0000-000000921400', 'AKC', 'SW921001', 'MYK9-921 Dog');
INSERT INTO public.entries (id, class_id, trial_id, show_id, dog_id, handler_id)
VALUES ('00000000-0000-0000-0000-000000921500', '00000000-0000-0000-0000-000000921300',
        '00000000-0000-0000-0000-000000921200', '00000000-0000-0000-0000-000000921100',
        '00000000-0000-0000-0000-000000921400', '00000000-0000-0000-0000-000000921003');
UPDATE public.entries SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000000921500';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.people
      WHERE id IN ('00000000-0000-0000-0000-000000921001', '00000000-0000-0000-0000-000000921002')
        AND auth_user_id IS NOT NULL) <> 2 THEN
    RAISE EXCEPTION 'FIXTURE handle_new_user did not give both secretaries a person row';
  END IF;
  IF NOT public.can_manage_show_person_for_show('00000000-0000-0000-0000-000000921100',
                                                '00000000-0000-0000-0000-000000921003') THEN
    RAISE EXCEPTION 'FIXTURE the handler is not managed through the show';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. A secretary of another club is refused, and nothing changes.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000921102', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000921102","role":"authenticated"}', true);

DO $$
DECLARE
  v_state text;
BEGIN
  BEGIN
    PERFORM public.delete_show_managed_person('00000000-0000-0000-0000-000000921100',
                                              '00000000-0000-0000-0000-000000921003');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
  END;
  IF v_state IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'FAIL another club''s secretary was not refused with 42501 (got %)', v_state;
  END IF;
  RAISE NOTICE 'PASS a secretary of another club is refused (42501)';
END;
$$;
RESET ROLE;

SELECT pg_temp.expect('the refused delete left the person live',
  (SELECT (deleted_at IS NULL AND deleted_by IS NULL)::text FROM public.people
    WHERE id = '00000000-0000-0000-0000-000000921003'),
  'true');

-- ---------------------------------------------------------------------------
-- 1. The show's secretary (who has a person row) deletes the handler.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000921101', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000921101","role":"authenticated"}', true);

SELECT public.delete_show_managed_person('00000000-0000-0000-0000-000000921100',
                                         '00000000-0000-0000-0000-000000921003');
RESET ROLE;

SELECT pg_temp.expect('deleted_by is the secretary''s auth uid, not her people.id',
  (SELECT (deleted_at IS NOT NULL)::text || '|' || deleted_by::text FROM public.people
    WHERE id = '00000000-0000-0000-0000-000000921003'),
  'true|00000000-0000-0000-0000-000000921101');

-- ---------------------------------------------------------------------------
-- 2. The deleter Undoes it.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT public.restore_person('00000000-0000-0000-0000-000000921003');
RESET ROLE;

SELECT pg_temp.expect('the deleter restores the person inside the Undo window',
  (SELECT (deleted_at IS NULL AND deleted_by IS NULL)::text FROM public.people
    WHERE id = '00000000-0000-0000-0000-000000921003'),
  'true');

-- ---------------------------------------------------------------------------
-- 4. Attributes and grants.
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
