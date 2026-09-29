-- A current, show-scoped staff passcode can read draft structure, while a
-- mismatched, regenerated, exhibitor, malformed, or absent claim cannot.
-- All fixtures and test settings roll back.
BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000819001', 'MYK9-819 passcode test club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES
  ('00000000-0000-0000-0000-000000819002', 'Draft target', 'UKC', current_date, current_date + 1, '00000000-0000-0000-0000-000000819001', 'draft'),
  ('00000000-0000-0000-0000-000000819003', 'Other draft', 'UKC', current_date, current_date + 1, '00000000-0000-0000-0000-000000819001', 'draft'),
  ('00000000-0000-0000-0000-000000819004', 'Published control', 'UKC', current_date, current_date + 1, '00000000-0000-0000-0000-000000819001', 'published'),
  ('00000000-0000-0000-0000-000000819005', 'Deleted draft', 'UKC', current_date, current_date + 1, '00000000-0000-0000-0000-000000819001', 'draft');

INSERT INTO public.trials (id, show_id, name, date)
VALUES
  ('00000000-0000-0000-0000-000000819012', '00000000-0000-0000-0000-000000819002', 'Draft trial', current_date),
  ('00000000-0000-0000-0000-000000819014', '00000000-0000-0000-0000-000000819004', 'Published trial', current_date),
  ('00000000-0000-0000-0000-000000819015', '00000000-0000-0000-0000-000000819005', 'Deleted trial', current_date);

INSERT INTO public.classes (id, trial_id, name)
VALUES
  ('00000000-0000-0000-0000-000000819022', '00000000-0000-0000-0000-000000819012', 'Vehicle Novice'),
  ('00000000-0000-0000-0000-000000819024', '00000000-0000-0000-0000-000000819014', 'Vehicle Novice'),
  ('00000000-0000-0000-0000-000000819025', '00000000-0000-0000-0000-000000819015', 'Vehicle Novice');

INSERT INTO public.show_passcodes (show_id, role, passcode_hash, created_at)
VALUES
  ('00000000-0000-0000-0000-000000819002', 'judge', 'myk9-819-judge-target', '2026-09-29T00:00:00Z'),
  ('00000000-0000-0000-0000-000000819002', 'steward', 'myk9-819-steward-target', '2026-09-29T00:00:00Z'),
  ('00000000-0000-0000-0000-000000819002', 'admin', 'myk9-819-admin-target', '2026-09-29T00:00:00Z'),
  ('00000000-0000-0000-0000-000000819002', 'exhibitor', 'myk9-819-exhibitor-target', '2026-09-29T00:00:00Z'),
  ('00000000-0000-0000-0000-000000819003', 'judge', 'myk9-819-judge-other', '2026-09-29T00:00:00Z'),
  ('00000000-0000-0000-0000-000000819005', 'judge', 'myk9-819-judge-deleted', '2026-09-29T00:00:00Z');

UPDATE public.shows
SET deleted_at = now()
WHERE id = '00000000-0000-0000-0000-000000819005';

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  test_case record;
  seen_shows integer;
  seen_trials integer;
  seen_classes integer;
  claim jsonb;
