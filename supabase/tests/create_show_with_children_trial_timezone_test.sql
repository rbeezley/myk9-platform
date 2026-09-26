-- Behavioral test for 20260926174500_create_show_with_children_trial_timezone.sql
-- (MYK9-831).
--
-- Run against a database where all migrations are applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/create_show_with_children_trial_timezone_test.sql
-- All fixtures roll back.
--
-- Covers: a valid IANA zone in p_trials[].timezone lands on the row; a
-- missing key and an unresolvable string both fall back to the column's
-- 'America/New_York' default rather than erroring or persisting garbage.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-0000000f0c01', 'Trial Timezone Test Club');

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES (
  '00000000-0000-0000-0000-0000000f0c11',
  'Timezone', 'Test Secretary',
  '00000000-0000-0000-0000-0000000f0c21'
);

INSERT INTO public.club_members (club_id, person_id, membership_status)
VALUES (
  '00000000-0000-0000-0000-0000000f0c01',
  '00000000-0000-0000-0000-0000000f0c11',
  'active'
);

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-0000000f0c11',
  id,
  '00000000-0000-0000-0000-0000000f0c01',
  true,
  '00000000-0000-0000-0000-0000000f0c21'
FROM public.roles
WHERE name = 'secretary';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f0c21', true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-0000000f0c21',
    'role', 'authenticated',
    'app_metadata', '{}'::jsonb
  )::text,
  true
);

DO $$
DECLARE
  club          CONSTANT uuid := '00000000-0000-0000-0000-0000000f0c01';
  show_valid    CONSTANT uuid := '00000000-0000-0000-0000-0000000f0c02';
  trial_valid   CONSTANT uuid := '00000000-0000-0000-0000-0000000f0c03';
  show_missing  CONSTANT uuid := '00000000-0000-0000-0000-0000000f0c04';
  trial_missing CONSTANT uuid := '00000000-0000-0000-0000-0000000f0c05';
  show_bad      CONSTANT uuid := '00000000-0000-0000-0000-0000000f0c06';
  trial_bad     CONSTANT uuid := '00000000-0000-0000-0000-0000000f0c07';
  got_timezone  text;
BEGIN
  -- A valid IANA zone lands on the row exactly as sent — the Tulsa, OK show
  -- from the bug report.
  PERFORM public.create_show_with_children(
    jsonb_build_object(
      'id', show_valid, 'club_id', club, 'name', 'Tulsa Fairgrounds Show',
      'organization', 'AKC', 'start_date', current_date::text,
      'end_date', current_date::text,
      'accept_check_payments', true, 'accept_cash_payments', true
    ),
    jsonb_build_array(jsonb_build_object(
      'id', trial_valid, 'name', 'Saturday Trial', 'date', current_date::text,
      'timezone', 'America/Chicago'
    )),
    '[]'::jsonb,
    NULL
  );

  SELECT timezone INTO got_timezone FROM public.trials WHERE id = trial_valid;
  IF got_timezone IS DISTINCT FROM 'America/Chicago' THEN
    RAISE EXCEPTION 'FAIL valid timezone did not survive show creation: %', got_timezone;
  END IF;

  -- Omitting the key entirely falls back to the column default rather than
  -- erroring (an older client, or a wizard draft saved before MYK9-831).
  PERFORM public.create_show_with_children(
    jsonb_build_object(
      'id', show_missing, 'club_id', club, 'name', 'No Timezone Key Show',
      'organization', 'AKC', 'start_date', current_date::text,
      'end_date', current_date::text,
      'accept_check_payments', true, 'accept_cash_payments', true
    ),
    jsonb_build_array(jsonb_build_object(
      'id', trial_missing, 'name', 'Saturday Trial', 'date', current_date::text
    )),
    '[]'::jsonb,
    NULL
  );

  SELECT timezone INTO got_timezone FROM public.trials WHERE id = trial_missing;
  IF got_timezone IS DISTINCT FROM 'America/New_York' THEN
    RAISE EXCEPTION 'FAIL missing timezone key did not default: %', got_timezone;
  END IF;

  -- An unresolvable string must never reach the column — it is validated
  -- against pg_timezone_names, same as getTrialTimezone() validates
  -- client-side, and falls back rather than persisting garbage that would
  -- later throw out of Intl/toLocaleDateString.
  PERFORM public.create_show_with_children(
    jsonb_build_object(
      'id', show_bad, 'club_id', club, 'name', 'Bad Timezone Show',
      'organization', 'AKC', 'start_date', current_date::text,
      'end_date', current_date::text,
      'accept_check_payments', true, 'accept_cash_payments', true
    ),
    jsonb_build_array(jsonb_build_object(
      'id', trial_bad, 'name', 'Saturday Trial', 'date', current_date::text,
      'timezone', 'Not/AZone'
    )),
    '[]'::jsonb,
    NULL
  );

  SELECT timezone INTO got_timezone FROM public.trials WHERE id = trial_bad;
  IF got_timezone IS DISTINCT FROM 'America/New_York' THEN
    RAISE EXCEPTION 'FAIL unresolvable timezone did not default: %', got_timezone;
  END IF;

  RAISE NOTICE 'PASS valid timezone persists; missing/invalid both default to America/New_York';
END;
$$;

RESET ROLE;

ROLLBACK;
