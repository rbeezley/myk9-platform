-- MYK9-836: give the seeded demo accounts realistic display names so the club
-- demo deck shows no test vocabulary. One-shot LIVE data update; NOT a migration.
--
-- Apply AFTER merge, as postgres, from a worktree with supabase/.env:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/scripts/myk9-836-demo-rename.sql
--
-- Idempotent: every UPDATE is keyed by primary key AND the current old value,
-- so a second run changes 0 rows. The row-count assertions below are for the
-- FIRST run (expected 10 / 8 / 41 / 2); on a re-run they raise and roll back,
-- which is the intended "already applied" signal.
--
-- Emails are untouched (sign-in depends on them).
-- NOT renamed on purpose: paperwork_prints.printed_by_name (1 row) -- that
-- table is append-only (guard_paperwork_print_update) and the row is a
-- historical print record, not demo-visible.

BEGIN;

CREATE TEMP TABLE rename_map (
  person_id uuid PRIMARY KEY,
  auth_user_id uuid,
  old_first text NOT NULL,
  old_last text NOT NULL,
  new_first text NOT NULL,
  new_last text NOT NULL
) ON COMMIT DROP;

INSERT INTO rename_map VALUES
  ('bf0f113c-c6eb-4482-8198-b41413263d79', 'dd25d7cb-0754-4bcd-a757-fa9b95412d4b', 'Test',   'Secretary',  'Jordan', 'Ellis'),
  ('6fd402f4-88fb-447d-876e-7c6ae3c429d1', '4b63a211-b6bd-4916-b1f9-567f1bebb038', 'Test',   'Exhibitor',  'Casey',  'Morgan'),
  ('b442619e-c67b-4dff-a993-74100dbf4174', 'a1000002-0000-0000-0000-000000000002', 'Second', 'Exhibitor',  'Riley',  'Parker'),
  ('b0728006-4428-4b5d-8462-00015c26a35b', 'a88ed65e-d0e3-4439-81e7-31e47f2164e4', 'Test',   'Judge',      'Pat',    'Donovan'),
  ('6ccffb45-678e-4da5-a7bc-4b93f3fe39e7', '5d4e4e35-2b99-4ad0-b125-e01520e68946', 'Test',   'Club Admin', 'Morgan', 'Reyes'),
  ('1ae719fe-3668-4945-bd88-16b42e2335e7', 'fca4c20b-3f46-44a2-8c0f-0f48e6230141', 'Test',   'Chairman',   'Alex',   'Whitfield'),
  ('e144a774-9f34-409a-bb0d-8fad03ce97ea', 'c1e74685-c13d-4114-b72a-532f32263187', 'Test',   'Admin',      'Taylor', 'Brooks'),
  ('920cc75f-1ecb-4f54-b96c-ac53b20b6218', 'f887a85d-c4ac-43ae-af21-68459df1b722', 'Test',   'Steward',    'Drew',   'Hammond'),
  -- admin@ and club@ have no auth.users row (people only).
  ('24a95d6d-4a85-4d3d-b08a-bf81bf2152cc', NULL, 'Test',  'Admin',     'Quinn', 'Harper'),
  ('91a6d9fc-fe77-41b7-88d5-5ae576458a99', NULL, 'Third', 'Exhibitor', 'Avery', 'Lindgren');

-- 1. people (display names).
CREATE TEMP TABLE changed_people ON COMMIT DROP AS
WITH upd AS (
  UPDATE public.people p
  SET first_name = m.new_first, last_name = m.new_last
  FROM rename_map m
  WHERE p.id = m.person_id
    AND p.first_name = m.old_first
    AND p.last_name = m.old_last
  RETURNING p.id, p.email, m.old_first, m.old_last, p.first_name, p.last_name
)
SELECT * FROM upd;

-- 2. auth.users metadata (feeds paperwork print names and the signup-time
--    profile defaults). Merge, never replace, so other keys survive.
CREATE TEMP TABLE changed_auth ON COMMIT DROP AS
WITH upd AS (
  UPDATE auth.users u
  SET raw_user_meta_data = u.raw_user_meta_data
        || jsonb_build_object('first_name', m.new_first, 'last_name', m.new_last)
  FROM rename_map m
  WHERE u.id = m.auth_user_id
    AND u.raw_user_meta_data ->> 'first_name' = m.old_first
    AND u.raw_user_meta_data ->> 'last_name' = m.old_last
  RETURNING u.id, u.email, u.raw_user_meta_data
)
SELECT * FROM upd;

-- 3. entries.handler (denormalised display copy of the handler's name). Match
--    on the owning person so no other person's entries are touched.
CREATE TEMP TABLE changed_entries ON COMMIT DROP AS
WITH upd AS (
  UPDATE public.entries e
  SET handler = m.new_first || ' ' || m.new_last
  FROM rename_map m
  WHERE e.handler_id = m.person_id
    AND e.handler = m.old_first || ' ' || m.old_last
  RETURNING e.id, e.handler
)
SELECT * FROM upd;

-- 4. show_announcements.author_name (secretary announcements).
CREATE TEMP TABLE changed_announcements ON COMMIT DROP AS
WITH upd AS (
  UPDATE public.show_announcements a
  SET author_name = m.new_first || ' ' || m.new_last
  FROM rename_map m
  WHERE a.author_id = m.auth_user_id
    AND a.author_name = m.old_first || ' ' || m.old_last
  RETURNING a.id, a.author_name
)
SELECT * FROM upd;

-- Report what changed.
SELECT 'people' AS tbl, id::text, email, old_first || ' ' || old_last AS old_name,
       first_name || ' ' || last_name AS new_name
FROM changed_people ORDER BY email;
SELECT 'auth.users' AS tbl, id::text, email,
       raw_user_meta_data ->> 'first_name' || ' ' || (raw_user_meta_data ->> 'last_name') AS new_name
FROM changed_auth ORDER BY email;
SELECT 'entries.handler' AS tbl, handler AS new_name, count(*) FROM changed_entries GROUP BY handler;
SELECT 'show_announcements.author_name' AS tbl, author_name AS new_name, count(*) FROM changed_announcements GROUP BY author_name;

-- Assert first-run counts; roll back everything otherwise.
DO $$
DECLARE
  n_people int := (SELECT count(*) FROM changed_people);
  n_auth int := (SELECT count(*) FROM changed_auth);
  n_entries int := (SELECT count(*) FROM changed_entries);
  n_ann int := (SELECT count(*) FROM changed_announcements);
BEGIN
  IF n_people <> 10 OR n_auth <> 8 OR n_entries <> 41 OR n_ann <> 2 THEN
    RAISE EXCEPTION
      'MYK9-836 rename: expected people=10 auth=8 entries=41 announcements=2, got % / % / % / % (already applied, or data drifted); rolling back',
      n_people, n_auth, n_entries, n_ann;
  END IF;
END
$$;

-- Verify: no test vocabulary left on the targeted rows.
SELECT 'verify_people_remaining_old_names' AS check, count(*) AS must_be_zero
FROM public.people p
JOIN rename_map m ON m.person_id = p.id
WHERE p.first_name = m.old_first AND p.last_name = m.old_last;
SELECT 'verify_handler_remaining_old_names' AS check, count(*) AS must_be_zero
FROM public.entries e
JOIN rename_map m ON m.person_id = e.handler_id
WHERE e.handler = m.old_first || ' ' || m.old_last;

COMMIT;
