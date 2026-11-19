-- MYK9-2199: the durable "first show published" record and its RPC
-- (20261120010900_myk9_2199_club_first_show_published.sql).
--
--   0. Wiring: club_first_show_state is open to authenticated only; the trigger
--      function is closed to API roles.
--   1. Trigger: the first public status stamps the club; a later unpublish keeps
--      it; a second publish does not move it; an INSERT already public stamps;
--      a draft stamps nothing; a status change among public statuses is fine.
--   2. Backfill: the migration's statement stamps a club that has a public show
--      with the earliest created_at, and leaves a draft-only club null.
--   3. RPC as the club admin: published_ever follows the stamp; draft_show_id is
--      the newest non-deleted draft (a soft-deleted newer draft is skipped; null
--      when the club has none).
--   4. RPC authorization: an outsider is refused with 42501.
--   5. Trigger through the real path: an authenticated club admin's publish
--      (passing enforce_show_publish_gate) stamps the club, though the admin
--      cannot write clubs.first_show_published_at herself.
--   6. RPC edges: NULL club (22023), unknown club (P0002, reachable only past
--      the authorization check, so as a site admin), a club trial secretary and
--      a site admin allowed, anon refused (42501).
--
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations. All fixtures roll back.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.club_first_show_state(uuid)') IS NULL THEN
    RAISE EXCEPTION 'FAIL 0 club_first_show_state is missing';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.club_first_show_state(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.club_first_show_state(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 0 club_first_show_state is not authenticated-only';
  END IF;
  IF has_function_privilege('authenticated', 'private.stamp_club_first_show_published()', 'EXECUTE')
     OR has_function_privilege('anon', 'private.stamp_club_first_show_published()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL 0 an API role can execute the stamp trigger function';
  END IF;
  RAISE NOTICE 'PASS 0 wiring';
END;
$$;

-- Clubs: 001 publishes, 002 inserts already public, 003 draft only, 004 backfill,
-- 005 backfill-negative (draft only), 006 has no draft at all.
INSERT INTO public.clubs (id, name, authorized_at) VALUES
  ('00000000-0000-0000-0000-000002199001', 'MYK9-2199 Publishes', now()),
  ('00000000-0000-0000-0000-000002199002', 'MYK9-2199 Inserts Public', now()),
  ('00000000-0000-0000-0000-000002199003', 'MYK9-2199 Draft Only', now()),
  ('00000000-0000-0000-0000-000002199004', 'MYK9-2199 Backfill', now()),
  ('00000000-0000-0000-0000-000002199005', 'MYK9-2199 Backfill Draft', now()),
  ('00000000-0000-0000-0000-000002199006', 'MYK9-2199 No Shows', now()),
  ('00000000-0000-0000-0000-000002199007', 'MYK9-2199 Receives Host', now()),
  ('00000000-0000-0000-0000-000002199008', 'MYK9-2199 Admin Publishes', now());

-- Club 008 can pass enforce_show_publish_gate: approved (above), payouts enabled in the
-- platform's mode (pinned to test mode, as show_publish_gate_trigger_test.sql does), and a
-- draft show with an entry window and its own premium (copied from the 2197 fixtures).
SET LOCAL ROLE service_role;
UPDATE public.platform_settings SET stripe_livemode = false WHERE id = true;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);

INSERT INTO public.club_stripe_accounts (club_id, stripe_account_id, onboarding_complete, payouts_enabled, livemode)
VALUES ('00000000-0000-0000-0000-000002199008', 'acct_myk92199_ready', true, true, false);

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date, online_entries_enabled,
                          publishes_own_premium)
VALUES ('00000000-0000-0000-0000-000002199801', 'MYK9-2199 Admin Publish', 'UKC',
        current_date + 5, current_date + 6, '00000000-0000-0000-0000-000002199008', 'draft',
        (current_date - 10)::timestamptz, (current_date + 4)::timestamptz, true,
        true);

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status, created_at) VALUES
  ('00000000-0000-0000-0000-000002199101', 'MYK9-2199 A', 'UKC', current_date + 5, current_date + 6,
   '00000000-0000-0000-0000-000002199001', 'draft', now() - interval '3 days'),
  ('00000000-0000-0000-0000-000002199102', 'MYK9-2199 A2', 'UKC', current_date + 7, current_date + 8,
   '00000000-0000-0000-0000-000002199001', 'draft', now() - interval '2 days'),
  -- club 003: an older draft, a newer draft, and a newest but soft-deleted draft
  ('00000000-0000-0000-0000-000002199301', 'MYK9-2199 C old', 'UKC', current_date + 5, current_date + 6,
   '00000000-0000-0000-0000-000002199003', 'draft', now() - interval '5 days'),
  ('00000000-0000-0000-0000-000002199302', 'MYK9-2199 C new', 'UKC', current_date + 5, current_date + 6,
   '00000000-0000-0000-0000-000002199003', 'draft', now() - interval '4 days'),
  ('00000000-0000-0000-0000-000002199303', 'MYK9-2199 C deleted', 'UKC', current_date + 5, current_date + 6,
   '00000000-0000-0000-0000-000002199003', 'draft', now() - interval '1 day'),
  ('00000000-0000-0000-0000-000002199501', 'MYK9-2199 E', 'UKC', current_date + 5, current_date + 6,
   '00000000-0000-0000-0000-000002199005', 'draft', now() - interval '1 day');
