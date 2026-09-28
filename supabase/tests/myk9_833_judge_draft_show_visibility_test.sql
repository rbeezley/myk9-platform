-- MYK9-833 behavioral contract.
--
-- shows_select / trials_select / classes_select must let an assigned judge see a
-- DRAFT show (and its trials/classes) before it publishes, so they can accept or
-- decline the assignment and /at-show/:id can resolve their trial and class rows.
-- The exception must be narrow:
--   assigned judge (invited/confirmed, THIS show) -> sees the draft show, its
--     trial, its class
--   unassigned judge (no judge_assignments row for this show)   -> sees none of it
--   declined judge (a judge_assignments row, status = declined) -> sees none of it
--   anon                                                        -> sees none of it
-- and it must not touch the existing published-show path: an unrelated caller must
-- still see a PUBLISHED show/trial/class exactly as before.
--
-- All fixtures roll back.

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000833001', 'MYK9-833 Club');

INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES
  (
    '00000000-0000-0000-0000-000000833010',
    'Assigned',
    'Judge',
    '00000000-0000-0000-0000-000000833100'
  ),
  (
    '00000000-0000-0000-0000-000000833011',
    'Unassigned',
    'Judge',
    '00000000-0000-0000-0000-000000833101'
  ),
  (
    '00000000-0000-0000-0000-000000833012',
    'Declined',
    'Judge',
    '00000000-0000-0000-0000-000000833102'
  );

-- Draft show: not yet published, no club-admin/secretary role granted to anyone
-- in this fixture, so only the judge exception (or lack of it) decides visibility.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES (
  '00000000-0000-0000-0000-000000833002',
  'MYK9-833 Draft Show',
  'AKC',
  current_date,
  current_date + 1,
  '00000000-0000-0000-0000-000000833001',
  'draft'
);

INSERT INTO public.trials (id, show_id, name, date)
VALUES (
  '00000000-0000-0000-0000-000000833004',
  '00000000-0000-0000-0000-000000833002',
  'MYK9-833 Draft Trial',
  current_date
);

INSERT INTO public.classes (id, trial_id, name)
VALUES (
  '00000000-0000-0000-0000-000000833006',
  '00000000-0000-0000-0000-000000833004',
  'Container Novice'
);

-- Published show/trial/class: the parity control. Untouched by this migration's
-- judge exception, and must stay visible exactly as before.
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES (
  '00000000-0000-0000-0000-000000833003',
  'MYK9-833 Published Show',
  'AKC',
  current_date,
  current_date + 1,
  '00000000-0000-0000-0000-000000833001',
  'published'
);

INSERT INTO public.trials (id, show_id, name, date)
VALUES (
  '00000000-0000-0000-0000-000000833005',
  '00000000-0000-0000-0000-000000833003',
  'MYK9-833 Published Trial',
  current_date
);

INSERT INTO public.classes (id, trial_id, name)
VALUES (
  '00000000-0000-0000-0000-000000833007',
  '00000000-0000-0000-0000-000000833005',
  'Container Novice'
);

-- The assigned judge: invited/confirmed on the DRAFT show.
INSERT INTO public.judge_assignments (id, person_id, show_id, status)
VALUES (
  '00000000-0000-0000-0000-000000833020',
  '00000000-0000-0000-0000-000000833010',
  '00000000-0000-0000-0000-000000833002',
  'confirmed'
);

-- The declined judge: a real row on the DRAFT show, but declined -- must not count.
INSERT INTO public.judge_assignments (id, person_id, show_id, status)
VALUES (
  '00000000-0000-0000-0000-000000833021',
  '00000000-0000-0000-0000-000000833012',
  '00000000-0000-0000-0000-000000833002',
  'declined'
);

-- The unassigned judge (833011) intentionally gets no judge_assignments row at all.

