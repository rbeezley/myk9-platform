-- MYK9-1588: hard_delete_show needs a password confirmed in the last five minutes, like the
-- other irreversible site-admin actions (MYK9-1208). A site-admin JWT with a stale amr gets
-- MKAUT and the show survives; a fresh one deletes a disposable show; a non-admin still reads
-- 42501, not a password prompt. All fixtures roll back. Runs only in CI (no local container
-- runtime). Migration: 20261104171900_myk9_1588_hard_delete_show_reauth.sql.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000001588001', 'MYK9-1588 fixture club');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000001588011', 'Site', 'Admin', 'myk9-1588-admin@example.test', NULL),
  ('00000000-0000-0000-0000-000001588012', 'Plain', 'Exhibitor', 'myk9-1588-plain@example.test', NULL);

-- people.auth_user_id REFERENCES auth.users(id): create the sign-ins first, then link.
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000001588021', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1588-admin@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000001588022', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-1588-plain@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000001588021'
WHERE id = '00000000-0000-0000-0000-000001588011';
UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000001588022'
WHERE id = '00000000-0000-0000-0000-000001588012';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000001588011', id, NULL, true,
       '00000000-0000-0000-0000-000001588021'
FROM public.roles WHERE name = 'site_admin';

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES ('00000000-0000-0000-0000-000001588031', 'MYK9-1588 disposable show', 'AKC',
        current_date + 10, current_date + 11, '00000000-0000-0000-0000-000001588001', 'draft');

SET LOCAL ROLE authenticated;

-- 1. Site admin, sign-in 14 days old: MKAUT, and the show is still there.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001588021', true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-0000-0000-000001588021', 'role', 'authenticated',
  'amr', jsonb_build_array(jsonb_build_object(
    'method', 'password', 'timestamp', extract(epoch FROM now())::bigint - 14 * 86400))
)::text, true);

DO $$
BEGIN
  BEGIN
    PERFORM public.hard_delete_show('00000000-0000-0000-0000-000001588031');
    RAISE EXCEPTION 'FAIL a show was permanently deleted on a 14-day-old sign-in';
  EXCEPTION WHEN SQLSTATE 'MKAUT' THEN
    NULL;
  END;
  IF NOT EXISTS (SELECT 1 FROM public.shows
                 WHERE id = '00000000-0000-0000-0000-000001588031') THEN
    RAISE EXCEPTION 'FAIL the stale refusal still deleted the show';
  END IF;
  RAISE NOTICE 'PASS hard_delete_show asks for the password on a stale session';
END;
$$;

-- 2. No amr at all is also a refusal.
SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-0000-0000-000001588021', 'role', 'authenticated')::text, true);

DO $$
BEGIN
  BEGIN
    PERFORM public.hard_delete_show('00000000-0000-0000-0000-000001588031');
    RAISE EXCEPTION 'FAIL a show was deleted with no re-auth proof';
  EXCEPTION WHEN SQLSTATE 'MKAUT' THEN
    RAISE NOTICE 'PASS hard_delete_show refuses a JWT with no amr';
  END;
END;
$$;

-- 3. Fresh password confirmation: the disposable show is deleted.
SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-0000-0000-000001588021', 'role', 'authenticated',
  'amr', jsonb_build_array(jsonb_build_object(
    'method', 'password', 'timestamp', extract(epoch FROM now())::bigint - 30))
)::text, true);

SELECT public.hard_delete_show('00000000-0000-0000-0000-000001588031');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.shows WHERE id = '00000000-0000-0000-0000-000001588031') THEN
    RAISE EXCEPTION 'FAIL a fresh site-admin session did not delete the disposable show';
  END IF;
  RAISE NOTICE 'PASS hard_delete_show deletes after a fresh re-auth';
END;
$$;

-- 4. Someone who was never allowed reads "not allowed", not a password prompt.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000001588022', true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-0000-0000-000001588022', 'role', 'authenticated')::text, true);

DO $$
BEGIN
  BEGIN
    PERFORM public.hard_delete_show('00000000-0000-0000-0000-000001588031');
    RAISE EXCEPTION 'FAIL a non-admin called hard_delete_show without an error';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS a non-site-admin gets 42501 before any re-auth check';
  END;
END;
$$;

RESET ROLE;
ROLLBACK;
