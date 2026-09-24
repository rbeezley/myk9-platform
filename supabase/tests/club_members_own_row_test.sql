-- Behavioral test for MYK9-723: a member reads their own club_members (and
-- club_officers) row through RLS, never another club's rows, and anon reads
-- nothing. All fixtures roll back.
--
-- Before 20260924172900 the own-row arm compared person_id (a people.id) with
-- auth.uid() (an auth.users.id), so section 1 read zero rows.
--
-- People are inserted before auth.users so handle_new_user adopts each one by
-- email (same order as club_routed_role_requests_test.sql).

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000000000e21', 'Own Row Test Club'),
  ('00000000-0000-0000-0000-000000000e22', 'Own Row Other Club');

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000000e12', 'Mary', 'Member', 'myk9-723-mary@example.test'),
  ('00000000-0000-0000-0000-000000000e13', 'Otto', 'Other', 'myk9-723-otto@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000000e02', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-723-mary@example.test', '', now(),
   now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000000e03', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-723-otto@example.test', '', now(),
   now(), now(), '{}', '{}', false, false, false);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.people
    WHERE id IN ('00000000-0000-0000-0000-000000000e12', '00000000-0000-0000-0000-000000000e13')
      AND auth_user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'FIXTURE handle_new_user did not adopt the seeded people by email';
  END IF;
END;
$$;

INSERT INTO public.club_members (club_id, person_id, membership_status)
VALUES
  ('00000000-0000-0000-0000-000000000e21', '00000000-0000-0000-0000-000000000e12', 'active'),
  ('00000000-0000-0000-0000-000000000e22', '00000000-0000-0000-0000-000000000e13', 'active');

INSERT INTO public.club_officers (club_id, person_id, position)
VALUES
  ('00000000-0000-0000-0000-000000000e21', '00000000-0000-0000-0000-000000000e12', 'treasurer'),
  ('00000000-0000-0000-0000-000000000e22', '00000000-0000-0000-0000-000000000e13', 'president');

-- ============================================================================
-- 1/2. Mary reads her own rows and nothing from the other club.
-- ============================================================================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000e02', true);

DO $$
DECLARE
  v_own int;
  v_other int;
BEGIN
  SELECT count(*) INTO v_own FROM public.club_members
  WHERE person_id = '00000000-0000-0000-0000-000000000e12';
  IF v_own <> 1 THEN
    RAISE EXCEPTION 'FAIL a member read % of their own club_members rows (expected 1)', v_own;
  END IF;

  SELECT count(*) INTO v_other FROM public.club_members
  WHERE club_id = '00000000-0000-0000-0000-000000000e22';
  IF v_other <> 0 THEN
    RAISE EXCEPTION 'FAIL a member read % club_members rows of another club', v_other;
  END IF;

  RAISE NOTICE 'PASS a member reads their own club_members row and no other club''s rows';

  SELECT count(*) INTO v_own FROM public.club_officers
  WHERE person_id = '00000000-0000-0000-0000-000000000e12';
  IF v_own <> 1 THEN
    RAISE EXCEPTION 'FAIL an officer read % of their own club_officers rows (expected 1)', v_own;
  END IF;

  SELECT count(*) INTO v_other FROM public.club_officers
  WHERE club_id = '00000000-0000-0000-0000-000000000e22';
  IF v_other <> 0 THEN
    RAISE EXCEPTION 'FAIL an officer read % club_officers rows of another club', v_other;
  END IF;

  RAISE NOTICE 'PASS an officer reads their own club_officers row and no other club''s rows';
END;
$$;

RESET ROLE;

-- ============================================================================
-- 3. anon reads nothing from either table (no grant, or zero rows).
-- ============================================================================

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);

DO $$
DECLARE
  v_rows int;
BEGIN
  BEGIN
    SELECT count(*) INTO v_rows FROM public.club_members;
    IF v_rows <> 0 THEN
      RAISE EXCEPTION 'FAIL anon read % club_members rows', v_rows;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    SELECT count(*) INTO v_rows FROM public.club_officers;
    IF v_rows <> 0 THEN
      RAISE EXCEPTION 'FAIL anon read % club_officers rows', v_rows;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  RAISE NOTICE 'PASS anon reads no club_members or club_officers rows';
END;
$$;

RESET ROLE;

ROLLBACK;
