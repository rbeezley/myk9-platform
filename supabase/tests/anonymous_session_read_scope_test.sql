-- Behavioral test for
-- 20260731180000_exclude_anonymous_sessions_from_account_reads.sql
-- (SA-2026-07-29-02 / MYK9-117).
--
-- Run against a database where all migrations are applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/anonymous_session_read_scope_test.sql
-- All fixtures roll back.
--
-- Anonymous sign-in is load-bearing — a ringside passcode user has no account and
-- signs in anonymously — so this asserts BOTH directions. Denying the anonymous
-- session is only half the requirement; a fix that also broke passcode ringside
-- access would pass a denial-only test and take down show day.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-0000000f0c01', 'Anon Scope Test Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          accept_check_payments, accept_cash_payments)
VALUES ('00000000-0000-0000-0000-0000000f0510', 'Anon Scope Test Show', 'AKC',
        current_date + 10, current_date + 11, '00000000-0000-0000-0000-0000000f0c01',
        'published', true, true);

INSERT INTO public.volunteers (id, show_id, name, email, phone)
VALUES ('00000000-0000-0000-0000-0000000f0601',
        '00000000-0000-0000-0000-0000000f0510',
        'Pat Volunteer', 'pat-volunteer@example.test', '555-0100');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-0000000f0111', 'Real', 'Account', 'real-account@example.test', NULL),
  ('00000000-0000-0000-0000-0000000f0112', 'Show', 'Manager',  'show-manager@example.test',  NULL);

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user, is_anonymous)
VALUES
  ('00000000-0000-0000-0000-0000000f0001','00000000-0000-0000-0000-000000000000','authenticated',
   'authenticated','real-account@example.test','', now(), now(), now(), '{}','{}', false, false, false),
  ('00000000-0000-0000-0000-0000000f0002','00000000-0000-0000-0000-000000000000','authenticated',
   'authenticated','show-manager@example.test','', now(), now(), now(), '{}','{}', false, false, false),
  -- The passcode/ringside identity: a genuine anonymous auth user.
  ('00000000-0000-0000-0000-0000000f0003','00000000-0000-0000-0000-000000000000','authenticated',
   'authenticated', NULL,'', now(), now(), now(), '{}','{}', false, false, true);

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-0000000f0112', id, '00000000-0000-0000-0000-0000000f0c01', true,
       '00000000-0000-0000-0000-0000000f0002'
FROM public.roles WHERE name = 'club_admin';

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  real_acct  CONSTANT uuid := '00000000-0000-0000-0000-0000000f0001';
  manager    CONSTANT uuid := '00000000-0000-0000-0000-0000000f0002';
  anon_user  CONSTANT uuid := '00000000-0000-0000-0000-0000000f0003';
  v_show_id  CONSTANT uuid := '00000000-0000-0000-0000-0000000f0510';
  n          bigint;
BEGIN
  ----------------------------------------------------------------------------
  -- 1. Bare anonymous session: the whole point of the finding.
  ----------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', anon_user::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', anon_user, 'role', 'authenticated',
                       'is_anonymous', true, 'app_metadata', '{}'::jsonb)::text, true);

  IF ( SELECT public.is_real_account()) IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL is_real_account() true for an anonymous session';
  END IF;

  SELECT count(*) INTO n FROM public.volunteers;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL anonymous session read % volunteer row(s) — name/email/phone exposed', n; END IF;

  SELECT count(*) INTO n FROM public.activity_log;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL anonymous session read % activity_log row(s)', n; END IF;

  SELECT count(*) INTO n FROM public.roles;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL anonymous session enumerated % role(s) — RBAC map exposed', n; END IF;

  SELECT count(*) INTO n FROM public.permissions;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL anonymous session enumerated % permission(s)', n; END IF;

  SELECT count(*) INTO n FROM public.trial_checklist_state;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL anonymous session read % checklist row(s)', n; END IF;

  SELECT count(*) INTO n FROM public.show_announcements;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL anonymous session read % announcement(s)', n; END IF;

  ----------------------------------------------------------------------------
  -- 2. The passcode session must NOT lose its ringside reads. Anonymous
  --    sign-in exists for this; breaking it takes down show day.
  ----------------------------------------------------------------------------
  SELECT count(*) INTO n FROM public.shows s WHERE s.id = v_show_id;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL anonymous/passcode session lost show reads (got % rows) — ringside broken', n;
  END IF;

  -- Public reference data an anonymous ringside client still needs.
  SELECT count(*) INTO n FROM public.sport_class_rules;
  IF n = 0 THEN
    RAISE EXCEPTION 'FAIL anonymous session lost sport_class_rules — scoring rules unavailable at ringside';
  END IF;

  ----------------------------------------------------------------------------
  -- 3. A real account keeps the reads it is supposed to have.
  ----------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', real_acct::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', real_acct, 'role', 'authenticated',
                       'is_anonymous', false, 'app_metadata', '{}'::jsonb)::text, true);

  IF ( SELECT public.is_real_account()) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL is_real_account() false for a real account';
  END IF;

  SELECT count(*) INTO n FROM public.roles;
  IF n = 0 THEN RAISE EXCEPTION 'FAIL real account lost the RBAC catalog — role resolution breaks'; END IF;

  -- ...but a real account with no relationship to the show still sees no roster.
  SELECT count(*) INTO n FROM public.volunteers v WHERE v.show_id = v_show_id;
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL unrelated real account read % volunteer row(s) — show scoping not applied', n;
  END IF;

  ----------------------------------------------------------------------------
  -- 4. The show's manager sees its roster.
  ----------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', manager::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', manager, 'role', 'authenticated',
                       'is_anonymous', false, 'app_metadata', '{}'::jsonb)::text, true);

  SELECT count(*) INTO n FROM public.volunteers;
  IF n <> 1 THEN
    RAISE EXCEPTION 'FAIL show manager saw % volunteer row(s), expected 1', n;
  END IF;

  RAISE NOTICE 'PASS anonymous session denied volunteers/activity_log/roles/permissions/checklists/announcements while keeping shows and rulebook; real account keeps RBAC but not foreign rosters; show manager sees its own roster';
END;
$$;

ROLLBACK;
