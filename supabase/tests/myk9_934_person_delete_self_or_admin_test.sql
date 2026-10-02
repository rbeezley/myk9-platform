-- MYK9-934 (migration 20261002143717): only a site admin or the person themself
-- may delete a person. soft_delete_person and delete_preview('person') used to
-- admit anyone managing a show the person has a live entry in
-- (can_manage_show_person); that arm is gone.
--
-- Properties asserted here:
--   * POSITIVE CONTROL: can_manage_show_person(P) is TRUE for the secretary and
--     the club admin, so the refusals below are the removed arm's doing and not
--     a fixture that never reached it;
--   * a secretary and a club admin of the show's club get 42501 from both
--     soft_delete_person and delete_preview('person'), and the row stays live;
--   * the person themself (people.id is NOT their auth uid) and a site admin
--     are not refused by either, and the delete stamps the row;
--   * P0002 still comes first for a missing person, MK001 still refuses a
--     person who owns a live dog, and anon / PUBLIC still cannot execute either.
--
-- All fixtures roll back. Run with psql -X -v ON_ERROR_STOP=1 after migrations.

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures. People first, then auth.users; handle_new_user() adopts each row.
--   934101 secretary (club 934021)    934102 club admin (club 934021)
--   934103 site admin                 934104 P1, handler in the show (self-deletes)
--   934105 P2, handler in the show    934106 dog owner (owns the entered dog)
-- people.id (9340xx) and auth uid (9341xx) are deliberately different.
-- ---------------------------------------------------------------------------
INSERT INTO public.people (id, auth_user_id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000934011', NULL, 'MYK9-934', 'Secretary', 'myk9934-sec@example.test'),
  ('00000000-0000-0000-0000-000000934012', NULL, 'MYK9-934', 'ClubAdmin', 'myk9934-cla@example.test'),
  ('00000000-0000-0000-0000-000000934013', NULL, 'MYK9-934', 'SiteAdmin', 'myk9934-adm@example.test'),
  ('00000000-0000-0000-0000-000000934014', NULL, 'MYK9-934', 'HandlerOne', 'myk9934-p1@example.test'),
  ('00000000-0000-0000-0000-000000934015', NULL, 'MYK9-934', 'HandlerTwo', 'myk9934-p2@example.test'),
  ('00000000-0000-0000-0000-000000934016', NULL, 'MYK9-934', 'Owner', 'myk9934-own@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000934101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9934-sec@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000934102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9934-cla@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000934103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9934-adm@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000934104', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9934-p1@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000934105', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9934-p2@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000934106', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9934-own@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

INSERT INTO public.clubs (id, name, authorized_at)
VALUES ('00000000-0000-0000-0000-000000934021', 'MYK9-934 Club', now());

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000934011', r.id, '00000000-0000-0000-0000-000000934021', true,
       '00000000-0000-0000-0000-000000934101'
FROM public.roles r WHERE r.name = 'secretary';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000934012', r.id, '00000000-0000-0000-0000-000000934021', true,
       '00000000-0000-0000-0000-000000934102'
FROM public.roles r WHERE r.name = 'club_admin';

INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000934013', r.id, true, '00000000-0000-0000-0000-000000934103'
FROM public.roles r WHERE r.name = 'site_admin';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.people
      WHERE id::text LIKE '00000000-0000-0000-0000-0000009340%'
        AND auth_user_id IS NOT NULL) <> 6 THEN
    RAISE EXCEPTION 'FIXTURE handle_new_user() did not adopt all six people rows';
  END IF;
  IF (SELECT count(*) FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
      WHERE ur.auth_user_id IN ('00000000-0000-0000-0000-000000934101',
                                '00000000-0000-0000-0000-000000934102',
                                '00000000-0000-0000-0000-000000934103')
        AND r.name IN ('secretary', 'club_admin', 'site_admin') AND ur.is_active) <> 3 THEN
    RAISE EXCEPTION 'FIXTURE the secretary, club_admin or site_admin role row was not created';
  END IF;
END;
$$;

-- One show in the club. P1 and P2 each handle the owner's dog in one entry, so
-- the secretary and the club admin manage a show both people are entered in.
INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
VALUES ('00000000-0000-0000-0000-000000934031', 'MYK9-934 Show', 'AKC', current_date, current_date, 'draft',
        '00000000-0000-0000-0000-000000934021');

INSERT INTO public.trials (id, show_id, name, date)
VALUES ('00000000-0000-0000-0000-000000934041', '00000000-0000-0000-0000-000000934031', 'MYK9-934 Trial', current_date);

INSERT INTO public.classes (id, trial_id, name)
VALUES ('00000000-0000-0000-0000-000000934051', '00000000-0000-0000-0000-000000934041', 'MYK9-934 Class');

INSERT INTO public.dogs (id, call_name, breed, owner_id)
VALUES ('00000000-0000-0000-0000-000000934061', 'MYK9-934 Dog', 'Border Collie',
        '00000000-0000-0000-0000-000000934016');

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, registered_name)
VALUES ('00000000-0000-0000-0000-000000934061', 'AKC', 'SW993401', 'MYK9-934 Dog');

