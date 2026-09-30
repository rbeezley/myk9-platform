-- Behavioral test for 20260929233100_myk9_662_create_show_with_children_junior_fee.sql
-- (MYK9-662 slice A2).
--
-- Run against a database where all migrations are applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/create_show_with_children_junior_fee_test.sql
-- All fixtures roll back.
--
-- Covers: a junior fee in p_show lands on the row; a missing key and an empty
-- string both store NULL; an out-of-range fee is rejected by the column CHECK.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-0000000f1c01', 'Junior Fee Test Club');

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES (
  '00000000-0000-0000-0000-0000000f1c11',
  'Junior', 'Fee Secretary',
  '00000000-0000-0000-0000-0000000f1c21'
);

INSERT INTO public.club_members (club_id, person_id, membership_status)
VALUES (
  '00000000-0000-0000-0000-0000000f1c01',
  '00000000-0000-0000-0000-0000000f1c11',
  'active'
);

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT
  '00000000-0000-0000-0000-0000000f1c11',
  id,
  '00000000-0000-0000-0000-0000000f1c01',
  true,
  '00000000-0000-0000-0000-0000000f1c21'
FROM public.roles
WHERE name = 'secretary';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000f1c21', true);
SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-0000000f1c21',
    'role', 'authenticated',
    'app_metadata', '{}'::jsonb
  )::text,
  true
);

DO $$
DECLARE
  club         CONSTANT uuid := '00000000-0000-0000-0000-0000000f1c01';
  show_set     CONSTANT uuid := '00000000-0000-0000-0000-0000000f1c02';
  show_missing CONSTANT uuid := '00000000-0000-0000-0000-0000000f1c03';
  show_empty   CONSTANT uuid := '00000000-0000-0000-0000-0000000f1c04';
  show_bad     CONSTANT uuid := '00000000-0000-0000-0000-0000000f1c05';
  got_fee      numeric;
  rejected     boolean := false;
BEGIN
  PERFORM public.create_show_with_children(
    jsonb_build_object(
      'id', show_set, 'club_id', club, 'name', 'Junior Fee Show',
      'organization', 'AKC', 'start_date', current_date::text,
      'end_date', current_date::text,
      'accept_check_payments', true, 'accept_cash_payments', true,
      'junior_handler_fee', 15
    ),
    '[]'::jsonb, '[]'::jsonb, NULL
  );
  SELECT junior_handler_fee INTO got_fee FROM public.shows WHERE id = show_set;
  IF got_fee IS DISTINCT FROM 15 THEN
    RAISE EXCEPTION 'FAIL junior fee did not survive show creation: %', got_fee;
  END IF;

  -- An older client, or a show with no junior tier, omits the key.
  PERFORM public.create_show_with_children(
    jsonb_build_object(
      'id', show_missing, 'club_id', club, 'name', 'No Junior Fee Key',
      'organization', 'AKC', 'start_date', current_date::text,
      'end_date', current_date::text,
      'accept_check_payments', true, 'accept_cash_payments', true
    ),
    '[]'::jsonb, '[]'::jsonb, NULL
  );
  SELECT junior_handler_fee INTO got_fee FROM public.shows WHERE id = show_missing;
  IF got_fee IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL missing key should store NULL: %', got_fee;
  END IF;

  PERFORM public.create_show_with_children(
    jsonb_build_object(
      'id', show_empty, 'club_id', club, 'name', 'Empty Junior Fee',
      'organization', 'AKC', 'start_date', current_date::text,
      'end_date', current_date::text,
      'accept_check_payments', true, 'accept_cash_payments', true,
      'junior_handler_fee', ''
    ),
    '[]'::jsonb, '[]'::jsonb, NULL
  );
  SELECT junior_handler_fee INTO got_fee FROM public.shows WHERE id = show_empty;
  IF got_fee IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL empty string should store NULL: %', got_fee;
  END IF;

  -- The column CHECK (>= 0 and < 100000) still guards the creation path.
  BEGIN
    PERFORM public.create_show_with_children(
      jsonb_build_object(
        'id', show_bad, 'club_id', club, 'name', 'Out Of Range Fee',
        'organization', 'AKC', 'start_date', current_date::text,
        'end_date', current_date::text,
        'accept_check_payments', true, 'accept_cash_payments', true,
        'junior_handler_fee', 100000
      ),
      '[]'::jsonb, '[]'::jsonb, NULL
    );
  EXCEPTION WHEN check_violation THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'FAIL a fee of 100000 was accepted';
  END IF;

  RAISE NOTICE 'PASS junior fee persists; missing/empty store NULL; out-of-range rejected';
END;
$$;

RESET ROLE;

ROLLBACK;
