-- MYK9-180 behavioral contract: the delivery-history RPC is bounded,
-- show-scoped, and callable only by an authorized authenticated user.
-- Fixtures roll back.

BEGIN;

INSERT INTO public.roles (name, description, is_system)
VALUES
  ('trial_secretary', 'MYK9-180 fixture', true),
  ('site_admin', 'MYK9-180 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000180001', 'MYK9-180 Club');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000180101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-180-manager@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000180102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-180-other@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000180103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-180-admin@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000180111', 'MYK9-180', 'Manager', 'myk9-180-manager@example.test', '00000000-0000-0000-0000-000000180101'),
  ('00000000-0000-0000-0000-000000180112', 'MYK9-180', 'Other', 'myk9-180-other@example.test', '00000000-0000-0000-0000-000000180102'),
  ('00000000-0000-0000-0000-000000180113', 'MYK9-180', 'Admin', 'myk9-180-admin@example.test', '00000000-0000-0000-0000-000000180103');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES
  ('00000000-0000-0000-0000-000000180002', 'MYK9-180 Show A', 'AKC', current_date, current_date, '00000000-0000-0000-0000-000000180001', 'published'),
  ('00000000-0000-0000-0000-000000180003', 'MYK9-180 Show B', 'AKC', current_date, current_date, '00000000-0000-0000-0000-000000180001', 'published');

INSERT INTO public.user_roles (user_id, role_id, club_id, show_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000000180111', role.id,
  '00000000-0000-0000-0000-000000180001',
  '00000000-0000-0000-0000-000000180002', true,
  '00000000-0000-0000-0000-000000180101'
FROM public.roles AS role WHERE role.name = 'trial_secretary';

INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000000180113', role.id, true,
  '00000000-0000-0000-0000-000000180103'
FROM public.roles AS role WHERE role.name = 'site_admin';

SET LOCAL ROLE service_role;
INSERT INTO public.email_log (
  id, recipient_email, email_type, show_id, status, created_at
)
VALUES
  ('00000000-0000-0000-0000-000000180201', 'show-a@example.test', 'registry_results_submission', '00000000-0000-0000-0000-000000180002', 'sent', now()),
  ('00000000-0000-0000-0000-000000180202', 'show-b@example.test', 'registry_results_submission', '00000000-0000-0000-0000-000000180003', 'delivered', now());
RESET ROLE;

DO $$
DECLARE
  manager uuid := '00000000-0000-0000-0000-000000180101';
  other_user uuid := '00000000-0000-0000-0000-000000180102';
  site_admin uuid := '00000000-0000-0000-0000-000000180103';
  show_a uuid := '00000000-0000-0000-0000-000000180002';
  show_b uuid := '00000000-0000-0000-0000-000000180003';
  row_count integer;
BEGIN
  IF has_function_privilege('anon', 'public.get_show_email_delivery_history(uuid,integer,timestamptz,uuid)', 'execute') THEN
    RAISE EXCEPTION 'FAIL anon can execute show email history RPC';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_show_email_delivery_history(uuid,integer,timestamptz,uuid)', 'execute') THEN
    RAISE EXCEPTION 'FAIL authenticated lost show email history RPC execute';
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', manager::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', manager, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO row_count FROM public.get_show_email_delivery_history(show_a, 1, NULL, NULL);
  IF row_count <> 1 THEN
    RAISE EXCEPTION 'FAIL same-show secretary received % rows (expected 1)', row_count;
  END IF;

  BEGIN
    PERFORM * FROM public.get_show_email_delivery_history(show_b, 50, NULL, NULL);
    RAISE EXCEPTION 'FAIL cross-show secretary read succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM * FROM public.get_show_email_delivery_history(show_a, 0, NULL, NULL);
    RAISE EXCEPTION 'FAIL invalid limit accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;

  BEGIN
    PERFORM * FROM public.get_show_email_delivery_history(show_a, 50, now(), NULL);
    RAISE EXCEPTION 'FAIL malformed cursor accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', other_user::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', other_user, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM * FROM public.get_show_email_delivery_history(show_a, 50, NULL, NULL);
    RAISE EXCEPTION 'FAIL non-manager read succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub', site_admin::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', site_admin, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO row_count FROM public.get_show_email_delivery_history(show_b, 50, NULL, NULL);
  IF row_count <> 1 THEN
    RAISE EXCEPTION 'FAIL site admin received % rows (expected 1)', row_count;
  END IF;
END;
$$;

ROLLBACK;
