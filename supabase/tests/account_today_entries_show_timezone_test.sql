-- Behavioral test for 20261024163700_myk9_1354_account_today_entries_show_timezone.sql
-- (MYK9-1354).
--
-- Run against a database where all migrations are applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/account_today_entries_show_timezone_test.sql
-- All fixtures roll back.
--
-- get_account_today_entries() used the database's current_date (UTC) against
-- show-local start_date/end_date. "Today" is now the show-local date of the
-- show's primary trial timezone (America/New_York when missing or
-- unrecognized). get_account_today_entries_at(p_at) takes the instant
-- explicitly so both edges are testable; it is not granted to client roles, so
-- the call runs as the owner while request.jwt.claim.sub drives auth.uid().
--
-- Covers, for an America/Los_Angeles show running 2026-11-07..2026-11-08:
--   evening before day 1 (UTC date already day 1)  -> 0 rows
--   day 1 morning                                  -> 1 row
--   evening of the last day (UTC date already past) -> 1 row
--   after local midnight following the last day    -> 0 rows
-- and the New York fallback for a show whose trial has an unrecognized zone.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000135401', 'MYK9-1354 Club');

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES (
  '00000000-0000-0000-0000-000000135411', 'Today', 'Exhibitor',
  '00000000-0000-0000-0000-000000135421'
);

INSERT INTO public.dogs (id, name, call_name, breed, status)
VALUES ('00000000-0000-0000-0000-000000135431', 'MYK9-1354 Dog', 'Clock', 'Beagle', 'active');

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
VALUES ('00000000-0000-0000-0000-000000135431', 'AKC', 'SR1354001', true);

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          accept_check_payments, accept_cash_payments)
VALUES
  ('00000000-0000-0000-0000-000000135441', 'MYK9-1354 LA Show', 'AKC',
   '2026-11-07', '2026-11-08', '00000000-0000-0000-0000-000000135401',
   'published', true, true),
  ('00000000-0000-0000-0000-000000135442', 'MYK9-1354 Bad Zone Show', 'AKC',
   '2026-11-07', '2026-11-08', '00000000-0000-0000-0000-000000135401',
   'published', true, true);

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type, timezone)
VALUES
  ('00000000-0000-0000-0000-000000135451', '00000000-0000-0000-0000-000000135441',
   'MYK9-1354 LA Trial', '2026-11-07', 'AKC', 'Scent Work', 'America/Los_Angeles'),
  ('00000000-0000-0000-0000-000000135452', '00000000-0000-0000-0000-000000135442',
   'MYK9-1354 Bad Zone Trial', '2026-11-07', 'AKC', 'Scent Work', 'Not/AZone');

INSERT INTO public.entries (id, dog_id, handler_id, show_id, trial_id, entry_status)
VALUES
  ('00000000-0000-0000-0000-000000135461', '00000000-0000-0000-0000-000000135431',
   '00000000-0000-0000-0000-000000135411', '00000000-0000-0000-0000-000000135441',
   '00000000-0000-0000-0000-000000135451', 'confirmed'),
  ('00000000-0000-0000-0000-000000135462', '00000000-0000-0000-0000-000000135431',
   '00000000-0000-0000-0000-000000135411', '00000000-0000-0000-0000-000000135442',
   '00000000-0000-0000-0000-000000135452', 'confirmed');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000135421', true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000135421',
    'role', 'authenticated',
    'app_metadata', '{}'::jsonb
  )::text,
  true
);

DO $$
DECLARE
  la_show  CONSTANT uuid := '00000000-0000-0000-0000-000000135441';
  bad_show CONSTANT uuid := '00000000-0000-0000-0000-000000135442';

  n integer;

  -- Each case: label, instant, show, expected row count.
  cases CONSTANT jsonb := jsonb_build_array(
    -- Los Angeles show, 2026-11-07..2026-11-08.
    jsonb_build_array('LA evening before day 1 (Nov 6 17:30 local, UTC Nov 7)', '2026-11-07T01:30:00Z', la_show, 0),
    jsonb_build_array('LA day 1 morning', '2026-11-07T16:00:00Z', la_show, 1),
    jsonb_build_array('LA evening of the last day (Nov 8 18:00 local, UTC Nov 9)', '2026-11-09T02:00:00Z', la_show, 1),
    jsonb_build_array('LA after local midnight following the last day', '2026-11-09T08:30:00Z', la_show, 0),
    -- Unrecognized zone falls back to America/New_York (EST, UTC-5 in Nov).
    jsonb_build_array('NY fallback: Nov 6 21:30 local (UTC Nov 7 02:30) is still before day 1', '2026-11-07T02:30:00Z', bad_show, 0),
    jsonb_build_array('NY fallback: Nov 8 21:00 local (UTC Nov 9 02:00) is still the last day', '2026-11-09T02:00:00Z', bad_show, 1),
    jsonb_build_array('NY fallback: Nov 9 00:30 local (UTC Nov 9 05:30) is over', '2026-11-09T05:30:00Z', bad_show, 0)
  );
  c jsonb;
BEGIN
  FOR c IN SELECT jsonb_array_elements(cases) LOOP
    SELECT count(*) INTO n
      FROM public.get_account_today_entries_at((c->>1)::timestamptz) r
     WHERE r.show_id = (c->>2)::uuid;
    IF n <> (c->>3)::integer THEN
      RAISE EXCEPTION 'FAIL %: expected % row(s), got %', c->>0, c->>3, n;
    END IF;
    RAISE NOTICE 'PASS %', c->>0;
  END LOOP;

  -- Client roles must not be able to choose their own clock.
  IF has_function_privilege('authenticated', 'public.get_account_today_entries_at(timestamptz)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_account_today_entries_at(timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL get_account_today_entries_at is executable by a client role';
  END IF;
  RAISE NOTICE 'PASS get_account_today_entries_at is not client-callable';
END
$$;

ROLLBACK;
