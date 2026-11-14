-- MYK9-1945 behavioral contract: show_close_notes is staff-only, and the two free-text
-- close columns are gone from shows (20261114211900).
--
-- Sections:
--   A. anon holds no privilege and cannot select or insert
--   B. an authenticated user who manages nothing cannot select, insert or update another
--      show's row (and cannot create a row for it)
--   C. the show's staff (club secretary) can insert, select, update; no delete path
--   D. shows.closed_open_lines, shows.reopen_reason and the array check are gone;
--      closed_at / reopened_at remain; the array check lives on show_close_notes
-- Fixtures roll back.

BEGIN;

INSERT INTO public.roles (name, description, is_system)
VALUES ('secretary', 'MYK9-1945 notes fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.clubs (id, name) VALUES
  ('00000000-0000-0000-0000-000001946001', 'MYK9-1945 Notes Club A'),
  ('00000000-0000-0000-0000-000001946002', 'MYK9-1945 Notes Club B');

INSERT INTO public.people (id, first_name, last_name, email, auth_user_id)
VALUES ('00000000-0000-0000-0000-000001946111', 'MYK9-1945', 'NotesSecretary', 'myk9-1945-notes-secretary@example.test', NULL);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000001946101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-1945-notes-secretary@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000001946102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'myk9-1945-notes-exhibitor@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status) VALUES
  ('00000000-0000-0000-0000-000001946003', 'MYK9-1945 Notes Show A', 'AKC', current_date, current_date, '00000000-0000-0000-0000-000001946001', 'published'),
  ('00000000-0000-0000-0000-000001946004', 'MYK9-1945 Notes Show B', 'AKC', current_date, current_date, '00000000-0000-0000-0000-000001946002', 'published');

-- The secretary is staff of club A only.
INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000001946111', role.id,
       '00000000-0000-0000-0000-000001946001', true,
       '00000000-0000-0000-0000-000001946101'
FROM public.roles AS role WHERE role.name = 'secretary';

-- Seed show B's note as the table owner so B has a row to try to read and change.
INSERT INTO public.show_close_notes (show_id, closed_open_lines, reopen_reason)
VALUES ('00000000-0000-0000-0000-000001946004', '[{"key":"unreleased","count":1}]'::jsonb, 'B private reason');

-- A. anon.
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.show_close_notes', 'SELECT')
     OR has_table_privilege('anon', 'public.show_close_notes', 'INSERT')
     OR has_table_privilege('anon', 'public.show_close_notes', 'UPDATE')
     OR has_table_privilege('anon', 'public.show_close_notes', 'DELETE') THEN
    RAISE EXCEPTION 'FAIL A anon holds a privilege on show_close_notes';
  END IF;
  IF has_table_privilege('authenticated', 'public.show_close_notes', 'DELETE') THEN
    RAISE EXCEPTION 'FAIL A authenticated can DELETE show_close_notes';
  END IF;

  SET LOCAL ROLE anon;
  BEGIN
    PERFORM 1 FROM public.show_close_notes;
    RAISE EXCEPTION 'FAIL A anon selected show_close_notes';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.show_close_notes (show_id, reopen_reason)
    VALUES ('00000000-0000-0000-0000-000001946003', 'forged');
    RAISE EXCEPTION 'FAIL A anon inserted into show_close_notes';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  RAISE NOTICE 'PASS A anon cannot select or insert show_close_notes';
END;
$$;

-- B. A signed-in user who manages nothing.
DO $$
DECLARE
  exhibitor uuid := '00000000-0000-0000-0000-000001946102';
  n integer;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', exhibitor::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', exhibitor, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO n FROM public.show_close_notes;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL B a non-staff user read % show_close_notes rows', n; END IF;

  UPDATE public.show_close_notes SET reopen_reason = 'forged'
   WHERE show_id = '00000000-0000-0000-0000-000001946004';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL B a non-staff user updated a row (% rows)', n; END IF;

  BEGIN
    INSERT INTO public.show_close_notes (show_id, reopen_reason)
    VALUES ('00000000-0000-0000-0000-000001946003', 'forged');
    RAISE EXCEPTION 'FAIL B a non-staff user inserted a row';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  RESET ROLE;
  RAISE NOTICE 'PASS B a user who manages nothing cannot select, insert or update';
END;
$$;

-- C. The show's staff (club A secretary): own show yes, club B's show no.
DO $$
DECLARE
  secretary uuid := '00000000-0000-0000-0000-000001946101';
  show_a uuid := '00000000-0000-0000-0000-000001946003';
  show_b uuid := '00000000-0000-0000-0000-000001946004';
  n integer;
  r record;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', secretary::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', secretary, 'role', 'authenticated')::text, true);

  INSERT INTO public.show_close_notes (show_id, closed_open_lines)
  VALUES (show_a, '[{"key":"unreleased","count":3}]'::jsonb);

  UPDATE public.show_close_notes SET reopen_reason = 'Scores were missing' WHERE show_id = show_a;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL C staff update touched % rows', n; END IF;

  SELECT closed_open_lines, reopen_reason INTO r FROM public.show_close_notes WHERE show_id = show_a;
  IF r.reopen_reason IS DISTINCT FROM 'Scores were missing'
     OR r.closed_open_lines IS DISTINCT FROM '[{"key":"unreleased","count":3}]'::jsonb THEN
    RAISE EXCEPTION 'FAIL C staff could not read their row back: %', r;
  END IF;

  -- Not another club's show.
  SELECT count(*) INTO n FROM public.show_close_notes WHERE show_id = show_b;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL C staff read another club''s notes'; END IF;
  UPDATE public.show_close_notes SET reopen_reason = 'forged' WHERE show_id = show_b;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL C staff updated another club''s notes (% rows)', n; END IF;
  BEGIN
    DELETE FROM public.show_close_notes WHERE show_id = show_a;
    RAISE EXCEPTION 'FAIL C staff deleted a notes row';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- The array check moved with the column.
  BEGIN
    UPDATE public.show_close_notes SET closed_open_lines = '{"key":"x"}'::jsonb WHERE show_id = show_a;
    RAISE EXCEPTION 'FAIL C a non-array closed_open_lines was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  RESET ROLE;
  RAISE NOTICE 'PASS C show staff insert, read and update their own show only';
END;
$$;

-- D. The columns left shows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shows'
      AND column_name IN ('closed_open_lines', 'reopen_reason')
  ) THEN
    RAISE EXCEPTION 'FAIL D shows still has closed_open_lines or reopen_reason';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shows' AND column_name = 'closed_at'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shows' AND column_name = 'reopened_at'
  ) THEN
    RAISE EXCEPTION 'FAIL D shows lost closed_at or reopened_at';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shows_closed_open_lines_array_check') THEN
    RAISE EXCEPTION 'FAIL D shows_closed_open_lines_array_check survived';
  END IF;
  RAISE NOTICE 'PASS D the two columns left shows; closed_at and reopened_at stayed';
END;
$$;

ROLLBACK;
