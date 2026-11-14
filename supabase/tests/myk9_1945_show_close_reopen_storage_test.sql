-- MYK9-1945 behavioral contract: the storage for closing and reopening a show.
--
--   shows.closed_open_lines / closed_at / reopened_at / reopen_reason
--   trials.status_before_close, classes.status_before_close
--
-- Sections:
--   A. a show manager (secretary of the club) can set the columns on the show, a trial
--      and a class, read them back, and clear them again
--   B. closed_open_lines must be a jsonb array
--   C. a signed-in user who manages nothing writes none of them (RLS: 0 rows touched)
--   D. anon holds no privilege on classes.status_before_close (read or write), and
--      no write privilege on any of the new columns
--
-- shows and trials keep their table-level SELECT (anon=r, authenticated=r), so the new
-- show/trial columns are not column-hidden from readers; classes is read through a column
-- allowlist, so its new column is hidden from anon. See the migration header.
-- Fixtures roll back.

BEGIN;

INSERT INTO public.roles (name, description, is_system)
VALUES ('secretary', 'MYK9-1945 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name) VALUES ('00000000-0000-0000-0000-000001945001', 'MYK9-1945 Club');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES ('00000000-0000-0000-0000-000001945111', 'MYK9-1945', 'Secretary', 'myk9-1945-secretary@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000001945101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-1945-secretary@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000001945102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-1945-exhibitor@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES ('00000000-0000-0000-0000-000001945002', 'MYK9-1945 Show', 'AKC', current_date, current_date,
        '00000000-0000-0000-0000-000001945001', 'published');
INSERT INTO public.trials (id, show_id, name, date, registry_id)
VALUES ('00000000-0000-0000-0000-000001945003', '00000000-0000-0000-0000-000001945002',
        'MYK9-1945 Trial', current_date, 'AKC');
INSERT INTO public.classes (id, trial_id, name, status, element, level, section)
VALUES ('00000000-0000-0000-0000-000001945004', '00000000-0000-0000-0000-000001945003',
        'Interior Novice A', 'in_progress', 'Interior', 'Novice', 'A');

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000001945111', role.id,
       '00000000-0000-0000-0000-000001945001', true,
       '00000000-0000-0000-0000-000001945101'
FROM public.roles AS role WHERE role.name = 'secretary';

-- A + B. The show manager.
DO $$
DECLARE
  secretary uuid := '00000000-0000-0000-0000-000001945101';
  v_show uuid := '00000000-0000-0000-0000-000001945002';
  v_trial uuid := '00000000-0000-0000-0000-000001945003';
  v_class uuid := '00000000-0000-0000-0000-000001945004';
  n integer;
  r record;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', secretary::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', secretary, 'role', 'authenticated')::text, true);

  UPDATE public.classes SET status_before_close = 'in_progress' WHERE id = v_class;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL A manager set classes.status_before_close touched % rows', n; END IF;

  UPDATE public.trials SET status_before_close = 'in_progress' WHERE id = v_trial;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL A manager set trials.status_before_close touched % rows', n; END IF;

  UPDATE public.shows
     SET closed_open_lines = '[{"key":"unreleased","count":3}]'::jsonb,
         closed_at = now()
   WHERE id = v_show;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL A manager set the close record touched % rows', n; END IF;

  SELECT closed_open_lines, closed_at INTO r FROM public.shows WHERE id = v_show;
  IF r.closed_open_lines IS DISTINCT FROM '[{"key":"unreleased","count":3}]'::jsonb OR r.closed_at IS NULL THEN
    RAISE EXCEPTION 'FAIL A manager could not read the close record back: %', r;
  END IF;
  IF (SELECT status_before_close FROM public.classes WHERE id = v_class) IS DISTINCT FROM 'in_progress'
     OR (SELECT status_before_close FROM public.trials WHERE id = v_trial) IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION 'FAIL A manager could not read status_before_close back';
  END IF;

  -- B. closed_open_lines is an array.
  BEGIN
    UPDATE public.shows SET closed_open_lines = '{"key":"unreleased"}'::jsonb WHERE id = v_show;
    RAISE EXCEPTION 'FAIL B a non-array closed_open_lines was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- A. Reopen: the record is stamped and every prior-status column clears.
  UPDATE public.classes SET status_before_close = NULL WHERE id = v_class;
  UPDATE public.trials SET status_before_close = NULL WHERE id = v_trial;
  UPDATE public.shows
     SET reopened_at = now(), reopen_reason = 'Scores were missing', closed_open_lines = NULL, closed_at = NULL
   WHERE id = v_show;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL A manager reopen touched % rows', n; END IF;

  SELECT closed_open_lines, closed_at, reopened_at, reopen_reason INTO r FROM public.shows WHERE id = v_show;
  IF r.closed_open_lines IS NOT NULL OR r.closed_at IS NOT NULL OR r.reopened_at IS NULL
     OR r.reopen_reason <> 'Scores were missing' THEN
    RAISE EXCEPTION 'FAIL A reopen left the show record wrong: %', r;
  END IF;
  IF (SELECT status_before_close FROM public.classes WHERE id = v_class) IS NOT NULL
     OR (SELECT status_before_close FROM public.trials WHERE id = v_trial) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL A reopen did not clear the prior status';
  END IF;

  RESET ROLE;
  RAISE NOTICE 'PASS A/B a show manager sets, reads and clears with the new columns';
