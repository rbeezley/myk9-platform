-- Behavioral RLS test for 20260716120000_entry_status_history_capture.sql.
--
-- Run against a database where the migration is applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/entry_status_history_rls_test.sql
-- The transaction rolls back all fixtures. A clean run prints PASS notices.

BEGIN;

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-000000000601', 'Show One', 'Secretary', '00000000-0000-0000-0000-000000000501'),
  ('00000000-0000-0000-0000-000000000602', 'Show Two', 'Secretary', '00000000-0000-0000-0000-000000000502'),
  ('00000000-0000-0000-0000-000000000603', 'Unauthorised', 'Viewer', '00000000-0000-0000-0000-000000000503');

INSERT INTO public.shows (id, name, type, start_date, end_date)
VALUES
  ('00000000-0000-0000-0000-000000000101', 'History RLS Show One', 'All-Breed', CURRENT_DATE, CURRENT_DATE),
  ('00000000-0000-0000-0000-000000000102', 'History RLS Show Two', 'All-Breed', CURRENT_DATE, CURRENT_DATE);

INSERT INTO public.trials (id, show_id, name, date)
VALUES
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101', 'Trial One', CURRENT_DATE),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000102', 'Trial Two', CURRENT_DATE);

INSERT INTO public.entries (id, show_id, trial_id, entry_status)
VALUES
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201', 'submitted'),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000202', 'submitted');

INSERT INTO public.user_roles (user_id, role_id, show_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000000601', id, '00000000-0000-0000-0000-000000000101', true, '00000000-0000-0000-0000-000000000501'
FROM public.roles
WHERE name = 'secretary';

INSERT INTO public.user_roles (user_id, role_id, show_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000000602', id, '00000000-0000-0000-0000-000000000102', true, '00000000-0000-0000-0000-000000000502'
FROM public.roles
WHERE name = 'secretary';

INSERT INTO public.entry_status_history (id, entry_id, previous_status, new_status, changed_by, reason)
VALUES
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000301', 'submitted', 'confirmed', '00000000-0000-0000-0000-000000000601', 'Show one'),
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000302', 'submitted', 'confirmed', '00000000-0000-0000-0000-000000000602', 'Show two');

SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);
DO $$
DECLARE
  visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM public.entry_status_history;
  IF visible_count <> 1 THEN
    RAISE EXCEPTION 'FAIL secretary for show one saw % history rows; expected 1', visible_count;
  END IF;
  RAISE NOTICE 'PASS show-one secretary sees only show-one history';
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000502', true);
DO $$
DECLARE
  visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM public.entry_status_history;
  IF visible_count <> 1 THEN
    RAISE EXCEPTION 'FAIL secretary for show two saw % history rows; expected 1', visible_count;
  END IF;
  RAISE NOTICE 'PASS show-two secretary sees only show-two history';
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000503', true);
DO $$
DECLARE
  visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM public.entry_status_history;
  IF visible_count <> 0 THEN
    RAISE EXCEPTION 'FAIL unauthorised viewer saw % history rows; expected 0', visible_count;
  END IF;
  RAISE NOTICE 'PASS unauthorised viewer sees no history';
END;
$$;

ROLLBACK;
