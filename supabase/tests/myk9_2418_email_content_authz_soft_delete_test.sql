-- MYK9-2418 (20261128052300_myk9_2418_soft_delete_guards_fk_indexes.sql).
--
--   1. get_show_email_content (MYK9-2115) authorization: a club admin reads the stored copy of
--      their own show's email; the same admin is refused (42501) another club's email and an
--      email_log row with a NULL show_id; a site admin is refused the NULL show_id row too;
--      an unknown id returns no row; a NULL id is 22023; anon cannot execute and the call
--      fails with 42501 when it tries.
--   2. A soft-deleted club or show reads as "not found" through set_show_official_mailing_address,
--      grant_club_admin, club_publish_blockers and club_first_show_state (a live one still does
--      not), each with the function's existing error.
--   3. The two covering foreign-key indexes exist.
--
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.

BEGIN;

INSERT INTO public.clubs (id, name, authorized_at) VALUES
  ('00000000-0000-0000-0000-000002418001', 'MYK9-2418 Club A', now()),
  ('00000000-0000-0000-0000-000002418002', 'MYK9-2418 Club B', now()),
  ('00000000-0000-0000-0000-000002418003', 'MYK9-2418 Deleted Club', now());
UPDATE public.clubs SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000002418003';

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status) VALUES
  ('00000000-0000-0000-0000-000002418101', 'MYK9-2418 Show A', 'UKC', current_date + 5, current_date + 6,
   '00000000-0000-0000-0000-000002418001', 'draft'),
  ('00000000-0000-0000-0000-000002418102', 'MYK9-2418 Show B', 'UKC', current_date + 5, current_date + 6,
   '00000000-0000-0000-0000-000002418002', 'draft'),
  ('00000000-0000-0000-0000-000002418103', 'MYK9-2418 Deleted Show', 'UKC', current_date + 5, current_date + 6,
   '00000000-0000-0000-0000-000002418001', 'draft');
UPDATE public.shows SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000002418103';

INSERT INTO public.people (id, first_name, last_name, email) VALUES
  ('00000000-0000-0000-0000-000002418011', 'MYK9-2418', 'ClubAdminA', 'myk9-2418-admin-a@example.test'),
  ('00000000-0000-0000-0000-000002418012', 'MYK9-2418', 'SiteAdmin', 'myk9-2418-siteadmin@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000002418021', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-2418-admin-a@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000002418022', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-2418-siteadmin@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000002418021'
 WHERE id = '00000000-0000-0000-0000-000002418011';
UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000002418022'
 WHERE id = '00000000-0000-0000-0000-000002418012';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000002418011', roles.id, '00000000-0000-0000-0000-000002418001', true,
       '00000000-0000-0000-0000-000002418021'
FROM public.roles WHERE roles.name = 'club_admin';

INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000002418012', roles.id, true,
       '00000000-0000-0000-0000-000002418022'
FROM public.roles WHERE roles.name = 'site_admin';

-- Three emails: one per show, and one with no show. Each has a stored copy.
INSERT INTO public.email_log (id, recipient_email, email_type, show_id) VALUES
  ('00000000-0000-0000-0000-000002418201', 'a@example.test', 'test', '00000000-0000-0000-0000-000002418101'),
  ('00000000-0000-0000-0000-000002418202', 'b@example.test', 'test', '00000000-0000-0000-0000-000002418102'),
  ('00000000-0000-0000-0000-000002418203', 'c@example.test', 'test', NULL);
INSERT INTO public.email_log_contents (email_log_id, subject, html) VALUES
  ('00000000-0000-0000-0000-000002418201', 'Subject A', '<p>A</p>'),
  ('00000000-0000-0000-0000-000002418202', 'Subject B', '<p>B</p>'),
  ('00000000-0000-0000-0000-000002418203', 'Subject none', '<p>none</p>');

-- ---------------------------------------------------------------------------
-- 1. get_show_email_content authorization
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.get_show_email_content(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_show_email_content(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 1a get_show_email_content is not authenticated-only';
  END IF;
  RAISE NOTICE 'PASS 1a wiring';
END;
$$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  admin_auth CONSTANT uuid := '00000000-0000-0000-0000-000002418021';
  v_state text;
  v_subject text;
  v_rows integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', admin_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', admin_auth, 'role', 'authenticated')::text, true);

  SELECT c.subject INTO v_subject
  FROM public.get_show_email_content('00000000-0000-0000-0000-000002418201') c;
  IF v_subject IS DISTINCT FROM 'Subject A' THEN
    RAISE EXCEPTION 'FAIL 1b a club admin did not read their own show''s email (%)', v_subject;
  END IF;

  v_state := NULL;
  BEGIN
    PERFORM * FROM public.get_show_email_content('00000000-0000-0000-0000-000002418202');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  IF v_state IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'FAIL 1c another club''s email was readable (%)', v_state;
  END IF;

  v_state := NULL;
  BEGIN
    PERFORM * FROM public.get_show_email_content('00000000-0000-0000-0000-000002418203');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  IF v_state IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'FAIL 1d a NULL show_id email was readable by a club admin (%)', v_state;
  END IF;

  SELECT count(*) INTO v_rows
  FROM public.get_show_email_content('00000000-0000-0000-0000-000002418999');
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL 1e an unknown id returned % rows', v_rows;
  END IF;

  v_state := NULL;
  BEGIN
    PERFORM * FROM public.get_show_email_content(NULL);
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  IF v_state IS DISTINCT FROM '22023' THEN
    RAISE EXCEPTION 'FAIL 1f a NULL id was not 22023 (%)', v_state;
  END IF;
  RAISE NOTICE 'PASS 1 club admin: own show read, other show and NULL show refused';
END;
$$;

DO $$
DECLARE
  site_auth CONSTANT uuid := '00000000-0000-0000-0000-000002418022';
  v_state text;
  v_rows integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', site_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', site_auth, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_rows
  FROM public.get_show_email_content('00000000-0000-0000-0000-000002418202');
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'FAIL 1g a site admin did not read a show email (% rows)', v_rows;
  END IF;

  v_state := NULL;
  BEGIN
    PERFORM * FROM public.get_show_email_content('00000000-0000-0000-0000-000002418203');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  IF v_state IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'FAIL 1h a NULL show_id email was readable by a site admin (%)', v_state;
  END IF;
  RAISE NOTICE 'PASS 1 site admin: show email read, NULL show refused';
END;
$$;

RESET ROLE;

SET LOCAL ROLE anon;

DO $$
DECLARE
  v_state text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'anon')::text, true);
  BEGIN
    PERFORM * FROM public.get_show_email_content('00000000-0000-0000-0000-000002418201');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  IF v_state IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'FAIL 1i anon was not refused (%)', v_state;
  END IF;
  RAISE NOTICE 'PASS 1 anon is refused';