UPDATE public.shows SET deleted_at = now() WHERE id = '00000000-0000-0000-0000-000002199303';

-- ---------------------------------------------------------------------------
-- 1. Trigger
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_stamp timestamptz;
BEGIN
  IF (SELECT count(*) FROM public.clubs WHERE name LIKE 'MYK9-2199 %' AND first_show_published_at IS NOT NULL) <> 0 THEN
    RAISE EXCEPTION 'FAIL 1a a draft stamped a club';
  END IF;

  UPDATE public.shows SET status = 'published' WHERE id = '00000000-0000-0000-0000-000002199101';
  SELECT first_show_published_at INTO v_stamp FROM public.clubs
   WHERE id = '00000000-0000-0000-0000-000002199001';
  IF v_stamp IS NULL THEN
    RAISE EXCEPTION 'FAIL 1b the first publish did not stamp the club';
  END IF;

  -- Pin the stamp to a past value so "kept" and "not moved" are observable.
  UPDATE public.clubs SET first_show_published_at = '2020-01-01 00:00:00+00'
   WHERE id = '00000000-0000-0000-0000-000002199001';

  UPDATE public.shows SET status = 'draft' WHERE id = '00000000-0000-0000-0000-000002199101';
  IF (SELECT first_show_published_at FROM public.clubs WHERE id = '00000000-0000-0000-0000-000002199001')
       IS DISTINCT FROM '2020-01-01 00:00:00+00'::timestamptz THEN
    RAISE EXCEPTION 'FAIL 1c unpublishing cleared or moved the stamp';
  END IF;

  UPDATE public.shows SET status = 'published' WHERE id = '00000000-0000-0000-0000-000002199102';
  UPDATE public.shows SET status = 'in_progress' WHERE id = '00000000-0000-0000-0000-000002199102';
  IF (SELECT first_show_published_at FROM public.clubs WHERE id = '00000000-0000-0000-0000-000002199001')
       IS DISTINCT FROM '2020-01-01 00:00:00+00'::timestamptz THEN
    RAISE EXCEPTION 'FAIL 1d a later publish moved the stamp';
  END IF;

  INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
  VALUES ('00000000-0000-0000-0000-000002199201', 'MYK9-2199 B', 'UKC', current_date + 5, current_date + 6,
          '00000000-0000-0000-0000-000002199002', 'published');
  IF (SELECT first_show_published_at FROM public.clubs WHERE id = '00000000-0000-0000-0000-000002199002') IS NULL THEN
    RAISE EXCEPTION 'FAIL 1e an INSERT already public did not stamp the club';
  END IF;

  IF (SELECT first_show_published_at FROM public.clubs WHERE id = '00000000-0000-0000-0000-000002199003') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 1f a club with only drafts was stamped';
  END IF;
  -- 1g: a host-only change on a public show stamps the receiving club and
  -- leaves the original club's stamp alone.
  UPDATE public.shows SET club_id = '00000000-0000-0000-0000-000002199007'
   WHERE id = '00000000-0000-0000-0000-000002199201';
  IF (SELECT first_show_published_at FROM public.clubs WHERE id = '00000000-0000-0000-0000-000002199007') IS NULL THEN
    RAISE EXCEPTION 'FAIL 1g moving a public show to another host did not stamp the receiving club';
  END IF;
  IF (SELECT first_show_published_at FROM public.clubs WHERE id = '00000000-0000-0000-0000-000002199002') IS NULL THEN
    RAISE EXCEPTION 'FAIL 1g moving a public show away cleared the original club''s stamp';
  END IF;
  RAISE NOTICE 'PASS 1 trigger stamps once, never clears, ignores drafts, follows a host change';
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Backfill (the migration's statement, run against a fixture)
-- ---------------------------------------------------------------------------
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status, created_at) VALUES
  ('00000000-0000-0000-0000-000002199401', 'MYK9-2199 D late', 'UKC', current_date + 5, current_date + 6,
   '00000000-0000-0000-0000-000002199004', 'completed', '2025-06-01 00:00:00+00'),
  ('00000000-0000-0000-0000-000002199402', 'MYK9-2199 D early', 'UKC', current_date + 5, current_date + 6,
   '00000000-0000-0000-0000-000002199004', 'published', '2025-03-01 00:00:00+00');