-- ---------------------------------------------------------------------------
-- Assigned judge: sees the draft show, its trial, and its class.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  draft_show_id uuid := '00000000-0000-0000-0000-000000833002';
  draft_trial_id uuid := '00000000-0000-0000-0000-000000833004';
  draft_class_id uuid := '00000000-0000-0000-0000-000000833006';
  auth_id uuid := '00000000-0000-0000-0000-000000833100';
  seen_shows integer;
  seen_trials integer;
  seen_classes integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', auth_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', auth_id, 'role', 'authenticated')::text,
    true
  );

  SELECT count(*) INTO seen_shows FROM public.shows WHERE id = draft_show_id;
  IF seen_shows <> 1 THEN
    RAISE EXCEPTION
      'FAIL an assigned (confirmed) judge cannot see the draft show they are assigned to. saw %',
      seen_shows;
  END IF;

  SELECT count(*) INTO seen_trials FROM public.trials WHERE id = draft_trial_id;
  IF seen_trials <> 1 THEN
    RAISE EXCEPTION
      'FAIL an assigned judge cannot see the draft show''s trial. saw %', seen_trials;
  END IF;

  SELECT count(*) INTO seen_classes FROM public.classes WHERE id = draft_class_id;
  IF seen_classes <> 1 THEN
    RAISE EXCEPTION
      'FAIL an assigned judge cannot see the draft show''s class. saw %', seen_classes;
  END IF;
END;
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Unassigned judge: no judge_assignments row for this show at all -- must see
-- none of the draft show, trial, or class. Proves the exception is per-show, not
-- "any authenticated judge".
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  draft_show_id uuid := '00000000-0000-0000-0000-000000833002';
  draft_trial_id uuid := '00000000-0000-0000-0000-000000833004';
  draft_class_id uuid := '00000000-0000-0000-0000-000000833006';
  auth_id uuid := '00000000-0000-0000-0000-000000833101';
  seen_shows integer;
  seen_trials integer;
  seen_classes integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', auth_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', auth_id, 'role', 'authenticated')::text,
    true
  );

  SELECT count(*) INTO seen_shows FROM public.shows WHERE id = draft_show_id;
  IF seen_shows <> 0 THEN
    RAISE EXCEPTION
      'FAIL an unassigned judge can see a draft show they have no assignment on. saw %',
      seen_shows;
  END IF;

  SELECT count(*) INTO seen_trials FROM public.trials WHERE id = draft_trial_id;
  IF seen_trials <> 0 THEN
    RAISE EXCEPTION 'FAIL an unassigned judge can see the draft show''s trial. saw %', seen_trials;
  END IF;

  SELECT count(*) INTO seen_classes FROM public.classes WHERE id = draft_class_id;
  IF seen_classes <> 0 THEN
    RAISE EXCEPTION 'FAIL an unassigned judge can see the draft show''s class. saw %', seen_classes;
  END IF;
END;
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Declined judge: a real judge_assignments row on this show, but status =
-- 'declined' -- must see none of the draft show, trial, or class. Proves the
-- exception checks status, not merely "has a row".
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  draft_show_id uuid := '00000000-0000-0000-0000-000000833002';
  draft_trial_id uuid := '00000000-0000-0000-0000-000000833004';
  draft_class_id uuid := '00000000-0000-0000-0000-000000833006';
  auth_id uuid := '00000000-0000-0000-0000-000000833102';
  seen_shows integer;
  seen_trials integer;
  seen_classes integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', auth_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', auth_id, 'role', 'authenticated')::text,
    true
  );

  SELECT count(*) INTO seen_shows FROM public.shows WHERE id = draft_show_id;
  IF seen_shows <> 0 THEN
    RAISE EXCEPTION
      'FAIL a judge who declined the assignment can still see the draft show. saw %',
      seen_shows;
  END IF;

  SELECT count(*) INTO seen_trials FROM public.trials WHERE id = draft_trial_id;
  IF seen_trials <> 0 THEN
    RAISE EXCEPTION
      'FAIL a judge who declined the assignment can still see its trial. saw %', seen_trials;
  END IF;

  SELECT count(*) INTO seen_classes FROM public.classes WHERE id = draft_class_id;
  IF seen_classes <> 0 THEN
    RAISE EXCEPTION
      'FAIL a judge who declined the assignment can still see its class. saw %', seen_classes;
  END IF;
