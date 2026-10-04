-- MYK9-952: demo fixture clubs stay off the signed-out public listings.
--
-- 20261004152700 adds clubs.is_demo and a write guard. The signed-out listings
-- apply it in their PostgREST reads:
--   * Find Shows (postgrestGetPublicShows):
--       shows?select=*,club:clubs!inner(...)&club.is_demo=eq.false
--       &status=in.(published,upcoming,in_progress,completed)&deleted_at=is.null
--     which PostgREST runs as an inner join on clubs under anon's RLS;
--   * the guest club directory (getPublicDirectoryClubs):
--       clubs?deleted_at=is.null&is_demo=eq.false
-- This file runs those exact predicates AS anon, so it proves what the
-- client's query gets back, plus what must NOT change: anon still opens a demo
-- show and club by id (direct links, banner-sticky-cta.spec.ts), signed-in
-- reads are untouched, and real clubs' shows still list.
--
-- Run with psql -X -v ON_ERROR_STOP=1 after migrations; everything rolls back.
-- Identity fixtures follow club_authorization_gate_test.sql: the people row
-- goes in first with the address, then auth.users, and handle_new_user()
-- adopts it.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Column shape
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_not_null boolean;
  v_default text;
BEGIN
  SELECT a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
    INTO v_not_null, v_default
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE a.attrelid = 'public.clubs'::regclass
     AND a.attname = 'is_demo'
     AND NOT a.attisdropped;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL column: clubs.is_demo does not exist';
  END IF;
  IF NOT v_not_null OR v_default IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'FAIL column: clubs.is_demo must be NOT NULL DEFAULT false (not_null=%, default=%)',
      v_not_null, v_default;
  END IF;
  RAISE NOTICE 'PASS column: clubs.is_demo NOT NULL DEFAULT false';
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (as the migration/seed session: a non-API role, so the flag is
-- writable). A demo club and an authorized real club, each hosting one
-- published show. The demo club is unauthorized, like Heartland on live: anon
-- sees it only through clubs_select's club_has_public_show branch, which is
-- exactly the path the inner club embed depends on.
-- ---------------------------------------------------------------------------
INSERT INTO public.clubs (id, name, authorized_at, is_demo) VALUES
  ('00000000-0000-0000-0000-000000952001', 'MYK9-952 Demo Club', NULL, true),
  ('00000000-0000-0000-0000-000000952002', 'MYK9-952 Real Club', now(), false);

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status) VALUES
  ('00000000-0000-0000-0000-000000952010', 'MYK9-952 Demo Show', 'AKC',
   current_date + 30, current_date + 31, '00000000-0000-0000-0000-000000952001', 'published'),
  ('00000000-0000-0000-0000-000000952011', 'MYK9-952 Real Show', 'AKC',
   current_date + 30, current_date + 31, '00000000-0000-0000-0000-000000952002', 'published');

DO $$
BEGIN
  IF (SELECT is_demo FROM public.clubs WHERE id = '00000000-0000-0000-0000-000000952001') IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL wiring: a non-API session could not set is_demo = true';
  END IF;
  RAISE NOTICE 'PASS seed-session-sets-flag: a non-API session writes is_demo';
END;
$$;

-- A club admin of the DEMO club, for the write-guard cases.
DO $$
DECLARE
  v_auth uuid := gen_random_uuid();
  v_person uuid := gen_random_uuid();
  v_role_id uuid;
BEGIN
  SELECT id INTO v_role_id FROM public.roles WHERE name = 'club_admin';
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'FAIL wiring: club_admin role missing';
  END IF;

  INSERT INTO public.people (id, auth_user_id, first_name, last_name, email)
  VALUES (v_person, NULL, 'MYK9-952', 'DemoAdmin', 'myk9952-admin@example.test');

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    is_super_admin, is_sso_user, is_anonymous
  )
  VALUES (
    v_auth, '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'myk9952-admin@example.test', '', now(),
    now(), now(), '{}', '{}', false, false, false
  );

  IF (SELECT auth_user_id FROM public.people WHERE id = v_person) IS DISTINCT FROM v_auth THEN
    RAISE EXCEPTION 'FAIL wiring: handle_new_user() did not adopt the club admin fixture';
  END IF;

  INSERT INTO public.user_roles (user_id, role_id, club_id, show_id, is_active, granted_at, granted_by, auth_user_id)
  VALUES (v_person, v_role_id, '00000000-0000-0000-0000-000000952001', NULL, true, now(), v_person, v_auth);

  PERFORM set_config('myk9952.admin_auth', v_auth::text, false);
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. anon: the Find Shows listing leaves the demo show out, keeps the real one
-- ---------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);

DO $$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(s.id ORDER BY s.name) INTO v_ids
    FROM public.shows s
    JOIN public.clubs c ON c.id = s.club_id
   WHERE s.id IN ('00000000-0000-0000-0000-000000952010', '00000000-0000-0000-0000-000000952011')
     AND s.status IN ('published', 'upcoming', 'in_progress', 'completed')
     AND s.deleted_at IS NULL
     AND c.is_demo = false;

  IF v_ids IS DISTINCT FROM ARRAY['00000000-0000-0000-0000-000000952011'::uuid] THEN
    RAISE EXCEPTION 'FAIL anon-find-shows: listing returned %, expected only the real show', v_ids;
  END IF;
  RAISE NOTICE 'PASS anon-find-shows: demo show unlisted, real show listed';