UPDATE public.clubs SET first_show_published_at = NULL
 WHERE id IN ('00000000-0000-0000-0000-000002199004', '00000000-0000-0000-0000-000002199005');

UPDATE public.clubs c
   SET first_show_published_at = s.first_at
  FROM (
    SELECT sh.club_id, min(sh.created_at) AS first_at
      FROM public.shows sh
     WHERE private.show_status_is_public(sh.status)
     GROUP BY sh.club_id
  ) s
 WHERE c.id = s.club_id
   AND c.first_show_published_at IS NULL;

DO $$
BEGIN
  IF (SELECT first_show_published_at FROM public.clubs WHERE id = '00000000-0000-0000-0000-000002199004')
       IS DISTINCT FROM '2025-03-01 00:00:00+00'::timestamptz THEN
    RAISE EXCEPTION 'FAIL 2a backfill did not use the earliest public show';
  END IF;
  IF (SELECT first_show_published_at FROM public.clubs WHERE id = '00000000-0000-0000-0000-000002199005') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 2b backfill stamped a draft-only club';
  END IF;
  RAISE NOTICE 'PASS 2 backfill';
END;
$$;

-- ---------------------------------------------------------------------------
-- People and roles
-- ---------------------------------------------------------------------------
INSERT INTO public.people (id, first_name, last_name, email) VALUES
  ('00000000-0000-0000-0000-000002199011', 'MYK9-2199', 'ClubAdmin', 'myk9-2199-admin@example.test'),
  ('00000000-0000-0000-0000-000002199012', 'MYK9-2199', 'Outsider', 'myk9-2199-outsider@example.test'),
  ('00000000-0000-0000-0000-000002199013', 'MYK9-2199', 'TrialSecretary', 'myk9-2199-secretary@example.test'),
  ('00000000-0000-0000-0000-000002199014', 'MYK9-2199', 'SiteAdmin', 'myk9-2199-siteadmin@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000002199021', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-2199-admin@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000002199022', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-2199-outsider@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000002199023', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-2199-secretary@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000002199024', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-2199-siteadmin@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000002199021'
 WHERE id = '00000000-0000-0000-0000-000002199011';
UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000002199022'
 WHERE id = '00000000-0000-0000-0000-000002199012';
UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000002199023'
 WHERE id = '00000000-0000-0000-0000-000002199013';
UPDATE public.people SET auth_user_id = '00000000-0000-0000-0000-000002199024'
 WHERE id = '00000000-0000-0000-0000-000002199014';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000002199011', roles.id, club.id, true,
       '00000000-0000-0000-0000-000002199021'
FROM public.roles
CROSS JOIN (SELECT id FROM public.clubs WHERE name LIKE 'MYK9-2199 %') AS club(id)
WHERE roles.name = 'club_admin';

-- A club trial secretary of club 006 only, and a site admin (no club).
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000002199013', roles.id,
       '00000000-0000-0000-0000-000002199006', true,
       '00000000-0000-0000-0000-000002199023'
FROM public.roles WHERE roles.name = 'secretary';

INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000002199014', roles.id, true,
       '00000000-0000-0000-0000-000002199024'
FROM public.roles WHERE roles.name = 'site_admin';

-- ---------------------------------------------------------------------------
-- 3. RPC as the club admin
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  admin_auth CONSTANT uuid := '00000000-0000-0000-0000-000002199021';
  v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', admin_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', admin_auth, 'role', 'authenticated')::text, true);

  -- Club 001: stamped; its only remaining draft is show 101 (102 is in progress).
  v := public.club_first_show_state('00000000-0000-0000-0000-000002199001');
  IF v IS DISTINCT FROM jsonb_build_object('published_ever', true,
       'draft_show_id', '00000000-0000-0000-0000-000002199101') THEN
    RAISE EXCEPTION 'FAIL 3a published club with a draft answered %', v;
  END IF;

  -- Club 003: never published; newest NON-DELETED draft is 302.
  v := public.club_first_show_state('00000000-0000-0000-0000-000002199003');
  IF v IS DISTINCT FROM jsonb_build_object('published_ever', false,
       'draft_show_id', '00000000-0000-0000-0000-000002199302') THEN
    RAISE EXCEPTION 'FAIL 3b draft-only club answered %', v;
  END IF;

  -- Club 006: no shows at all.
  v := public.club_first_show_state('00000000-0000-0000-0000-000002199006');
  IF v IS DISTINCT FROM jsonb_build_object('published_ever', false, 'draft_show_id', NULL) THEN
    RAISE EXCEPTION 'FAIL 3c show-less club answered %', v;
  END IF;

  -- Club 002: published with no draft.
  v := public.club_first_show_state('00000000-0000-0000-0000-000002199002');
  IF v IS DISTINCT FROM jsonb_build_object('published_ever', true, 'draft_show_id', NULL) THEN
    RAISE EXCEPTION 'FAIL 3d published club without a draft answered %', v;
  END IF;
  RAISE NOTICE 'PASS 3 club_first_show_state answers per club';
