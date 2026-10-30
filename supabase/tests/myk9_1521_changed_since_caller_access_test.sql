-- MYK9-1521 (migration 20261031014300): entry_results_changed_since reports
-- caller_has_access so a replica can drop a show the caller was revoked from on
-- the next sync.
--
-- Properties asserted:
--   1. caller_has_access is TRUE for a club secretary (access by role, with or
--      without a recent change) and for a show steward;
--   2. it is FALSE for a signed-in caller with no access to the show (another
--      club's secretary), and for the secretary right after the club role is
--      deactivated (revoked to zero, own entries none), where changed is TRUE;
--   3. unknown never purges: a NULL show, a NULL since, an unknown show and a
--      missing auth.uid() all read TRUE;
--   4. the function stays closed to anon and PUBLIC and open to authenticated.
--
-- All fixtures roll back. Run with psql -X -v ON_ERROR_STOP=1 after migrations.
-- Fixtures: ids 1521xx, auth uids 1521 7xx.

BEGIN;

INSERT INTO public.roles (id, name, description, is_system)
VALUES
  ('00000000-0000-0000-0000-000000152102', 'secretary', 'MYK9-1521 fixture', true),
  ('00000000-0000-0000-0000-000000152105', 'steward', 'MYK9-1521 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000152101', 'MYK9-1521 Club'),
       ('00000000-0000-0000-0000-000000152103', 'MYK9-1521 Other Club');

INSERT INTO public.people (id, auth_user_id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000152114', NULL, 'Secretary', 'S', 'myk91521-s@example.test'),
  ('00000000-0000-0000-0000-000000152116', NULL, 'Steward', 'ST', 'myk91521-st@example.test'),
  ('00000000-0000-0000-0000-000000152118', NULL, 'OtherSec', 'OS', 'myk91521-os@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT u.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       u.email, '', now(), now(), now(), '{}', '{}', false, false, false
FROM (VALUES
  ('00000000-0000-0000-0000-000000152714', 'myk91521-s@example.test'),
  ('00000000-0000-0000-0000-000000152716', 'myk91521-st@example.test'),
  ('00000000-0000-0000-0000-000000152718', 'myk91521-os@example.test')
) AS u(id, email);

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES ('00000000-0000-0000-0000-000000152120', 'MYK9-1521 Show', 'AKC',
        current_date, current_date + 1, '00000000-0000-0000-0000-000000152101', 'published');

INSERT INTO public.user_roles (user_id, role_id, club_id, show_id, is_active, auth_user_id)
SELECT g.person_id::uuid, r.id, g.club_id::uuid, g.show_id::uuid, true, g.auth_id::uuid
FROM (VALUES
  ('00000000-0000-0000-0000-000000152114', '00000000-0000-0000-0000-000000152714', 'secretary',
   '00000000-0000-0000-0000-000000152101', NULL),
  ('00000000-0000-0000-0000-000000152118', '00000000-0000-0000-0000-000000152718', 'secretary',
   '00000000-0000-0000-0000-000000152103', NULL),
  ('00000000-0000-0000-0000-000000152116', '00000000-0000-0000-0000-000000152716', 'steward',
   NULL, '00000000-0000-0000-0000-000000152120')
) AS g(person_id, auth_id, role_name, club_id, show_id)
JOIN public.roles r ON r.name = g.role_name;

CREATE FUNCTION pg_temp.act_as(p_auth uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', p_auth, 'role', 'authenticated', 'app_metadata', '{}'::jsonb)::text, true);
END;
$$;

-- caller_has_access for one caller, called exactly as the client does.
CREATE FUNCTION pg_temp.access_of(p_auth uuid, p_show uuid, p_since timestamptz)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  v boolean;
BEGIN
  PERFORM pg_temp.act_as(p_auth);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT q.caller_has_access INTO v FROM public.entry_results_changed_since(p_show, p_since) q;
  EXECUTE 'RESET ROLE';
  RETURN v;
END;
$$;

DO $$
DECLARE
  show_id constant uuid := '00000000-0000-0000-0000-000000152120';
  since constant timestamptz := '2001-01-01';
  r record;
BEGIN
  IF has_function_privilege('anon', 'public.entry_results_changed_since(uuid, timestamptz)', 'EXECUTE')
     OR has_function_privilege('public', 'public.entry_results_changed_since(uuid, timestamptz)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.entry_results_changed_since(uuid, timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 4 changed_since ACL: anon/PUBLIC must not execute, authenticated must';
  END IF;

  -- 1. access by role
  IF pg_temp.access_of('00000000-0000-0000-0000-000000152714', show_id, since) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 1 club secretary must have access';
  END IF;
  IF pg_temp.access_of('00000000-0000-0000-0000-000000152716', show_id, since) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 1 show steward must have access';
  END IF;

  -- 2. no access: another club's secretary
  IF pg_temp.access_of('00000000-0000-0000-0000-000000152718', show_id, since) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL 2 an unrelated signed-in caller must read FALSE';
  END IF;

  -- 3. unknown never purges
  IF pg_temp.access_of('00000000-0000-0000-0000-000000152718', NULL, since) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 3 a NULL show must read TRUE';
  END IF;
  IF pg_temp.access_of('00000000-0000-0000-0000-000000152718', show_id, NULL) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 3 a NULL since must read TRUE';
  END IF;
  IF pg_temp.access_of('00000000-0000-0000-0000-000000152718',
                       '00000000-0000-0000-0000-000000152999', since) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 3 an unknown show must read TRUE';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT * INTO r FROM public.entry_results_changed_since(show_id, since);
  IF r.caller_has_access IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 3 no auth.uid() must read TRUE, got %', r.caller_has_access;
  END IF;

  -- 2 (revoke). The secretary's club role is deactivated; no own entries.
  UPDATE public.user_roles SET is_active = false
  WHERE user_id = '00000000-0000-0000-0000-000000152114'
    AND club_id = '00000000-0000-0000-0000-000000152101';
  IF pg_temp.access_of('00000000-0000-0000-0000-000000152714', show_id, since) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL 2 a revoked secretary with no own entries must read FALSE';
  END IF;
  PERFORM pg_temp.act_as('00000000-0000-0000-0000-000000152714');
  SELECT * INTO r FROM public.entry_results_changed_since(show_id, since);
  IF r.changed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL 2 a revoked caller must still read changed = TRUE';
  END IF;

  RAISE NOTICE 'PASS 1-4 caller_has_access: TRUE per role arm, FALSE for outsider and revoked secretary, TRUE on doubt, ACL closed';
END;
$$;

ROLLBACK;