END;
$$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 2. A soft-deleted club or show reads as not found
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  site_auth CONSTANT uuid := '00000000-0000-0000-0000-000002418022';
  v_state text;
  v_json jsonb;
BEGIN
  -- A fresh password sign-in, which grant_club_admin requires before it looks at the club.
  PERFORM set_config('request.jwt.claim.sub', site_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object(
      'sub', site_auth,
      'role', 'authenticated',
      'amr', jsonb_build_array(jsonb_build_object(
        'method', 'password', 'timestamp', extract(epoch FROM now())::bigint))
    )::text, true);

  -- set_show_official_mailing_address: deleted show 22023, live show with no such official P0002.
  v_state := NULL;
  BEGIN
    PERFORM public.set_show_official_mailing_address(
      '00000000-0000-0000-0000-000002418103', 'secretary',
      '00000000-0000-0000-0000-000002418011', '1 Main St');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  IF v_state IS DISTINCT FROM '22023' THEN
    RAISE EXCEPTION 'FAIL 2a a deleted show was not "show not found" (%)', v_state;
  END IF;
  v_state := NULL;
  BEGIN
    PERFORM public.set_show_official_mailing_address(
      '00000000-0000-0000-0000-000002418101', 'secretary',
      '00000000-0000-0000-0000-000002418011', '1 Main St');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  IF v_state IS DISTINCT FROM 'P0002' THEN
    RAISE EXCEPTION 'FAIL 2b a live show was not found (%)', v_state;
  END IF;

  -- grant_club_admin: deleted club P0002 where a live club passes the club lookup (and then
  -- stops at the person check, 22023, for a person with no account).
  v_state := NULL;
  BEGIN
    PERFORM public.grant_club_admin(
      '00000000-0000-0000-0000-000002418003', '00000000-0000-0000-0000-000002418011');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  IF v_state IS DISTINCT FROM 'P0002' THEN
    RAISE EXCEPTION 'FAIL 2c grant_club_admin on a deleted club was not P0002 (%)', v_state;
  END IF;
  v_state := NULL;
  BEGIN
    PERFORM public.grant_club_admin(
      '00000000-0000-0000-0000-000002418002', '00000000-0000-0000-0000-000002418011');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  IF v_state IS NOT NULL AND v_state = 'P0002' THEN
    RAISE EXCEPTION 'FAIL 2d grant_club_admin on a live club said not found';
  END IF;

  -- club_publish_blockers
  v_state := NULL;
  BEGIN
    PERFORM public.club_publish_blockers('00000000-0000-0000-0000-000002418003');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  IF v_state IS DISTINCT FROM 'P0002' THEN
    RAISE EXCEPTION 'FAIL 2e club_publish_blockers on a deleted club was not P0002 (%)', v_state;
  END IF;
  v_json := public.club_publish_blockers('00000000-0000-0000-0000-000002418002');
  IF jsonb_typeof(v_json) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'FAIL 2f club_publish_blockers on a live club answered %', v_json;
  END IF;

  -- club_first_show_state
  v_state := NULL;
  BEGIN
    PERFORM public.club_first_show_state('00000000-0000-0000-0000-000002418003');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  IF v_state IS DISTINCT FROM 'P0002' THEN
    RAISE EXCEPTION 'FAIL 2g club_first_show_state on a deleted club was not P0002 (%)', v_state;
  END IF;
  v_json := public.club_first_show_state('00000000-0000-0000-0000-000002418002');
  IF v_json -> 'published_ever' IS DISTINCT FROM 'false'::jsonb THEN
    RAISE EXCEPTION 'FAIL 2h club_first_show_state on a live club answered %', v_json;
  END IF;
  RAISE NOTICE 'PASS 2 soft-deleted club and show read as not found';
END;
$$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 3. Covering foreign-key indexes
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
    WHERE i.indrelid = 'public.class_judge_departures'::regclass AND a.attname = 'resolved_judge_id'
  ) THEN
    RAISE EXCEPTION 'FAIL 3a class_judge_departures.resolved_judge_id has no leading index';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
    WHERE i.indrelid = 'public.platform_settings'::regclass
      AND a.attname = 'payouts_require_approval_changed_by'
  ) THEN
    RAISE EXCEPTION 'FAIL 3b platform_settings.payouts_require_approval_changed_by has no leading index';
  END IF;
  RAISE NOTICE 'PASS 3 foreign-key indexes exist';
END;
$$;

ROLLBACK;