INSERT INTO public.entries (id, class_id, trial_id, show_id, dog_id, handler_id, payment_status, is_scored, result_status)
VALUES
  ('00000000-0000-0000-0000-000000934081', '00000000-0000-0000-0000-000000934051', '00000000-0000-0000-0000-000000934041',
   '00000000-0000-0000-0000-000000934031', '00000000-0000-0000-0000-000000934061',
   '00000000-0000-0000-0000-000000934014', 'pending', false, 'pending'),
  ('00000000-0000-0000-0000-000000934082', '00000000-0000-0000-0000-000000934051', '00000000-0000-0000-0000-000000934041',
   '00000000-0000-0000-0000-000000934031', '00000000-0000-0000-0000-000000934061',
   '00000000-0000-0000-0000-000000934015', 'pending', false, 'pending');

-- Runs p_sql as the CURRENT role and requires exactly p_state ('ok' = no error).
CREATE FUNCTION pg_temp.expect_sqlstate(p_sql text, p_state text, p_label text)
RETURNS void
LANGUAGE plpgsql
AS $f$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> p_state THEN
      RAISE EXCEPTION 'FAIL %: SQLSTATE % (%), expected %', p_label, SQLSTATE, SQLERRM, p_state;
    END IF;
    IF p_state = '42501' AND SQLERRM ~* 'not found' THEN
      RAISE EXCEPTION 'FAIL %: a permission refusal says "not found" (%)', p_label, SQLERRM;
    END IF;
    RAISE NOTICE 'PASS % (%)', p_label, p_state;
    RETURN;
  END;
  IF p_state <> 'ok' THEN
    RAISE EXCEPTION 'FAIL %: succeeded, expected SQLSTATE %', p_label, p_state;
  END IF;
  RAISE NOTICE 'PASS % (ok)', p_label;
END;
$f$;

CREATE FUNCTION pg_temp.act_as(p_sub text)
RETURNS void
LANGUAGE plpgsql
AS $f$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_sub, true);
  PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', p_sub), true);
END;
$f$;

