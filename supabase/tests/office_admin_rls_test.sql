-- MYK9-147 behavioral contract: steward-only accounts cannot perform office
-- mutations, while secretary, club-admin, and site-admin positives remain.
-- All fixtures roll back.

BEGIN;

INSERT INTO public.roles (name, description, is_system)
VALUES
  ('steward', 'MYK9-147 fixture', true),
  ('secretary', 'MYK9-147 fixture', true),
  ('club_admin', 'MYK9-147 fixture', true),
  ('site_admin', 'MYK9-147 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000147001', 'MYK9-147 Club');

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000147011', 'MYK9-147', 'Steward', NULL),
  ('00000000-0000-0000-0000-000000147012', 'MYK9-147', 'Secretary', NULL),
  ('00000000-0000-0000-0000-000000147013', 'MYK9-147', 'Club Admin', NULL),
  ('00000000-0000-0000-0000-000000147014', 'MYK9-147', 'Site Admin', NULL),
  ('00000000-0000-0000-0000-000000147015', 'MYK9-147', 'Handler', NULL),
  ('00000000-0000-0000-0000-000000147016', 'MYK9-147', 'Secretary Handler', NULL),
  ('00000000-0000-0000-0000-000000147017', 'MYK9-147', 'Club Admin Handler', NULL),
  ('00000000-0000-0000-0000-000000147018', 'MYK9-147', 'Site Admin Handler', NULL);

UPDATE public.people AS person
SET email = fixture.email
FROM (VALUES
  ('00000000-0000-0000-0000-000000147011'::uuid, 'myk9-147-steward@example.test'::text),
  ('00000000-0000-0000-0000-000000147012'::uuid, 'myk9-147-secretary@example.test'::text),
  ('00000000-0000-0000-0000-000000147013'::uuid, 'myk9-147-club-admin@example.test'::text),
  ('00000000-0000-0000-0000-000000147014'::uuid, 'myk9-147-site-admin@example.test'::text),
  ('00000000-0000-0000-0000-000000147015'::uuid, 'myk9-147-handler@example.test'::text)
) AS fixture(person_id, email)
WHERE person.id = fixture.person_id;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
SELECT
  fixture.auth_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
  'authenticated', fixture.email, '', now(),
  now(), now(), '{}', '{}', false, false, false
FROM (VALUES
  ('00000000-0000-0000-0000-000000147101'::uuid, 'myk9-147-steward@example.test'::text),
  ('00000000-0000-0000-0000-000000147102'::uuid, 'myk9-147-secretary@example.test'::text),
  ('00000000-0000-0000-0000-000000147103'::uuid, 'myk9-147-club-admin@example.test'::text),
  ('00000000-0000-0000-0000-000000147104'::uuid, 'myk9-147-site-admin@example.test'::text),
  ('00000000-0000-0000-0000-000000147105'::uuid, 'myk9-147-handler@example.test'::text)
) AS fixture(auth_id, email);

UPDATE public.people AS person
SET auth_user_id = fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000147011'::uuid, '00000000-0000-0000-0000-000000147101'::uuid),
  ('00000000-0000-0000-0000-000000147012'::uuid, '00000000-0000-0000-0000-000000147102'::uuid),
  ('00000000-0000-0000-0000-000000147013'::uuid, '00000000-0000-0000-0000-000000147103'::uuid),
  ('00000000-0000-0000-0000-000000147014'::uuid, '00000000-0000-0000-0000-000000147104'::uuid),
  ('00000000-0000-0000-0000-000000147015'::uuid, '00000000-0000-0000-0000-000000147105'::uuid)
) AS fixture(person_id, auth_id)
WHERE person.id = fixture.person_id;

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES (
  '00000000-0000-0000-0000-000000147002', 'MYK9-147 Show', 'AKC',
  current_date, current_date, '00000000-0000-0000-0000-000000147001', 'published'
);