BEGIN
  FOR test_case IN
    SELECT * FROM (VALUES
      ('current judge', '00000000-0000-0000-0000-000000819002', 'judge', '2026-09-29T00:00:00Z', 1),
      ('current steward', '00000000-0000-0000-0000-000000819002', 'steward', '2026-09-29T00:00:00Z', 1),
      ('current admin', '00000000-0000-0000-0000-000000819002', 'admin', '2026-09-29T00:00:00Z', 1),
      ('other show', '00000000-0000-0000-0000-000000819003', 'judge', '2026-09-29T00:00:00Z', 0),
      ('stale generation', '00000000-0000-0000-0000-000000819002', 'judge', '2026-09-28T00:00:00Z', 0),
      ('exhibitor', '00000000-0000-0000-0000-000000819002', 'exhibitor', '2026-09-29T00:00:00Z', 0),
      ('malformed show id', 'not-a-uuid', 'judge', '2026-09-29T00:00:00Z', 0),
      ('no claim', NULL, NULL, NULL, 0)
    ) AS cases(label, claim_show_id, claim_role, generation, expected)
  LOOP
    claim := CASE WHEN test_case.claim_show_id IS NULL THEN '{}'::jsonb ELSE
      jsonb_build_object(
        'kind', 'ringside_passcode',
        'show_id', test_case.claim_show_id,
        'ringside_role', test_case.claim_role,
        'passcode_generation', test_case.generation
      ) END;
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000819100', true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
      'sub', '00000000-0000-0000-0000-000000819100',
      'role', 'authenticated',
      'app_metadata', claim
    )::text, true);

    SELECT count(*) INTO seen_shows FROM public.shows WHERE id = '00000000-0000-0000-0000-000000819002';
    SELECT count(*) INTO seen_trials FROM public.trials WHERE id = '00000000-0000-0000-0000-000000819012';
    SELECT count(*) INTO seen_classes FROM public.classes WHERE id = '00000000-0000-0000-0000-000000819022';
    IF seen_shows <> test_case.expected OR seen_trials <> test_case.expected OR seen_classes <> test_case.expected THEN
      RAISE EXCEPTION 'FAIL %: expected %, saw show %, trial %, class %',
        test_case.label, test_case.expected, seen_shows, seen_trials, seen_classes;
    END IF;
  END LOOP;

  -- A current claim for a deleted show never revives its structure.
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000819100',
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'kind', 'ringside_passcode',
      'show_id', '00000000-0000-0000-0000-000000819005',
      'ringside_role', 'judge',
      'passcode_generation', '2026-09-29T00:00:00Z'
    )
  )::text, true);
  SELECT count(*) INTO seen_shows FROM public.shows WHERE id = '00000000-0000-0000-0000-000000819005';
  SELECT count(*) INTO seen_trials FROM public.trials WHERE id = '00000000-0000-0000-0000-000000819015';
  SELECT count(*) INTO seen_classes FROM public.classes WHERE id = '00000000-0000-0000-0000-000000819025';
  IF seen_shows <> 0 OR seen_trials <> 0 OR seen_classes <> 0 THEN
    RAISE EXCEPTION 'FAIL deleted show leaked to a current passcode';
  END IF;

  -- Existing published visibility remains available without any claim.
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000819100',
    'role', 'authenticated'
  )::text, true);
  SELECT count(*) INTO seen_shows FROM public.shows WHERE id = '00000000-0000-0000-0000-000000819004';
  SELECT count(*) INTO seen_trials FROM public.trials WHERE id = '00000000-0000-0000-0000-000000819014';
  SELECT count(*) INTO seen_classes FROM public.classes WHERE id = '00000000-0000-0000-0000-000000819024';
  IF seen_shows <> 1 OR seen_trials <> 1 OR seen_classes <> 1 THEN
    RAISE EXCEPTION 'FAIL published-show visibility regressed';
  END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $$
DECLARE
  seen_shows integer;
  seen_trials integer;
  seen_classes integer;
BEGIN
  SELECT count(*) INTO seen_shows FROM public.shows WHERE id = '00000000-0000-0000-0000-000000819002';
  SELECT count(*) INTO seen_trials FROM public.trials WHERE id = '00000000-0000-0000-0000-000000819012';
  SELECT count(*) INTO seen_classes FROM public.classes WHERE id = '00000000-0000-0000-0000-000000819022';
  IF seen_shows <> 0 OR seen_trials <> 0 OR seen_classes <> 0 THEN
    RAISE EXCEPTION 'FAIL signed-out anon can read draft structure';
  END IF;
END;
$$;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'PASS MYK9-819 staff passcode draft visibility'; END $$;
ROLLBACK;
