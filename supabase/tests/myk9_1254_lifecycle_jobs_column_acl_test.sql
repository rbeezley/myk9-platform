-- MYK9-1254 behavioral contract: authenticated can UPDATE only the columns the
-- browser edits on show_lifecycle_email_jobs. Server-owned lease/ownership columns
-- (claimed_until, idempotency_key, ...) are refused with 42501 even for a secretary
-- who passes the RLS update policy. Fixtures roll back.

BEGIN;

INSERT INTO public.roles (name, description, is_system)
VALUES ('secretary', 'MYK9-1254 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name) VALUES ('00000000-0000-0000-0000-000001254001', 'MYK9-1254 Club');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES ('00000000-0000-0000-0000-000001254111', 'MYK9-1254', 'Secretary', 'myk9-1254-secretary@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES ('00000000-0000-0000-0000-000001254101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-1254-secretary@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES ('00000000-0000-0000-0000-000001254002', 'MYK9-1254 Show', 'AKC', current_date, current_date, '00000000-0000-0000-0000-000001254001', 'published');

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000001254111', role.id,
       '00000000-0000-0000-0000-000001254001', true,
       '00000000-0000-0000-0000-000001254101'
FROM public.roles AS role WHERE role.name = 'secretary';

SET LOCAL ROLE service_role;
INSERT INTO public.show_lifecycle_email_jobs (
  id, show_id, step_id, step_type, status, recipient_scope,
  recipient_email, recipient_name, idempotency_key, due_at
)
VALUES (
  '00000000-0000-0000-0000-000001254302',
  '00000000-0000-0000-0000-000001254002',
  (SELECT id FROM public.show_lifecycle_email_steps
   WHERE show_id = '00000000-0000-0000-0000-000001254002' AND step_type = 'accepted'),
  'accepted', 'ready', 'show_recipient',
  'lifecycle@example.test', 'Lifecycle Recipient', 'myk9-1254-key', now()
);
RESET ROLE;

DO $$
DECLARE
  secretary uuid := '00000000-0000-0000-0000-000001254101';
  job uuid := '00000000-0000-0000-0000-000001254302';
  col text;
  n integer;
BEGIN
  -- Column ACL: exactly the five editable columns, no table-level UPDATE.
  IF has_table_privilege('authenticated', 'public.show_lifecycle_email_jobs', 'UPDATE') THEN
    RAISE EXCEPTION 'FAIL authenticated still holds table-level UPDATE';
  END IF;
  IF has_table_privilege('anon', 'public.show_lifecycle_email_jobs', 'UPDATE') THEN
    RAISE EXCEPTION 'FAIL anon holds table-level UPDATE';
  END IF;
  FOR col IN SELECT a.attname FROM pg_attribute a
    WHERE a.attrelid = 'public.show_lifecycle_email_jobs'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
  LOOP
    IF has_column_privilege('authenticated', 'public.show_lifecycle_email_jobs', col, 'UPDATE')
       IS DISTINCT FROM (col IN ('subject', 'body', 'secretary_note', 'status', 'skipped_at')) THEN
      RAISE EXCEPTION 'FAIL authenticated UPDATE privilege on column % is wrong', col;
    END IF;
    IF has_column_privilege('anon', 'public.show_lifecycle_email_jobs', col, 'UPDATE') THEN
      RAISE EXCEPTION 'FAIL anon can UPDATE column %', col;
    END IF;
  END LOOP;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', secretary::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', secretary, 'role', 'authenticated')::text, true);

  -- Positive control: the secretary reaches the row through RLS and the allowed columns.
  UPDATE public.show_lifecycle_email_jobs
     SET subject = 'edited', body = 'edited body', secretary_note = 'note'
   WHERE id = job AND status IN ('ready', 'failed');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL secretary edit of subject/body/secretary_note touched % rows (expected 1)', n;
  END IF;

  -- Server-owned columns are refused outright.
  BEGIN
    UPDATE public.show_lifecycle_email_jobs SET claimed_until = now() + interval '100 years' WHERE id = job;
    RAISE EXCEPTION 'FAIL secretary forged claimed_until';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.show_lifecycle_email_jobs SET idempotency_key = 'forged' WHERE id = job;
    RAISE EXCEPTION 'FAIL secretary rewrote idempotency_key';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.show_lifecycle_email_jobs SET subject = 'x', rendered_body = 'forged' WHERE id = job;
    RAISE EXCEPTION 'FAIL secretary rewrote rendered_body';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- The skip path (status + skipped_at) still works.
  UPDATE public.show_lifecycle_email_jobs
     SET status = 'skipped', skipped_at = now()
   WHERE id = job AND status IN ('ready', 'failed');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL secretary skip touched % rows (expected 1)', n;
  END IF;

  RAISE NOTICE 'PASS MYK9-1254 lifecycle job column ACL';
END;
$$;

ROLLBACK;
