-- Behavioral contract for 20260910014500: a show manager can read the roles of
-- the people they can already read, and a plain exhibitor still cannot read
-- anyone else's.
--
-- The bug this guards: `user_roles_select` allowed only your OWN rows plus site
-- admins, so the `people -> user_roles(role:roles(name))` embed came back EMPTY
-- for every other person. An empty array is indistinguishable from "holds no
-- roles", so the person page told a secretary that a judge was an unroled
-- "Member". Asserting a NON-EMPTY read is the point — a policy that returns
-- zero rows fails silently everywhere else.
--
-- All fixtures roll back.

BEGIN;

INSERT INTO public.roles (name, description, is_system)
VALUES
  ('secretary', 'MYK9 user_roles read fixture', true),
  ('judge', 'MYK9 user_roles read fixture', true),
  ('exhibitor', 'MYK9 user_roles read fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000910001', 'MYK9 user_roles read Club');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT
  fixture.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  fixture.email, '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb, false, false, false
FROM (VALUES
  ('00000000-0000-0000-0000-000000910011'::uuid, 'myk9-910-secretary@example.test'::text),
  ('00000000-0000-0000-0000-000000910012'::uuid, 'myk9-910-judge@example.test'::text),
  ('00000000-0000-0000-0000-000000910013'::uuid, 'myk9-910-exhibitor@example.test'::text)
) AS fixture(id, email);

INSERT INTO public.people (id, first_name, last_name, auth_user_id, email)
VALUES
  ('00000000-0000-0000-0000-000000910021', 'MYK9-910', 'Secretary',
   '00000000-0000-0000-0000-000000910011', 'myk9-910-secretary@example.test'),
  ('00000000-0000-0000-0000-000000910022', 'MYK9-910', 'Judge',
   '00000000-0000-0000-0000-000000910012', 'myk9-910-judge@example.test'),
  ('00000000-0000-0000-0000-000000910023', 'MYK9-910', 'Exhibitor',
   '00000000-0000-0000-0000-000000910013', 'myk9-910-exhibitor@example.test');

-- The secretary grant is club-scoped with show_id NULL, which is what
-- is_trial_secretary() (and therefore is_show_manager()) matches on.
INSERT INTO public.user_roles (auth_user_id, role_id, club_id, is_active)
SELECT '00000000-0000-0000-0000-000000910011', r.id,
       '00000000-0000-0000-0000-000000910001', true
FROM public.roles r WHERE r.name = 'secretary';

INSERT INTO public.user_roles (auth_user_id, role_id, is_active)
SELECT '00000000-0000-0000-0000-000000910012', r.id, true
FROM public.roles r WHERE r.name = 'judge';

INSERT INTO public.user_roles (auth_user_id, role_id, is_active)
SELECT '00000000-0000-0000-0000-000000910013', r.id, true
FROM public.roles r WHERE r.name = 'exhibitor';

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  secretary_uid uuid := '00000000-0000-0000-0000-000000910011';
  judge_uid     uuid := '00000000-0000-0000-0000-000000910012';
  exhibitor_uid uuid := '00000000-0000-0000-0000-000000910013';
  visible       integer;
BEGIN
  -- A secretary reads the judge's role. This is the regression: it used to be 0.
  PERFORM set_config('request.jwt.claim.sub', secretary_uid::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', secretary_uid, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO visible
  FROM public.user_roles ur
  WHERE ur.auth_user_id = judge_uid;
  IF visible = 0 THEN
    RAISE EXCEPTION 'FAIL secretary cannot read the judge role — the person page would say "Member"';
  END IF;

  -- Positive control on the same collector: the secretary still reads their own.
  SELECT count(*) INTO visible
  FROM public.user_roles ur
  WHERE ur.auth_user_id = secretary_uid;
  IF visible = 0 THEN
    RAISE EXCEPTION 'FAIL secretary cannot read their own roles';
  END IF;

  -- An exhibitor reads only themselves. `people_select` already hides other
  -- people from them; this keeps user_roles from being the looser of the two.
  PERFORM set_config('request.jwt.claim.sub', exhibitor_uid::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', exhibitor_uid, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO visible
  FROM public.user_roles ur
  WHERE ur.auth_user_id = judge_uid;
  IF visible <> 0 THEN
    RAISE EXCEPTION 'FAIL exhibitor read another person''s roles';
  END IF;

  SELECT count(*) INTO visible
  FROM public.user_roles ur
  WHERE ur.auth_user_id = exhibitor_uid;
  IF visible = 0 THEN
    RAISE EXCEPTION 'FAIL exhibitor cannot read their own roles';
  END IF;

  RAISE NOTICE 'PASS user_roles readable by show managers, still self-only for exhibitors';
END;
$$;

ROLLBACK;
