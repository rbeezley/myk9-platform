-- MYK9-1208: role changes need a password (or emailed code) confirmed in the last five
-- minutes, read from the request JWT's amr claim. Proves the helper's verdicts, that a gated
-- RPC and a direct site-admin user_roles write are refused without a recent re-auth and
-- allowed with one, and that a caller who was never allowed still reads 42501, not a
-- password prompt. All fixtures roll back. Runs only in CI (no local container runtime).

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000120801', 'Step-up Test Club');

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000120811', 'Club', 'Admin', '00000000-0000-0000-0000-000000120821'),
  ('00000000-0000-0000-0000-000000120812', 'Site', 'Admin', '00000000-0000-0000-0000-000000120822'),
  ('00000000-0000-0000-0000-000000120813', 'Hired', 'Secretary', '00000000-0000-0000-0000-000000120823'),
  ('00000000-0000-0000-0000-000000120814', 'Plain', 'Exhibitor', '00000000-0000-0000-0000-000000120824');

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000120811', id, '00000000-0000-0000-0000-000000120801',
       true, '00000000-0000-0000-0000-000000120821'
FROM public.roles WHERE name = 'club_admin';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000120812', id, NULL, true,
       '00000000-0000-0000-0000-000000120822'
FROM public.roles WHERE name = 'site_admin';

-- 1. The helper's verdicts, claim shape by claim shape.
DO $$
DECLARE
  v_now bigint := extract(epoch FROM now())::bigint;
  v_case record;
  v_refused boolean;
BEGIN
  FOR v_case IN
    SELECT * FROM (VALUES
      ('no JWT (system caller)', NULL::jsonb, false),
      ('service_role', jsonb_build_object('role', 'service_role'), false),
      ('authenticated, no amr', jsonb_build_object('role', 'authenticated'), true),
      ('password 10 minutes ago', jsonb_build_object('role', 'authenticated', 'amr',
        jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now - 600))), true),
      ('password just now', jsonb_build_object('role', 'authenticated', 'amr',
        jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now - 5))), false),
      ('emailed code just now', jsonb_build_object('role', 'authenticated', 'amr',
        jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', v_now - 5))), false),
      ('oauth just now', jsonb_build_object('role', 'authenticated', 'amr',
        jsonb_build_array(jsonb_build_object('method', 'oauth', 'timestamp', v_now))), true),
      ('timestamp an hour ahead', jsonb_build_object('role', 'authenticated', 'amr',
        jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now + 3600))), true),
      ('timestamp as text', jsonb_build_object('role', 'authenticated', 'amr',
        jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', v_now::text))), true),
      ('RFC 8176 string form', jsonb_build_object('role', 'authenticated', 'amr',
        jsonb_build_array('password')), true),
      ('anon key', jsonb_build_object('role', 'anon'), true)
    ) AS c(label, claims, expect_refused)
  LOOP
    PERFORM set_config('request.jwt.claims', COALESCE(v_case.claims::text, ''), true);
    BEGIN
      PERFORM public.require_recent_reauth();
      v_refused := false;
    EXCEPTION WHEN SQLSTATE 'MKAUT' THEN
      v_refused := true;
    END;
    IF v_refused IS DISTINCT FROM v_case.expect_refused THEN
      RAISE EXCEPTION 'FAIL require_recent_reauth(%): refused=% expected=%',
        v_case.label, v_refused, v_case.expect_refused;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS require_recent_reauth refuses stale, missing, future and malformed proof';
END;
$$;

SELECT set_config('request.jwt.claims', '', true);

-- 2. A club admin appointing a secretary: refused on a stale session, allowed after re-auth.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000120821', true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-0000-0000-000000120821', 'role', 'authenticated',
  'amr', jsonb_build_array(jsonb_build_object(
    'method', 'password', 'timestamp', extract(epoch FROM now())::bigint - 14 * 86400))
)::text, true);

