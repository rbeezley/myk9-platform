-- MYK9-146 behavioral contract: judge fees and internal notes are not direct
-- anon/authenticated reads, while the office-manager RPC can return them for a
-- show the caller manages. Public assignment/people panel fields still query.
-- All fixtures roll back.

BEGIN;

INSERT INTO public.roles (name, description, is_system)
VALUES
  ('secretary', 'MYK9-146 fixture', true),
  ('member', 'MYK9-146 fixture', false)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000146001', 'MYK9-146 Club');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000146011', 'MYK9-146', 'Manager', 'myk9-146-manager@example.test', NULL),
  ('00000000-0000-0000-0000-000000146012', 'MYK9-146', 'Ordinary', 'myk9-146-ordinary@example.test', NULL),
  ('00000000-0000-0000-0000-000000146013', 'MYK9-146', 'Judge', 'myk9-146-judge@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000146101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-146-manager@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000146102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-146-ordinary@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

UPDATE public.people AS person
SET auth_user_id = fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000146011'::uuid, '00000000-0000-0000-0000-000000146101'::uuid),
  ('00000000-0000-0000-0000-000000146012'::uuid, '00000000-0000-0000-0000-000000146102'::uuid)
) AS fixture(person_id, auth_id)
WHERE person.id = fixture.person_id;

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES (
  '00000000-0000-0000-0000-000000146002', 'MYK9-146 Show', 'AKC',
  current_date, current_date, '00000000-0000-0000-0000-000000146001', 'published'
);

INSERT INTO public.user_roles (user_id, role_id, club_id, show_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000000146011', roles.id,
  '00000000-0000-0000-0000-000000146001',
  '00000000-0000-0000-0000-000000146002', true,
  '00000000-0000-0000-0000-000000146101'
FROM public.roles
WHERE roles.name = 'secretary';

SET LOCAL ROLE service_role;
INSERT INTO public.judge_assignments (
  id, person_id, show_id, status, fee, notes
)
VALUES (
  '00000000-0000-0000-0000-000000146003',
  '00000000-0000-0000-0000-000000146013',
  '00000000-0000-0000-0000-000000146002',
  'confirmed', 275.00, 'internal contract note'
);
RESET ROLE;

DO $$
DECLARE
  manager uuid := '00000000-0000-0000-0000-000000146101';
  ordinary uuid := '00000000-0000-0000-0000-000000146102';
  fee numeric;
  note text;
  public_rows integer;
BEGIN
  IF has_table_privilege('anon', 'public.judge_assignments', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL anon retained table-wide judge_assignments SELECT';
  END IF;
  IF has_table_privilege('authenticated', 'public.judge_assignments', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL authenticated retained table-wide judge_assignments SELECT';
  END IF;
  IF has_column_privilege('anon', 'public.judge_assignments', 'id', 'SELECT') IS DISTINCT FROM true
     OR has_column_privilege('anon', 'public.judge_assignments', 'person_id', 'SELECT') IS DISTINCT FROM true
     OR has_column_privilege('anon', 'public.judge_assignments', 'fee', 'SELECT') IS DISTINCT FROM false
     OR has_column_privilege('anon', 'public.judge_assignments', 'notes', 'SELECT') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL anon judge assignment column ACL does not match the public shape';
  END IF;
  IF has_column_privilege('authenticated', 'public.judge_assignments', 'fee', 'SELECT') IS DISTINCT FROM false
     OR has_column_privilege('authenticated', 'public.judge_assignments', 'notes', 'SELECT') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FAIL authenticated judge assignment private columns remain granted';
  END IF;
  IF has_function_privilege('anon', 'public.get_manager_judge_assignments()', 'execute') THEN
    RAISE EXCEPTION 'FAIL anon can execute manager judge assignment RPC';
  END IF;

  SET LOCAL ROLE anon;
  SELECT count(*) INTO public_rows
  FROM public.judge_assignments AS ja
  LEFT JOIN public.people AS p ON p.id = ja.person_id;
  -- The row may be filtered by the public people policy; the important contract
  -- is that the public panel relation resolves without a column-privilege error.
  IF public_rows < 0 THEN RAISE EXCEPTION 'unreachable'; END IF;

  BEGIN
    SELECT ja.fee INTO fee FROM public.judge_assignments AS ja;
    RAISE EXCEPTION 'FAIL anon selected judge fee directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', ordinary::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', ordinary, 'role', 'authenticated')::text, true);

  BEGIN
    SELECT ja.notes INTO note FROM public.judge_assignments AS ja;
    RAISE EXCEPTION 'FAIL ordinary authenticated user selected judge notes directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  IF (SELECT count(*) FROM public.get_manager_judge_assignments()) <> 0 THEN
    RAISE EXCEPTION 'FAIL ordinary authenticated user received manager assignment rows';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', manager::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', manager, 'role', 'authenticated')::text, true);
  SELECT m.fee, m.notes INTO fee, note
  FROM public.get_manager_judge_assignments() AS m;
  IF fee IS DISTINCT FROM 275.00 OR note IS DISTINCT FROM 'internal contract note' THEN
    RAISE EXCEPTION 'FAIL manager RPC did not return the protected assignment fields';
  END IF;

  RAISE NOTICE 'PASS MYK9-146 public column ACL, ordinary denial, and manager RPC positive';
END;
$$;

ROLLBACK;