END;
$$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 4. Authorization
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  outsider_auth CONSTANT uuid := '00000000-0000-0000-0000-000002199022';
  v_state text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', outsider_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', outsider_auth, 'role', 'authenticated')::text, true);

  v_state := NULL;
  BEGIN
    PERFORM public.club_first_show_state('00000000-0000-0000-0000-000002199001');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  IF v_state IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'FAIL 4 an outsider read a club''s first-show state (%)', v_state;
  END IF;
  RAISE NOTICE 'PASS 4 an outsider is refused';
END;
$$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 5. Trigger through the real path: an authenticated club admin publishes
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  admin_auth CONSTANT uuid := '00000000-0000-0000-0000-000002199021';
  v_rows int;
  v_stamp timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', admin_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', admin_auth, 'role', 'authenticated')::text, true);

  UPDATE public.shows SET status = 'published'
   WHERE id = '00000000-0000-0000-0000-000002199801';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'FAIL 5a the club admin''s publish affected % rows (the publish gate or RLS refused it)', v_rows;
  END IF;

  SELECT first_show_published_at INTO v_stamp FROM public.clubs
   WHERE id = '00000000-0000-0000-0000-000002199008';
  IF v_stamp IS NULL THEN
    RAISE EXCEPTION 'FAIL 5b an authenticated club admin''s publish did not stamp the club';
  END IF;
  RAISE NOTICE 'PASS 5 a club admin''s publish stamps the club';
END;
$$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 6. RPC edges
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  admin_auth CONSTANT uuid := '00000000-0000-0000-0000-000002199021';
  secretary_auth CONSTANT uuid := '00000000-0000-0000-0000-000002199023';
  site_admin_auth CONSTANT uuid := '00000000-0000-0000-0000-000002199024';
  v_state text;
  v jsonb;
BEGIN
  -- 6a: NULL club -> 22023 (checked before authorization).
  PERFORM set_config('request.jwt.claim.sub', admin_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', admin_auth, 'role', 'authenticated')::text, true);
  v_state := NULL;
  BEGIN
    PERFORM public.club_first_show_state(NULL);
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  IF v_state IS DISTINCT FROM '22023' THEN
    RAISE EXCEPTION 'FAIL 6a a NULL club answered with % (expected 22023)', v_state;
  END IF;

  -- 6b: a club trial secretary of club 006 is allowed.
  PERFORM set_config('request.jwt.claim.sub', secretary_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', secretary_auth, 'role', 'authenticated')::text, true);
  v := public.club_first_show_state('00000000-0000-0000-0000-000002199006');
  IF v IS DISTINCT FROM jsonb_build_object('published_ever', false, 'draft_show_id', NULL) THEN
    RAISE EXCEPTION 'FAIL 6b a club trial secretary was answered %', v;
  END IF;

  -- 6c: the same secretary is refused another club (the allowance is per club).
  v_state := NULL;
  BEGIN
    PERFORM public.club_first_show_state('00000000-0000-0000-0000-000002199001');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  IF v_state IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'FAIL 6c a club trial secretary read another club (%)', v_state;
  END IF;

  -- 6d: a site admin is allowed, and sees an unknown club as P0002.
  PERFORM set_config('request.jwt.claim.sub', site_admin_auth::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', site_admin_auth, 'role', 'authenticated')::text, true);
  v := public.club_first_show_state('00000000-0000-0000-0000-000002199001');
  IF v IS DISTINCT FROM jsonb_build_object('published_ever', true,
       'draft_show_id', '00000000-0000-0000-0000-000002199101') THEN
    RAISE EXCEPTION 'FAIL 6d a site admin was answered %', v;
  END IF;

  v_state := NULL;
  BEGIN
    PERFORM public.club_first_show_state('00000000-0000-0000-0000-000002199999');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  IF v_state IS DISTINCT FROM 'P0002' THEN
    RAISE EXCEPTION 'FAIL 6e an unknown club answered with % (expected P0002)', v_state;
  END IF;
  RAISE NOTICE 'PASS 6 NULL club, trial secretary, site admin and unknown club';
END;
$$;

RESET ROLE;

SET LOCAL ROLE anon;

DO $$
DECLARE
  v_state text := NULL;
BEGIN
  BEGIN
    PERFORM public.club_first_show_state('00000000-0000-0000-0000-000002199001');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  IF v_state IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'FAIL 6f anon was not refused (%)', v_state;
  END IF;
  RAISE NOTICE 'PASS 6f anon is refused';
END;
$$;

RESET ROLE;

ROLLBACK;
