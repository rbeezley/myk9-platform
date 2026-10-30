-- Behavioral test for 20261028024100_myk9_1460_timezone_names_snapshot.sql
-- (MYK9-1460).
--
-- Run against a database where all migrations are applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/myk9_1460_timezone_names_snapshot_test.sql
-- All fixtures roll back.
--
-- pg_catalog.pg_timezone_names reads every zone file on disk per query (about
-- 60 ms), and five SECURITY DEFINER functions validated a zone against it, three
-- of them per row. They now read public.timezone_names, an indexed snapshot of
-- the same names. Properties asserted here:
--   T1  The snapshot holds exactly the view's names (none missing, none extra).
--   T2  No public function body reads pg_timezone_names any more.
--   T3  Lookup semantics are unchanged: a valid IANA name matches; an invalid
--       name, a NULL and a wrong-case name do not (they fall back to
--       America/New_York in every caller, exactly as before).
--   T4  waitlist_class_trial_has_passed still applies that fallback: a class
--       whose trial's zone is unrecognized is judged on the New York calendar
--       day (yesterday passed, tomorrow not), as before the change.
--   T5  The table is closed to API roles: RLS enabled and forced, no anon or
--       authenticated privilege; service_role keeps its default grant, like
--       the other RPC-owned tables.
--   T6  The five rewritten functions are still SECURITY DEFINER with
--       search_path '' (the copy carried them over).

BEGIN;

DO $$
DECLARE
  v_missing int;
  v_extra int;
BEGIN
  SELECT count(*) INTO v_missing FROM (
    SELECT name FROM pg_catalog.pg_timezone_names EXCEPT SELECT name FROM public.timezone_names
  ) d;
  SELECT count(*) INTO v_extra FROM (
    SELECT name FROM public.timezone_names EXCEPT SELECT name FROM pg_catalog.pg_timezone_names
  ) d;
  IF v_missing <> 0 OR v_extra <> 0 THEN
    RAISE EXCEPTION 'FAIL T1: snapshot differs from pg_timezone_names (missing %, extra %)', v_missing, v_extra;
  END IF;
  IF (SELECT count(*) FROM public.timezone_names) < 400 THEN
    RAISE EXCEPTION 'FAIL T1: snapshot is implausibly small (% names)', (SELECT count(*) FROM public.timezone_names);
  END IF;
  RAISE NOTICE 'PASS T1 snapshot matches pg_timezone_names';
END
$$;

DO $$
DECLARE
  v_readers text;
BEGIN
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_readers
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND pg_get_functiondef(p.oid) ILIKE '%pg_timezone_names%';
  IF v_readers IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL T2: still reading pg_timezone_names: %', v_readers;
  END IF;
  RAISE NOTICE 'PASS T2 no public function reads pg_timezone_names';
END
$$;

DO $$
BEGIN
  IF (SELECT n.name FROM public.timezone_names n WHERE n.name = 'America/Chicago') IS DISTINCT FROM 'America/Chicago' THEN
    RAISE EXCEPTION 'FAIL T3: a valid zone did not match';
  END IF;
  IF EXISTS (SELECT 1 FROM public.timezone_names n WHERE n.name = 'Not/AZone')
     OR EXISTS (SELECT 1 FROM public.timezone_names n WHERE n.name = NULL)
     OR EXISTS (SELECT 1 FROM public.timezone_names n WHERE n.name = 'america/chicago') THEN
    RAISE EXCEPTION 'FAIL T3: an invalid, NULL or wrong-case zone matched';
  END IF;
  RAISE NOTICE 'PASS T3 lookup semantics unchanged';
END
$$;

-- T4 fixtures: one show whose only trial carries an unrecognized zone, with a
-- class on a trial dated yesterday and one dated tomorrow (New York calendar).
INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000146001', 'MYK9-1460 Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          accept_check_payments, accept_cash_payments)
VALUES ('00000000-0000-0000-0000-000000146011', 'MYK9-1460 Bad Zone Show', 'AKC',
        ((now() AT TIME ZONE 'America/New_York')::date - 1),
        ((now() AT TIME ZONE 'America/New_York')::date + 1),
        '00000000-0000-0000-0000-000000146001', 'published', true, true);

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone)
VALUES
  ('00000000-0000-0000-0000-000000146021', '00000000-0000-0000-0000-000000146011',
   'MYK9-1460 Yesterday', ((now() AT TIME ZONE 'America/New_York')::date - 1), 'AKC', 'Scent Work', 'Not/AZone'),
  ('00000000-0000-0000-0000-000000146022', '00000000-0000-0000-0000-000000146011',
   'MYK9-1460 Tomorrow', ((now() AT TIME ZONE 'America/New_York')::date + 1), 'AKC', 'Scent Work', 'Not/AZone');

INSERT INTO public.classes (id, trial_id, name, status, status_source, max_entries, allow_waitlist)
VALUES
  ('00000000-0000-0000-0000-000000146031', '00000000-0000-0000-0000-000000146021', 'MYK9-1460 Past', 'upcoming', 'derived', 2, true),
  ('00000000-0000-0000-0000-000000146032', '00000000-0000-0000-0000-000000146022', 'MYK9-1460 Future', 'upcoming', 'derived', 2, true);

DO $$
BEGIN
  IF public.waitlist_class_trial_has_passed('00000000-0000-0000-0000-000000146031') IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL T4: a trial dated yesterday (New York fallback) was not judged passed';
  END IF;
  IF public.waitlist_class_trial_has_passed('00000000-0000-0000-0000-000000146032') IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL T4: a trial dated tomorrow (New York fallback) was judged passed';
  END IF;
  RAISE NOTICE 'PASS T4 unrecognized zone falls back to America/New_York';
END
$$;

DO $$
DECLARE
  v_rls boolean;
BEGIN
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = 'public.timezone_names'::regclass;
  IF NOT v_rls THEN
    RAISE EXCEPTION 'FAIL T5: RLS is off on public.timezone_names';
  END IF;
  IF has_table_privilege('anon', 'public.timezone_names', 'SELECT, INSERT, UPDATE, DELETE')
     OR has_table_privilege('authenticated', 'public.timezone_names', 'SELECT, INSERT, UPDATE, DELETE') THEN
    RAISE EXCEPTION 'FAIL T5: an API role holds a privilege on public.timezone_names';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.timezone_names', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL T5: service_role cannot read public.timezone_names';
  END IF;
  IF NOT (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.timezone_names'::regclass) THEN
    RAISE EXCEPTION 'FAIL T5: RLS is not forced on public.timezone_names';
  END IF;
  RAISE NOTICE 'PASS T5 table closed to API roles';
END
$$;

DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO v_bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('waitlist_class_trial_has_passed', 'send_waitlist_offer_message_internal',
                      'get_account_today_entries_at', 'create_show_with_children', 'submit_show_entries')
    AND (NOT p.prosecdef OR NOT coalesce(p.proconfig, '{}') @> ARRAY['search_path=""']);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL T6: lost SECURITY DEFINER or search_path: %', v_bad;
  END IF;
  RAISE NOTICE 'PASS T6 rewritten functions keep SECURITY DEFINER and search_path';
END
$$;

ROLLBACK;