DO $$
BEGIN
  BEGIN
    PERFORM public.grant_club_secretary(
      '00000000-0000-0000-0000-000000120813', '00000000-0000-0000-0000-000000120801');
    RAISE EXCEPTION 'FAIL a secretary was appointed on a 14-day-old sign-in';
  EXCEPTION WHEN SQLSTATE 'MKAUT' THEN
    RAISE NOTICE 'PASS grant_club_secretary asks for the password on a stale session';
  END;
END;
$$;

SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-0000-0000-000000120821', 'role', 'authenticated',
  'amr', jsonb_build_array(jsonb_build_object(
    'method', 'password', 'timestamp', extract(epoch FROM now())::bigint - 30))
)::text, true);

SELECT public.grant_club_secretary(
  '00000000-0000-0000-0000-000000120813', '00000000-0000-0000-0000-000000120801');
-- The same confirmation covers the next action in the window: no second prompt.
SELECT public.revoke_club_secretary(
  '00000000-0000-0000-0000-000000120813', '00000000-0000-0000-0000-000000120801');

RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = '00000000-0000-0000-0000-000000120813'
      AND ur.club_id = '00000000-0000-0000-0000-000000120801'
      AND r.name = 'secretary' AND ur.is_active = false
  ) THEN
    RAISE EXCEPTION 'FAIL the fresh grant and revoke did not both land';
  END IF;
  RAISE NOTICE 'PASS one re-auth covers a grant and a revoke in the window';
END;
$$;

-- 3. Someone who was never allowed reads "not allowed", not a password prompt.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000120824', true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-0000-0000-000000120824', 'role', 'authenticated')::text, true);

DO $$
BEGIN
  BEGIN
    PERFORM public.grant_club_secretary(
      '00000000-0000-0000-0000-000000120814', '00000000-0000-0000-0000-000000120801');
    RAISE EXCEPTION 'FAIL an exhibitor appointed a secretary';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS a non-admin RPC caller gets 42501 before any re-auth check';
  END;

  BEGIN
    INSERT INTO public.user_roles (user_id, role_id, is_active)
    SELECT '00000000-0000-0000-0000-000000120814', id, true
    FROM public.roles WHERE name = 'site_admin';
    RAISE EXCEPTION 'FAIL an exhibitor granted themselves site admin';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS a non-admin direct write is refused by RLS, not by the re-auth trigger';
  END;
END;
$$;

-- 4. A site admin's direct role edit: refused on a stale session, allowed after re-auth.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000120822', true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-0000-0000-000000120822', 'role', 'authenticated',
  'amr', jsonb_build_array(jsonb_build_object(
    'method', 'password', 'timestamp', extract(epoch FROM now())::bigint - 3600))
)::text, true);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.user_roles (user_id, role_id, is_active)
    SELECT '00000000-0000-0000-0000-000000120814', id, true
    FROM public.roles WHERE name = 'judge';
    RAISE EXCEPTION 'FAIL a site admin granted a role on an hour-old sign-in';
  EXCEPTION WHEN SQLSTATE 'MKAUT' THEN
    RAISE NOTICE 'PASS a direct user_roles write asks for the password on a stale session';
  END;
END;
$$;

SELECT set_config('request.jwt.claims', jsonb_build_object(
  'sub', '00000000-0000-0000-0000-000000120822', 'role', 'authenticated',
  'amr', jsonb_build_array(jsonb_build_object(
    'method', 'password', 'timestamp', extract(epoch FROM now())::bigint - 10))
)::text, true);

INSERT INTO public.user_roles (user_id, role_id, is_active)
SELECT '00000000-0000-0000-0000-000000120814', id, true
FROM public.roles WHERE name = 'judge';

RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = '00000000-0000-0000-0000-000000120814' AND r.name = 'judge'
  ) THEN
    RAISE EXCEPTION 'FAIL the re-authenticated site-admin grant did not land';
  END IF;
  RAISE NOTICE 'PASS a re-authenticated site admin can edit roles directly';
END;
$$;

ROLLBACK;