END;
$$;

-- 1b. The same listing WITHOUT the demo predicate returns both: the exclusion
-- above is the flag's doing, not RLS hiding the demo club from the join.
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.shows s
    JOIN public.clubs c ON c.id = s.club_id
   WHERE s.id IN ('00000000-0000-0000-0000-000000952010', '00000000-0000-0000-0000-000000952011')
     AND s.status IN ('published', 'upcoming', 'in_progress', 'completed')
     AND s.deleted_at IS NULL;

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'FAIL anon-join-control: inner club join returned % of 2 shows without the flag filter', v_count;
  END IF;
  RAISE NOTICE 'PASS anon-join-control: both clubs join for anon; only the flag excludes';
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. anon: a direct link still opens the demo show and its club
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.shows WHERE id = '00000000-0000-0000-0000-000000952010') THEN
    RAISE EXCEPTION 'FAIL anon-direct-show: anon cannot read the demo show by id';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clubs
     WHERE id = '00000000-0000-0000-0000-000000952001' AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'FAIL anon-direct-club: anon cannot read the demo club by id';
  END IF;
  RAISE NOTICE 'PASS anon-direct-link: demo show and club readable by id';
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. anon: the guest club directory leaves the demo club out
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(id ORDER BY name) INTO v_ids
    FROM public.clubs
   WHERE id IN ('00000000-0000-0000-0000-000000952001', '00000000-0000-0000-0000-000000952002')
     AND deleted_at IS NULL
     AND is_demo = false;

  IF v_ids IS DISTINCT FROM ARRAY['00000000-0000-0000-0000-000000952002'::uuid] THEN
    RAISE EXCEPTION 'FAIL anon-directory: directory returned %, expected only the real club', v_ids;
  END IF;
  RAISE NOTICE 'PASS anon-directory: demo club unlisted, real club listed';
END;
$$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- 4. authenticated: signed-in reads are unchanged (the replica syncs through
--    shows_select / clubs_select), and the demo club's own admin reaches it
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('myk9952.admin_auth'), true);
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('myk9952.admin_auth'), 'role', 'authenticated')::text, true);

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.shows
   WHERE id IN ('00000000-0000-0000-0000-000000952010', '00000000-0000-0000-0000-000000952011')
     AND status IN ('published', 'upcoming', 'in_progress', 'completed')
     AND deleted_at IS NULL;

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'FAIL authenticated-reads: a signed-in session sees % of 2 published shows', v_count;
  END IF;
  RAISE NOTICE 'PASS authenticated-reads: signed-in session still sees the demo show';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Write guard: an API role never changes the flag
-- ---------------------------------------------------------------------------
-- 5a. The demo club's own admin cannot clear it (clubs_update admits them).
DO $$
BEGIN
  BEGIN
    UPDATE public.clubs SET is_demo = false
     WHERE id = '00000000-0000-0000-0000-000000952001';
    RAISE EXCEPTION 'FAIL guard-update: a club admin cleared is_demo';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS guard-update: club admin clearing is_demo refused (42501)';
  END;
END;
$$;

-- 5b. The guard blocks only the flag: the same admin's ordinary edit lands.
DO $$
DECLARE
  v_city text;
BEGIN
  UPDATE public.clubs SET city = 'MYK9-952 City'
   WHERE id = '00000000-0000-0000-0000-000000952001'
  RETURNING city INTO v_city;

  IF v_city IS DISTINCT FROM 'MYK9-952 City' THEN
    RAISE EXCEPTION 'FAIL guard-scope: an ordinary club edit did not land (city = %)', v_city;
  END IF;
  RAISE NOTICE 'PASS guard-scope: ordinary club edits are unaffected';
END;
$$;

-- 5c. A new club from an API role is never a demo club, whatever it sends.
DO $$
DECLARE
  v_is_demo boolean;
BEGIN
  INSERT INTO public.clubs (id, name, is_demo)
  VALUES ('00000000-0000-0000-0000-000000952003', 'MYK9-952 Self-hidden Club', true)
  RETURNING is_demo INTO v_is_demo;

  IF v_is_demo IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL guard-insert: an API-role INSERT kept is_demo = %', v_is_demo;
  END IF;
  RAISE NOTICE 'PASS guard-insert: API-role INSERT forced to is_demo = false';
END;
$$;

RESET ROLE;

-- 5d. And the flag survived 5a.
DO $$
BEGIN
  IF (SELECT is_demo FROM public.clubs WHERE id = '00000000-0000-0000-0000-000000952001') IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL guard-persist: the demo flag did not survive the refused UPDATE';
  END IF;
  RAISE NOTICE 'PASS guard-persist: demo flag intact';
END;
$$;

ROLLBACK;