INSERT INTO public.user_roles (user_id, role_id, club_id, show_id, is_active, auth_user_id)
SELECT fixture.person_id, roles.id, '00000000-0000-0000-0000-000000147001',
       '00000000-0000-0000-0000-000000147002', true, fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000147011'::uuid, '00000000-0000-0000-0000-000000147101'::uuid, 'steward'::text),
  ('00000000-0000-0000-0000-000000147012'::uuid, '00000000-0000-0000-0000-000000147102'::uuid, 'secretary'::text)
) AS fixture(person_id, auth_id, role_name)
JOIN public.roles ON roles.name = fixture.role_name;

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT fixture.person_id, roles.id, '00000000-0000-0000-0000-000000147001', true, fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000147013'::uuid, '00000000-0000-0000-0000-000000147103'::uuid, 'club_admin'::text),
  ('00000000-0000-0000-0000-000000147014'::uuid, '00000000-0000-0000-0000-000000147104'::uuid, 'site_admin'::text)
) AS fixture(person_id, auth_id, role_name)
JOIN public.roles ON roles.name = fixture.role_name;

-- Seed rows under the service role; all mutation assertions below run as a
-- real authenticated role and therefore exercise RLS, not table ownership.
SET LOCAL ROLE service_role;
INSERT INTO public.judge_assignments (id, person_id, show_id, status, fee, notes)
VALUES ('00000000-0000-0000-0000-000000147003', '00000000-0000-0000-0000-000000147015',
        '00000000-0000-0000-0000-000000147002', 'invited', 100, 'private');
INSERT INTO public.enrollments (id, confirmation_number, show_id, handler_id)
VALUES ('00000000-0000-0000-0000-000000147004', 'MYK9-147',
        '00000000-0000-0000-0000-000000147002', '00000000-0000-0000-0000-000000147015');
RESET ROLE;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  steward uuid := '00000000-0000-0000-0000-000000147101';
  secretary uuid := '00000000-0000-0000-0000-000000147102';
  club_admin uuid := '00000000-0000-0000-0000-000000147103';
  site_admin uuid := '00000000-0000-0000-0000-000000147104';
  assignment_id uuid := '00000000-0000-0000-0000-000000147003';
  enrollment_id uuid := '00000000-0000-0000-0000-000000147004';
  show_id uuid := '00000000-0000-0000-0000-000000147002';
  affected integer;
  fixture record;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', steward::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', steward, 'role', 'authenticated')::text, true);

  BEGIN
    INSERT INTO public.judge_assignments (person_id, show_id, status)
    VALUES ('00000000-0000-0000-0000-000000147015', show_id, 'invited');
    RAISE EXCEPTION 'FAIL steward inserted judge assignment';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  UPDATE public.judge_assignments SET notes = 'steward overwrite' WHERE id = assignment_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'FAIL steward updated judge assignment'; END IF;

  DELETE FROM public.judge_assignments WHERE id = assignment_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'FAIL steward deleted judge assignment'; END IF;

  BEGIN
    INSERT INTO public.enrollments (confirmation_number, show_id, handler_id)
    VALUES ('MYK9-147-STEW', show_id, '00000000-0000-0000-0000-000000147015');
    RAISE EXCEPTION 'FAIL steward inserted enrollment';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  UPDATE public.enrollments SET notes = 'steward overwrite' WHERE id = enrollment_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'FAIL steward updated enrollment'; END IF;

  FOR fixture IN
    SELECT * FROM (VALUES
      (secretary, '00000000-0000-0000-0000-000000147016'::uuid),
      (club_admin, '00000000-0000-0000-0000-000000147017'::uuid),
      (site_admin, '00000000-0000-0000-0000-000000147018'::uuid)
    ) AS positive(actor_id, handler_id)
  LOOP
    PERFORM set_config('request.jwt.claim.sub', fixture.actor_id::text, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', fixture.actor_id, 'role', 'authenticated')::text, true);
    INSERT INTO public.judge_assignments (person_id, show_id, status)
    VALUES (fixture.handler_id, show_id, 'invited');

    INSERT INTO public.enrollments (confirmation_number, show_id, handler_id)
    VALUES (format('MYK9-147-%s', replace(fixture.actor_id::text, '-', '')), show_id,
            fixture.handler_id);

    UPDATE public.enrollments
    SET notes = format('office update by %s', fixture.actor_id)
    WHERE id = enrollment_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN
      RAISE EXCEPTION 'FAIL office manager did not update enrollment';
    END IF;
  END LOOP;

  RAISE NOTICE 'PASS MYK9-147 steward office denials and secretary/club-admin/site-admin judge-write positives';
END;
$$;

ROLLBACK;