END;
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- anon: must see none of the draft show, trial, or class -- the judge exception
-- is authenticated-only and grants nothing to a signed-out caller.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE anon;
DO $$
DECLARE
  draft_show_id uuid := '00000000-0000-0000-0000-000000833002';
  draft_trial_id uuid := '00000000-0000-0000-0000-000000833004';
  draft_class_id uuid := '00000000-0000-0000-0000-000000833006';
  seen_shows integer;
  seen_trials integer;
  seen_classes integer;
BEGIN
  SELECT count(*) INTO seen_shows FROM public.shows WHERE id = draft_show_id;
  IF seen_shows <> 0 THEN
    RAISE EXCEPTION 'FAIL anon can see a draft show. saw %', seen_shows;
  END IF;

  SELECT count(*) INTO seen_trials FROM public.trials WHERE id = draft_trial_id;
  IF seen_trials <> 0 THEN
    RAISE EXCEPTION 'FAIL anon can see a draft show''s trial. saw %', seen_trials;
  END IF;

  SELECT count(*) INTO seen_classes FROM public.classes WHERE id = draft_class_id;
  IF seen_classes <> 0 THEN
    RAISE EXCEPTION 'FAIL anon can see a draft show''s class. saw %', seen_classes;
  END IF;
END;
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- Parity control: an unrelated, unassigned judge still sees the PUBLISHED show,
-- trial and class exactly as before -- this migration must not narrow the
-- existing public-status path.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  published_show_id uuid := '00000000-0000-0000-0000-000000833003';
  published_trial_id uuid := '00000000-0000-0000-0000-000000833005';
  published_class_id uuid := '00000000-0000-0000-0000-000000833007';
  auth_id uuid := '00000000-0000-0000-0000-000000833101';
  seen_shows integer;
  seen_trials integer;
  seen_classes integer;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', auth_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', auth_id, 'role', 'authenticated')::text,
    true
  );

  SELECT count(*) INTO seen_shows FROM public.shows WHERE id = published_show_id;
  IF seen_shows <> 1 THEN
    RAISE EXCEPTION
      'FAIL published-show visibility regressed for an unrelated authenticated user. saw %',
      seen_shows;
  END IF;

  SELECT count(*) INTO seen_trials FROM public.trials WHERE id = published_trial_id;
  IF seen_trials <> 1 THEN
    RAISE EXCEPTION
      'FAIL published-trial visibility regressed for an unrelated authenticated user. saw %',
      seen_trials;
  END IF;

  SELECT count(*) INTO seen_classes FROM public.classes WHERE id = published_class_id;
  IF seen_classes <> 1 THEN
    RAISE EXCEPTION
      'FAIL published-class visibility regressed for an unrelated authenticated user. saw %',
      seen_classes;
  END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $$
DECLARE
  published_show_id uuid := '00000000-0000-0000-0000-000000833003';
  published_trial_id uuid := '00000000-0000-0000-0000-000000833005';
  published_class_id uuid := '00000000-0000-0000-0000-000000833007';
  seen_shows integer;
  seen_trials integer;
  seen_classes integer;
BEGIN
  SELECT count(*) INTO seen_shows FROM public.shows WHERE id = published_show_id;
  IF seen_shows <> 1 THEN
    RAISE EXCEPTION 'FAIL published-show visibility regressed for anon. saw %', seen_shows;
  END IF;

  SELECT count(*) INTO seen_trials FROM public.trials WHERE id = published_trial_id;
  IF seen_trials <> 1 THEN
    RAISE EXCEPTION 'FAIL published-trial visibility regressed for anon. saw %', seen_trials;
  END IF;

  SELECT count(*) INTO seen_classes FROM public.classes WHERE id = published_class_id;
  IF seen_classes <> 1 THEN
    RAISE EXCEPTION 'FAIL published-class visibility regressed for anon. saw %', seen_classes;
  END IF;
END;
$$;
RESET ROLE;

DO $$
BEGIN
  RAISE NOTICE
    'PASS MYK9-833 assigned-judge draft show/trial/class visibility, negatives, and published parity';
END;
$$;

ROLLBACK;