END;
$$;

-- C. A signed-in user who manages nothing.
DO $$
DECLARE
  exhibitor uuid := '00000000-0000-0000-0000-000001945102';
  v_show uuid := '00000000-0000-0000-0000-000001945002';
  v_trial uuid := '00000000-0000-0000-0000-000001945003';
  v_class uuid := '00000000-0000-0000-0000-000001945004';
  n integer;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', exhibitor::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', exhibitor, 'role', 'authenticated')::text, true);

  UPDATE public.shows SET reopen_reason = 'forged', closed_at = now() WHERE id = v_show;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL C a non-manager wrote the show close record (% rows)', n; END IF;

  UPDATE public.trials SET status_before_close = 'forged' WHERE id = v_trial;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL C a non-manager wrote trials.status_before_close (% rows)', n; END IF;

  UPDATE public.classes SET status_before_close = 'forged' WHERE id = v_class;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL C a non-manager wrote classes.status_before_close (% rows)', n; END IF;

  RESET ROLE;
  RAISE NOTICE 'PASS C a user who manages nothing writes none of the new columns';
END;
$$;

-- D. anon.
DO $$
DECLARE
  col text;
BEGIN
  IF has_column_privilege('anon', 'public.classes', 'status_before_close', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL D anon can SELECT classes.status_before_close';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.classes', 'status_before_close', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL D authenticated cannot SELECT classes.status_before_close';
  END IF;

  FOREACH col IN ARRAY ARRAY['closed_open_lines', 'closed_at', 'reopened_at', 'reopen_reason'] LOOP
    IF has_column_privilege('anon', 'public.shows', col, 'INSERT')
       OR has_column_privilege('anon', 'public.shows', col, 'UPDATE') THEN
      RAISE EXCEPTION 'FAIL D anon can write shows.%', col;
    END IF;
  END LOOP;
  IF has_column_privilege('anon', 'public.trials', 'status_before_close', 'INSERT')
     OR has_column_privilege('anon', 'public.trials', 'status_before_close', 'UPDATE')
     OR has_column_privilege('anon', 'public.classes', 'status_before_close', 'INSERT')
     OR has_column_privilege('anon', 'public.classes', 'status_before_close', 'UPDATE') THEN
    RAISE EXCEPTION 'FAIL D anon can write status_before_close';
  END IF;

  SET LOCAL ROLE anon;
  BEGIN
    PERFORM status_before_close FROM public.classes;
    RAISE EXCEPTION 'FAIL D anon read classes.status_before_close';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.classes SET status_before_close = 'forged';
    RAISE EXCEPTION 'FAIL D anon wrote classes.status_before_close';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.shows SET reopen_reason = 'forged';
    RAISE EXCEPTION 'FAIL D anon wrote shows.reopen_reason';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  RAISE NOTICE 'PASS D anon cannot read or write the new classes column nor write the new show/trial columns';
END;
$$;

ROLLBACK;