-- ---------------------------------------------------------------------------
-- 1. Grants unchanged: anon and PUBLIC cannot execute either; authenticated can.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['public.soft_delete_person(uuid)', 'public.delete_preview(text, uuid)'] LOOP
    IF has_function_privilege('anon', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL anon can execute %', fn;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
      WHERE p.oid = fn::regprocedure AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'FAIL PUBLIC can execute %', fn;
    END IF;
    IF NOT has_function_privilege('authenticated', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL authenticated cannot execute %', fn;
    END IF;
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = fn::regprocedure) THEN
      RAISE EXCEPTION 'FAIL % is no longer SECURITY DEFINER', fn;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS both functions stay SECURITY DEFINER and executable by authenticated only';
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Show staff: positive control, then 42501 from the delete and the preview.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_sub text;
  v_person text;
BEGIN
  FOREACH v_sub IN ARRAY ARRAY['00000000-0000-0000-0000-000000934101', '00000000-0000-0000-0000-000000934102'] LOOP
    PERFORM pg_temp.act_as(v_sub);
    FOREACH v_person IN ARRAY ARRAY['00000000-0000-0000-0000-000000934014', '00000000-0000-0000-0000-000000934015'] LOOP
      IF NOT public.can_manage_show_person(v_person::uuid) THEN
        RAISE EXCEPTION 'FIXTURE caller % does not manage a show person % is entered in', right(v_sub, 6), right(v_person, 6);
      END IF;
      PERFORM pg_temp.expect_sqlstate(format('SELECT public.delete_preview(%L, %L)', 'person', v_person),
        '42501', format('show staff %s: delete_preview(person %s) is refused', right(v_sub, 6), right(v_person, 6)));
      PERFORM pg_temp.expect_sqlstate(format('SELECT count(*) FROM public.soft_delete_person(%L)', v_person),
        '42501', format('show staff %s: soft_delete_person(%s) is refused', right(v_sub, 6), right(v_person, 6)));
    END LOOP;
    -- P0002 is still checked first, for show staff too.
    PERFORM pg_temp.expect_sqlstate(
      format('SELECT count(*) FROM public.soft_delete_person(%L)', '00000000-0000-0000-0000-0000009340ff'),
      'P0002', format('show staff %s: a missing person is P0002', right(v_sub, 6)));
  END LOOP;
END;
$$;

RESET ROLE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.people
    WHERE id IN ('00000000-0000-0000-0000-000000934014', '00000000-0000-0000-0000-000000934015')
      AND deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'FAIL a refused show-staff delete still tombstoned a person';
  END IF;
  RAISE NOTICE 'PASS both people are still live after every show-staff refusal';
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Self: P1 previews and deletes their own account (people.id <> auth uid).
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000934104');
SELECT pg_temp.expect_sqlstate(
  $q$SELECT public.delete_preview('person', '00000000-0000-0000-0000-000000934014')$q$,
  'ok', 'self: delete_preview(person) is not refused');
-- Self cannot reach someone else: P1 on P2.
SELECT pg_temp.expect_sqlstate(
  $q$SELECT count(*) FROM public.soft_delete_person('00000000-0000-0000-0000-000000934015')$q$,
  '42501', 'self: P1 deleting P2 is refused');
SELECT pg_temp.expect_sqlstate(
  $q$SELECT count(*) FROM public.soft_delete_person('00000000-0000-0000-0000-000000934014')$q$,
  'ok', 'self: soft_delete_person on their own account is not refused');
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.people
    WHERE id = '00000000-0000-0000-0000-000000934014'
      AND deleted_at IS NOT NULL
      AND deleted_by = '00000000-0000-0000-0000-000000934104'
  ) THEN
    RAISE EXCEPTION 'FAIL the self delete did not stamp deleted_at / deleted_by (auth uid)';
  END IF;
  RAISE NOTICE 'PASS the self delete stamps the row with the caller''s auth uid';
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Site admin: P2 (not themself) previews and deletes; MK001 still refuses a
--    person who owns a live dog.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000934103');
SELECT pg_temp.expect_sqlstate(
  $q$SELECT public.delete_preview('person', '00000000-0000-0000-0000-000000934015')$q$,
  'ok', 'site admin: delete_preview(person) is not refused');
SELECT pg_temp.expect_sqlstate(
  $q$SELECT count(*) FROM public.soft_delete_person('00000000-0000-0000-0000-000000934015')$q$,
  'ok', 'site admin: soft_delete_person is not refused');
SELECT pg_temp.expect_sqlstate(
  $q$SELECT count(*) FROM public.soft_delete_person('00000000-0000-0000-0000-000000934016')$q$,
  'MK001', 'site admin: a person who owns a live dog is still refused (MK001)');
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.people
    WHERE id = '00000000-0000-0000-0000-000000934015' AND deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'FAIL the site-admin delete did not stamp the row';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.people
    WHERE id = '00000000-0000-0000-0000-000000934016' AND deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'FAIL the dog owner was deleted despite MK001';
  END IF;
  RAISE NOTICE 'PASS the site-admin delete stamps the row and the dog owner stays live';
END;
$$;

ROLLBACK;
