-- MYK9-1999 behavioral contract: get_show_email_content lets a show's manager read what one of
-- its emails said, refuses everyone else, and serves a lifecycle email's rendered text.
-- Fixtures roll back.

BEGIN;

INSERT INTO public.roles (name, description, is_system)
VALUES ('secretary', 'MYK9-1999 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000001999001', 'MYK9-1999 Club'),
  -- Show B has its own club, so the secretary's refusal below is not vacuous.
  ('00000000-0000-0000-0000-000001999011', 'MYK9-1999 Other Club');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000001999111', 'MYK9-1999', 'Manager', 'myk9-1999-manager@example.test', NULL),
  ('00000000-0000-0000-0000-000001999112', 'MYK9-1999', 'Other', 'myk9-1999-other@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000001999101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-1999-manager@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000001999102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-1999-other@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES
  ('00000000-0000-0000-0000-000001999002', 'MYK9-1999 Show A', 'AKC', current_date, current_date, '00000000-0000-0000-0000-000001999001', 'published'),
  ('00000000-0000-0000-0000-000001999003', 'MYK9-1999 Show B', 'AKC', current_date, current_date, '00000000-0000-0000-0000-000001999011', 'published');

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000001999111', role.id,
  '00000000-0000-0000-0000-000001999001', true,
  '00000000-0000-0000-0000-000001999101'
FROM public.roles AS role WHERE role.name = 'secretary';

SET LOCAL ROLE service_role;
INSERT INTO public.show_lifecycle_email_jobs (
  id, show_id, step_id, step_type, status, recipient_scope,
  recipient_email, recipient_name, idempotency_key, due_at,
  rendered_subject, rendered_body
)
VALUES (
  '00000000-0000-0000-0000-000001999302',
  '00000000-0000-0000-0000-000001999002',
  (
    SELECT id FROM public.show_lifecycle_email_steps
    WHERE show_id = '00000000-0000-0000-0000-000001999002' AND step_type = 'accepted'
  ),
  'accepted', 'sent', 'show_recipient',
  'lifecycle@example.test', 'Lifecycle Recipient',
  'myk9-1999-lifecycle', now(),
  'Entry accepted - MYK9-1999 Show A', 'Your entry has been accepted.'
);

INSERT INTO public.email_log (
  id, recipient_email, email_type, show_id, related_id, status, subject, body_html
)
VALUES
  ('00000000-0000-0000-0000-000001999201', 'ada@example.test', 'heritage_confirmation', '00000000-0000-0000-0000-000001999002', NULL, 'sent', 'Your entry to MYK9-1999 Show A is confirmed', '<p>Armband 142</p>'),
  ('00000000-0000-0000-0000-000001999202', 'bo@example.test', 'registration_confirmation', '00000000-0000-0000-0000-000001999003', NULL, 'sent', 'Receipt B', '<p>B</p>'),
  ('00000000-0000-0000-0000-000001999203', 'lifecycle@example.test', 'show_lifecycle_email', '00000000-0000-0000-0000-000001999002', '00000000-0000-0000-0000-000001999302', 'sent', NULL, NULL),
  ('00000000-0000-0000-0000-000001999204', 'platform@example.test', 'auth_confirmation', '00000000-0000-0000-0000-000001999002', NULL, 'sent', 'Sign in', '<p>secret link</p>');
RESET ROLE;

DO $$
DECLARE
  manager uuid := '00000000-0000-0000-0000-000001999101';
  other_user uuid := '00000000-0000-0000-0000-000001999102';
  found_subject text;
  found_html text;
  found_text text;
BEGIN
  IF has_function_privilege('anon', 'public.get_show_email_content(uuid)', 'execute') THEN
    RAISE EXCEPTION 'FAIL anon can execute get_show_email_content';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_show_email_content(uuid)', 'execute') THEN
    RAISE EXCEPTION 'FAIL authenticated cannot execute get_show_email_content';
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', manager::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', manager, 'role', 'authenticated')::text, true);

  SELECT subject, body_html INTO found_subject, found_html
  FROM public.get_show_email_content('00000000-0000-0000-0000-000001999201');
  IF found_subject IS DISTINCT FROM 'Your entry to MYK9-1999 Show A is confirmed'
     OR found_html IS DISTINCT FROM '<p>Armband 142</p>' THEN
    RAISE EXCEPTION 'FAIL manager read % / % for the full confirmation', found_subject, found_html;
  END IF;

  SELECT subject, body_html, body_text INTO found_subject, found_html, found_text
  FROM public.get_show_email_content('00000000-0000-0000-0000-000001999203');
  IF found_subject IS DISTINCT FROM 'Entry accepted - MYK9-1999 Show A'
     OR found_html IS NOT NULL
     OR found_text IS DISTINCT FROM 'Your entry has been accepted.' THEN
    RAISE EXCEPTION 'FAIL lifecycle email read % / % / %', found_subject, found_html, found_text;
  END IF;

  BEGIN
    PERFORM * FROM public.get_show_email_content('00000000-0000-0000-0000-000001999202');
    RAISE EXCEPTION 'FAIL secretary read an email of a show they do not manage';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM * FROM public.get_show_email_content('00000000-0000-0000-0000-000001999204');
    RAISE EXCEPTION 'FAIL a platform email outside the history types was readable';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', other_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', other_user, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM * FROM public.get_show_email_content('00000000-0000-0000-0000-000001999201');
    RAISE EXCEPTION 'FAIL non-manager read an email';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

ROLLBACK;
