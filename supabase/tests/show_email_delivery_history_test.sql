-- MYK9-180 behavioral contract: the delivery-history RPC is bounded,
-- show-scoped, and callable only by an authorized authenticated user.
-- Fixtures roll back.

BEGIN;

INSERT INTO public.roles (name, description, is_system)
VALUES
  ('secretary', 'MYK9-180 fixture', true),
  ('site_admin', 'MYK9-180 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000000180001', 'MYK9-180 Club'),
  -- Show B needs its OWN club. Access is club-derived since the label/permission
  -- split, so leaving both shows in one club would make the appointed secretary
  -- legitimately authorized for show B and turn the refusal asserted below into a
  -- vacuous pass.
  ('00000000-0000-0000-0000-000000180011', 'MYK9-180 Other Club');

-- Seed unlinked people first. handle_new_user() adopts a matching person by
-- email when the auth row is inserted, avoiding duplicate auth_user_id rows.
INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000180111', 'MYK9-180', 'Manager', 'myk9-180-manager@example.test', NULL),
  ('00000000-0000-0000-0000-000000180112', 'MYK9-180', 'Other', 'myk9-180-other@example.test', NULL),
  ('00000000-0000-0000-0000-000000180113', 'MYK9-180', 'Admin', 'myk9-180-admin@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000180101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-180-manager@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000180102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-180-other@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000180103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-180-admin@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES
  ('00000000-0000-0000-0000-000000180002', 'MYK9-180 Show A', 'AKC', current_date, current_date, '00000000-0000-0000-0000-000000180001', 'published'),
  ('00000000-0000-0000-0000-000000180003', 'MYK9-180 Show B', 'AKC', current_date, current_date, '00000000-0000-0000-0000-000000180011', 'published');

-- Club-scoped appointment. Since the label/permission split a show-scoped
-- user_roles row records paperwork and grants nothing, so this caller reaches
-- show A by being appointed to the club that owns it.
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000000180111', role.id,
  '00000000-0000-0000-0000-000000180001', true,
  '00000000-0000-0000-0000-000000180101'
FROM public.roles AS role WHERE role.name = 'secretary';

INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-000000180113', role.id, true,
  '00000000-0000-0000-0000-000000180103'
FROM public.roles AS role WHERE role.name = 'site_admin';

SET LOCAL ROLE service_role;
INSERT INTO public.show_lifecycle_email_jobs (
  id, show_id, step_id, step_type, status, recipient_scope,
  recipient_email, recipient_name, idempotency_key, due_at
)
VALUES (
  '00000000-0000-0000-0000-000000180302',
  '00000000-0000-0000-0000-000000180002',
  (
    SELECT id
    FROM public.show_lifecycle_email_steps
    WHERE show_id = '00000000-0000-0000-0000-000000180002'
      AND step_type = 'accepted'
  ),
  'accepted', 'failed', 'show_recipient',
  'lifecycle@example.test', 'Lifecycle Recipient',
  'myk9-180-lifecycle', '2026-08-17T12:00:00Z'
);

INSERT INTO public.show_lifecycle_email_attempts (
  id, job_id, status, error_message, attempted_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000180303',
    '00000000-0000-0000-0000-000000180302',
    'failed', 'pre_provider_failure', '2026-08-17T12:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000180304',
    '00000000-0000-0000-0000-000000180302',
    'sent', NULL, '2026-08-17T12:00:00Z'
  );

INSERT INTO public.email_log (
  id, recipient_email, email_type, show_id, status, created_at
)
VALUES
  ('00000000-0000-0000-0000-000000180201', 'show-a@example.test', 'registry_results_submission', '00000000-0000-0000-0000-000000180002', 'sent', '2026-08-17T12:00:00Z'),
  ('00000000-0000-0000-0000-000000180202', 'show-b@example.test', 'registry_results_submission', '00000000-0000-0000-0000-000000180003', 'delivered', '2026-08-17T12:00:00Z'),
  ('00000000-0000-0000-0000-000000180203', 'registration@example.test', 'registration_confirmation', '00000000-0000-0000-0000-000000180002', 'sent', '2026-08-17T12:00:00Z'),
  ('00000000-0000-0000-0000-000000180204', 'orphan@example.test', 'entry_decision', '00000000-0000-0000-0000-000000180002', 'sent', '2026-08-17T12:00:00Z'),
  ('00000000-0000-0000-0000-000000180205', 'malformed@example.test', 'show_lifecycle_email', '00000000-0000-0000-0000-000000180002', 'sent', '2026-08-17T12:00:00Z');
RESET ROLE;

DO $$
DECLARE
  manager uuid := '00000000-0000-0000-0000-000000180101';
  other_user uuid := '00000000-0000-0000-0000-000000180102';
  site_admin uuid := '00000000-0000-0000-0000-000000180103';
  show_a uuid := '00000000-0000-0000-0000-000000180002';
  show_b uuid := '00000000-0000-0000-0000-000000180003';
  first_id uuid;
  first_attempted_at timestamptz;
  second_id uuid;
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
  SELECT count(*) INTO row_count FROM public.get_show_email_delivery_history(show_a, 100, NULL, NULL);
  IF row_count <> 3 THEN
    RAISE EXCEPTION 'FAIL same-show secretary received % rows (expected 3)', row_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.get_show_email_delivery_history(show_a, 100, NULL, NULL)
    WHERE source_kind = 'registration_confirmation'
  ) THEN
    RAISE EXCEPTION 'FAIL registration history missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.get_show_email_delivery_history(show_a, 100, NULL, NULL)
    WHERE id = '00000000-0000-0000-0000-000000180303'
      AND source_kind = 'lifecycle'
      AND delivery_status = 'failed'
  ) THEN
    RAISE EXCEPTION 'FAIL lifecycle failure history missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.get_show_email_delivery_history(show_a, 100, NULL, NULL)
    WHERE id IN (
      '00000000-0000-0000-0000-000000180204',
      '00000000-0000-0000-0000-000000180205'
    )
  ) THEN
    RAISE EXCEPTION 'FAIL orphan or malformed reference leaked';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.get_show_email_delivery_history(show_a, 100, NULL, NULL)
    WHERE id = '00000000-0000-0000-0000-000000180304'
  ) THEN
    RAISE EXCEPTION 'FAIL non-failed lifecycle fallback leaked';
  END IF;

  SELECT id, attempted_at INTO first_id, first_attempted_at
  FROM public.get_show_email_delivery_history(show_a, 1, NULL, NULL)
  LIMIT 1;
  IF first_id <> '00000000-0000-0000-0000-000000180303' THEN
    RAISE EXCEPTION 'FAIL same-timestamp first page returned %', first_id;
  END IF;

  SELECT id INTO second_id
  FROM public.get_show_email_delivery_history(show_a, 1, first_attempted_at, first_id)
  LIMIT 1;
  IF second_id <> '00000000-0000-0000-0000-000000180203' THEN
    RAISE EXCEPTION 'FAIL same-timestamp cursor page returned %', second_id;
  END IF;

  BEGIN
    PERFORM * FROM public.get_show_email_delivery_history(show_b, 50, NULL, NULL);
    RAISE EXCEPTION 'FAIL secretary read the history of a show they do not manage';
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

  BEGIN
    PERFORM * FROM public.get_show_email_delivery_history(show_a, 50, NULL, show_a);
    RAISE EXCEPTION 'FAIL reverse half-specified cursor accepted';
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
