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
-- Fixture ordering is load-bearing. `on_auth_user_created` -> handle_new_user()
-- adopts an existing people row whose LOWER(email) matches and whose
-- auth_user_id IS NULL, and otherwise CREATES one. So people must be inserted
-- BEFORE auth.users, carrying the address the auth user will have; inserting
-- them afterwards collides with the trigger's row on people_auth_user_id_key.
-- The same trigger also grants each new user the global `exhibitor` role, which
-- is why no exhibitor grant is written by hand below.
--
-- All fixtures roll back.

BEGIN;

INSERT INTO public.roles (name, description, is_system)
VALUES
  ('secretary', 'MYK9-456 fixture', true),
  ('judge', 'MYK9-456 fixture', true),
  ('exhibitor', 'MYK9-456 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000456001', 'MYK9-456 Club');

-- People first, unlinked, with the emails the auth users will carry.
INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000456011', 'MYK9-456', 'Secretary',
   'myk9-456-secretary@example.test', NULL),
  ('00000000-0000-0000-0000-000000456012', 'MYK9-456', 'Judge',
   'myk9-456-judge@example.test', NULL),
  ('00000000-0000-0000-0000-000000456013', 'MYK9-456', 'Exhibitor',
   'myk9-456-exhibitor@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT
  fixture.auth_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
  'authenticated', fixture.email, '', now(), now(), now(), '{}', '{}',
  false, false, false
FROM (VALUES
  ('00000000-0000-0000-0000-000000456101'::uuid, 'myk9-456-secretary@example.test'::text),
  ('00000000-0000-0000-0000-000000456102'::uuid, 'myk9-456-judge@example.test'::text),
  ('00000000-0000-0000-0000-000000456103'::uuid, 'myk9-456-exhibitor@example.test'::text)
) AS fixture(auth_id, email);

-- Belt and braces: assert the trigger actually adopted our rows rather than
-- creating its own. If it ever stops matching on email, the roles asserted
-- below would hang off people nobody in this test references.
DO $$
DECLARE linked integer;
BEGIN
  SELECT count(*) INTO linked
  FROM public.people
  WHERE id IN (
    '00000000-0000-0000-0000-000000456011',
    '00000000-0000-0000-0000-000000456012',
    '00000000-0000-0000-0000-000000456013'
  ) AND auth_user_id IS NOT NULL;
  IF linked <> 3 THEN
    RAISE EXCEPTION 'FAIL fixture: handle_new_user did not adopt all 3 people (linked=%)', linked;
  END IF;
END;
$$;

-- The secretary grant is club-scoped with show_id NULL, which is what
-- is_trial_secretary() (and therefore is_show_manager()) matches on.
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000456011', r.id,
       '00000000-0000-0000-0000-000000456001', true,
       '00000000-0000-0000-0000-000000456101'
FROM public.roles r WHERE r.name = 'secretary';

INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000456012', r.id, true,
       '00000000-0000-0000-0000-000000456102'
FROM public.roles r WHERE r.name = 'judge';

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  secretary_uid uuid := '00000000-0000-0000-0000-000000456101';
  judge_uid     uuid := '00000000-0000-0000-0000-000000456102';
  exhibitor_uid uuid := '00000000-0000-0000-0000-000000456103';
  visible       integer;
BEGIN
  -- A secretary reads the judge's roles. This is the regression: it used to be 0.
  PERFORM set_config('request.jwt.claim.sub', secretary_uid::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', secretary_uid, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO visible
  FROM public.user_roles ur
  WHERE ur.auth_user_id = judge_uid;
  IF visible = 0 THEN
    RAISE EXCEPTION 'FAIL secretary cannot read the judge roles — the person page would say "Member"';
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
    RAISE EXCEPTION 'FAIL exhibitor read another person''s roles (visible=%)', visible;
  END IF;

  -- Positive control for the denial: the exhibitor DOES read their own, so the
  -- zero above is a policy decision and not an empty fixture.
  SELECT count(*) INTO visible
  FROM public.user_roles ur
  WHERE ur.auth_user_id = exhibitor_uid;
  IF visible = 0 THEN
    RAISE EXCEPTION 'FAIL exhibitor cannot read their own roles — the denial above proves nothing';
  END IF;

  RAISE NOTICE 'PASS user_roles readable by show managers, still self-only for exhibitors';
END;
$$;

ROLLBACK;
