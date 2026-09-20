-- MYK9-691: behavioral authorization test for update_show_style.
--
-- Run against a database where the migration is applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/myk9_691_update_show_style_test.sql
-- Every fixture rolls back.

BEGIN;

-- The function must be usable only by authenticated clients.  Seed the role
-- used by the two club-scoped manager fixtures on schema-only databases.
INSERT INTO public.roles (id, name, description, is_system)
VALUES ('00000000-0000-0000-0000-000000691801', 'club_admin', 'MYK9-691 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name)
VALUES
  ('00000000-0000-0000-0000-000000691001', 'MYK9-691 Club A'),
  ('00000000-0000-0000-0000-000000691002', 'MYK9-691 Club B');

-- Two managers make the cross-club authorization assertion non-vacuous.  The
-- first is free and the second is Premium, so entitlement and tenant scope
-- are tested independently.  The ordinary user has no manager role.
INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000691011', 'MYK9-691', 'Free Manager',
   'myk9-691-free-manager@example.test', NULL),
  ('00000000-0000-0000-0000-000000691012', 'MYK9-691', 'Premium Manager',
   'myk9-691-premium-manager@example.test', NULL),
  ('00000000-0000-0000-0000-000000691013', 'MYK9-691', 'Other Club Manager',
   'myk9-691-other-manager@example.test', NULL),
  ('00000000-0000-0000-0000-000000691014', 'MYK9-691', 'Ordinary User',
   'myk9-691-ordinary@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000691101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-691-free-manager@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000691102', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-691-premium-manager@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000691103', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-691-other-manager@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000691104', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-691-ordinary@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

-- handle_new_user() adopts the pre-seeded people and creates the matching
-- exhibitor_profiles rows.  Make the Premium account explicitly active.
SET LOCAL ROLE service_role;
UPDATE public.exhibitor_profiles ep
SET subscription_tier = 'premium', subscription_expires_at = now() + interval '30 days'
WHERE ep.person_id = '00000000-0000-0000-0000-000000691012';
RESET ROLE;

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT fixture.person_id, r.id, fixture.club_id, true, fixture.auth_id
FROM (VALUES
  ('00000000-0000-0000-0000-000000691011'::uuid, '00000000-0000-0000-0000-000000691001'::uuid, '00000000-0000-0000-0000-000000691101'::uuid),
  ('00000000-0000-0000-0000-000000691012'::uuid, '00000000-0000-0000-0000-000000691001'::uuid, '00000000-0000-0000-0000-000000691102'::uuid),
  ('00000000-0000-0000-0000-000000691013'::uuid, '00000000-0000-0000-0000-000000691002'::uuid, '00000000-0000-0000-0000-000000691103'::uuid)
) AS fixture(person_id, club_id, auth_id)
JOIN public.roles r ON r.name = 'club_admin';

INSERT INTO public.shows (
  id, name, organization, start_date, end_date, club_id, status, style,
  accept_check_payments, accept_cash_payments, allow_non_owner_handlers
)
VALUES (
  '00000000-0000-0000-0000-000000691021', 'MYK9-691 Style Show', 'AKC',
  current_date + 10, current_date + 11,
  '00000000-0000-0000-0000-000000691001', 'draft', 'banner',
  true, false, false
);

DO $$
DECLARE
  v_show_id uuid := '00000000-0000-0000-0000-000000691021';
  v_version_before integer;
  v_version_after integer;
  v_style text;
  v_status text;
  v_accept_check boolean;
  v_accept_cash boolean;
  v_allow_non_owner boolean;
  v_public_execute boolean;
  v_anon_execute boolean;
  v_authenticated_execute boolean;
BEGIN
  SELECT coalesce(bool_or(grant_row.grantee = 0), false)
    INTO v_public_execute
  FROM pg_proc p
  CROSS JOIN LATERAL aclexplode(p.proacl) grant_row
  WHERE p.oid = 'public.update_show_style(uuid,text)'::regprocedure
    AND grant_row.privilege_type = 'EXECUTE';
  v_anon_execute := has_function_privilege(
    'anon', 'public.update_show_style(uuid,text)', 'EXECUTE');
  v_authenticated_execute := has_function_privilege(
    'authenticated', 'public.update_show_style(uuid,text)', 'EXECUTE');

  IF v_public_execute THEN
    RAISE EXCEPTION 'FAIL PUBLIC can execute update_show_style';
  END IF;
  IF v_anon_execute THEN
    RAISE EXCEPTION 'FAIL anon can execute update_show_style';
  END IF;
  IF NOT v_authenticated_execute THEN
    RAISE EXCEPTION 'FAIL authenticated cannot execute update_show_style';
  END IF;
  RAISE NOTICE 'PASS update_show_style execution is authenticated-only';

  -- Club-A manager on a free account may use the fallback style.
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000691101', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000691101', 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_version_before := (SELECT s.version FROM public.shows s WHERE s.id = v_show_id);
  IF public.update_show_style(v_show_id, 'monogram') <> v_version_before + 1 THEN
    RAISE EXCEPTION 'FAIL free fallback save did not return the incremented version';
  END IF;
  RESET ROLE;

  -- The same free account may not select a Premium style.
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.update_show_style(v_show_id, 'heritage');
    RAISE EXCEPTION 'FAIL free account selected a Premium style';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLSTATE <> '42501' THEN
      RAISE EXCEPTION 'FAIL free Premium denial returned SQLSTATE %', SQLSTATE;
    END IF;
    RAISE NOTICE 'PASS free account is denied Premium style with SQLSTATE 42501';
  END;
  RESET ROLE;

  -- Club-A manager with active Premium access may select the Premium style.
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000691102', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000691102', 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_version_before := (SELECT s.version FROM public.shows s WHERE s.id = v_show_id);
  v_version_after := public.update_show_style(v_show_id, 'heritage');
  IF v_version_after <> v_version_before + 1 THEN
    RAISE EXCEPTION 'FAIL Premium save returned version % (expected %)',
      v_version_after, v_version_before + 1;
  END IF;
  RESET ROLE;

  SELECT s.style, s.status, s.accept_check_payments, s.accept_cash_payments,
         s.allow_non_owner_handlers, s.version
    INTO v_style, v_status, v_accept_check, v_accept_cash, v_allow_non_owner,
         v_version_after
  FROM public.shows s
  WHERE s.id = v_show_id;
  IF v_style <> 'heritage' OR v_status <> 'draft'
     OR v_accept_check IS DISTINCT FROM true
     OR v_accept_cash IS DISTINCT FROM false
     OR v_allow_non_owner IS DISTINCT FROM false
     OR v_version_after <> v_version_before + 1 THEN
    RAISE EXCEPTION 'FAIL style save changed an unrelated show field or version: %, %, %, %, %, %',
      v_style, v_status, v_accept_check, v_accept_cash, v_allow_non_owner, v_version_after;
  END IF;
  RAISE NOTICE 'PASS Premium style save changes style only and increments version once';

  -- A manager of another club and an ordinary authenticated user cannot cross
  -- the tenant boundary, regardless of the requested style.
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000691103', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000691103', 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.update_show_style(v_show_id, 'monogram');
    RAISE EXCEPTION 'FAIL other-club manager changed the show';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLSTATE <> '42501' THEN
      RAISE EXCEPTION 'FAIL other-club manager denial returned SQLSTATE %', SQLSTATE;
    END IF;
    RAISE NOTICE 'PASS other-club manager is denied with SQLSTATE 42501';
  END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000691104', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000691104', 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.update_show_style(v_show_id, 'monogram');
    RAISE EXCEPTION 'FAIL ordinary user changed the show';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLSTATE <> '42501' THEN
      RAISE EXCEPTION 'FAIL ordinary-user denial returned SQLSTATE %', SQLSTATE;
    END IF;
    RAISE NOTICE 'PASS ordinary authenticated user is denied with SQLSTATE 42501';
  END;
  RESET ROLE;

  -- Input validation is independent of authorization and uses 22023.
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000691102', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000691102', 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.update_show_style(v_show_id, 'not-a-style');
    RAISE EXCEPTION 'FAIL invalid style was accepted';
  EXCEPTION WHEN others THEN
    IF SQLSTATE <> '22023' THEN
      RAISE EXCEPTION 'FAIL invalid style returned SQLSTATE %', SQLSTATE;
    END IF;
    RAISE NOTICE 'PASS invalid style is rejected with SQLSTATE 22023';
  END;
  BEGIN
    PERFORM public.update_show_style('00000000-0000-0000-0000-000000691099', 'monogram');
    RAISE EXCEPTION 'FAIL nonexistent show was accepted';
  EXCEPTION WHEN others THEN
    IF SQLSTATE <> '22023' THEN
      RAISE EXCEPTION 'FAIL nonexistent show returned SQLSTATE %', SQLSTATE;
    END IF;
    RAISE NOTICE 'PASS nonexistent show is rejected with SQLSTATE 22023';
  END;
  RESET ROLE;
END;
$$;

ROLLBACK;
