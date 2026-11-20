-- Landing capture, the four stills (MYK9-2309): the job's own database, set up for the walk.
-- Run by landingStillsCapture.spec.ts through psql, only after it has checked the target is the
-- isolated stack on this machine. It runs last, after the ring, Entries open and Results captures,
-- which leave their own entries behind and a class released, so it starts the show over and stages
-- what the four pictures show:
--   - the demo exhibitor (Casey Morgan, Willow) entered in two classes at the demo show, paid and
--     accepted, armband 100, nothing scored (My Entries, and the upcoming list on Find Shows);
--   - three results from a past show that the club has released, Willow qualified in each and
--     first in two (the dog's Past Results);
--   - the exhibitor's one-time "Show your results publicly?" question already answered (MYK9-1944).
-- Idempotent. Nothing here is a product change.

BEGIN;

-- No history at the canonical show (see landingEntriesSetup.sql): triggers and foreign keys are off
-- for the deletes only, so no money guard objects.
SET LOCAL session_replication_role = replica;
DELETE FROM public.entries
WHERE show_id IN ('dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000013');
DELETE FROM public.enrollments WHERE show_id = 'dededede-0000-0000-0000-000000000010';
DELETE FROM public.armbands WHERE show_id = 'dededede-0000-0000-0000-000000000010';
SET LOCAL session_replication_role = origin;

UPDATE public.clubs
SET email = 'secretary@heartland-scentwork.example'
WHERE id = 'dededede-0000-0000-0000-000000000001';

-- The show-day fixture is listed on Find Shows and pinned in the secretary's navigation under its
-- fixture name.
UPDATE public.shows
SET name = 'Prairie Scent Work Trial'
WHERE name LIKE 'Show-day fixture%';

-- The past show is dated sixty days back: a "Spring" trial in the fall reads as a mistake.
UPDATE public.shows
SET name = 'Prairie Trail Fall Scent Work Trial'
WHERE id = 'dededede-0000-0000-0000-000000000013';

-- The Results capture finished and released Container Novice A at the demo show; here it has not run.
UPDATE public.classes SET
  status = 'upcoming', is_scoring_finalized = false, scored_count = 0,
  results_released_at = NULL, results_verified_at = NULL, results_verified_by = NULL
WHERE id IN ('dec1a55e-0000-0000-0000-000000000031', 'dec1a55e-0000-0000-0000-000000000032');

-- The exhibitor has answered the one-time results question, so My Entries never asks it.
INSERT INTO public.exhibitor_profiles (person_id, auth_user_id, results_public_prompt_answered_at)
SELECT p.id, p.auth_user_id, now()
FROM public.people p
WHERE lower(p.email) = 'exhibitor@myk9t.com'
  AND p.auth_user_id IS NOT NULL
ON CONFLICT (auth_user_id) DO UPDATE SET results_public_prompt_answered_at = now();

-- Willow, entered in two classes on the first day, paid and accepted.
INSERT INTO public.armbands (id, show_id, dog_id, armband_number, is_available, assigned_at, version)
VALUES (
  'dededede-0000-0000-0000-0000000c0091', 'dededede-0000-0000-0000-000000000010',
  'dededede-0000-0000-0000-000000000041', '100', false, now(), 1
);

INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, handler_id, handler,
  entry_status, payment_status, entry_fee, armband, run_order, move_up_requested, version
)
VALUES
  ('dededede-0000-0000-0000-0000000c0092',
   'dededede-0000-0000-0000-000000000041', 'dec1a55e-0000-0000-0000-000000000031',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000021',
   (SELECT id FROM public.people WHERE lower(email) = 'exhibitor@myk9t.com'), 'Casey Morgan',
   'confirmed', 'paid', 30.00, 100, 1, false, 1),
  ('dededede-0000-0000-0000-0000000c0093',
   'dededede-0000-0000-0000-000000000041', 'dec1a55e-0000-0000-0000-000000000032',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000021',
   (SELECT id FROM public.people WHERE lower(email) = 'exhibitor@myk9t.com'), 'Casey Morgan',
   'confirmed', 'paid', 30.00, 100, 1, false, 1);

-- The past show: three finished classes whose results the club has released. Written with triggers
-- off, so the placements are the ones set here and no scoring rule rewrites them. Each class had two
-- dogs, Willow and Cooper (the demo's other exhibitor dog).
SET LOCAL session_replication_role = replica;

INSERT INTO public.classes (
  id, trial_id, name, level, element, section,
  entry_fee, status, time_limit_seconds, num_hides, num_areas,
  has_blank, timer_mode, hides_known, display_order, version
)
VALUES
  ('dec1a55e-0000-0000-0000-0000000c0061', 'dededede-0000-0000-0000-000000000027',
   'Interior Novice A', 'Novice', 'Interior', 'A',
   30.00, 'upcoming', 120, 1, 1, false, 'single', true, 2, 1),
  ('dec1a55e-0000-0000-0000-0000000c0062', 'dededede-0000-0000-0000-000000000027',
   'Exterior Novice A', 'Novice', 'Exterior', 'A',
   30.00, 'upcoming', 120, 1, 1, false, 'single', true, 3, 1)
ON CONFLICT (id) DO NOTHING;

UPDATE public.classes SET
  status = 'completed', is_scoring_finalized = true, scored_count = 2,
  results_verified_at = (((CURRENT_DATE - 60)::timestamp + INTERVAL '17:00:00') AT TIME ZONE 'UTC'),
  results_released_at = (((CURRENT_DATE - 60)::timestamp + INTERVAL '17:05:00') AT TIME ZONE 'UTC')
WHERE id IN (
  'dec1a55e-0000-0000-0000-000000000046',
  'dec1a55e-0000-0000-0000-0000000c0061',
  'dec1a55e-0000-0000-0000-0000000c0062'
);

-- Willow: Container Novice A first, Interior Novice A second, Exterior Novice A first.
INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, handler_id, handler,
  entry_status, payment_status, entry_fee, armband, run_order, move_up_requested, version,
  is_scored, result_status, check_in_status, search_time_seconds, total_faults, total_score,
  final_placement, scoring_completed_at
)
VALUES
  ('dededede-0000-0000-0000-0000000c0081',
   'dededede-0000-0000-0000-000000000041', 'dec1a55e-0000-0000-0000-000000000046',
   'dededede-0000-0000-0000-000000000013', 'dededede-0000-0000-0000-000000000027',
   (SELECT id FROM public.people WHERE lower(email) = 'exhibitor@myk9t.com'), 'Casey Morgan',
   'completed', 'paid', 30.00, 100, 1, false, 1,
   true, 'qualified', 'completed', 38.40, 0, 100, 1,
   (((CURRENT_DATE - 60)::timestamp + INTERVAL '15:10:00') AT TIME ZONE 'UTC')),
  ('dededede-0000-0000-0000-0000000c0082',
   'dededede-0000-0000-0000-000000000046', 'dec1a55e-0000-0000-0000-000000000046',
   'dededede-0000-0000-0000-000000000013', 'dededede-0000-0000-0000-000000000027',
   (SELECT id FROM public.people WHERE lower(email) = 'secretary@myk9t.com'), 'Jordan Ellis',
   'completed', 'paid', 30.00, 101, 2, false, 1,
   true, 'qualified', 'completed', 43.15, 0, 100, 2,
   (((CURRENT_DATE - 60)::timestamp + INTERVAL '15:16:00') AT TIME ZONE 'UTC')),
  ('dededede-0000-0000-0000-0000000c0083',
   'dededede-0000-0000-0000-000000000041', 'dec1a55e-0000-0000-0000-0000000c0061',
   'dededede-0000-0000-0000-000000000013', 'dededede-0000-0000-0000-000000000027',
   (SELECT id FROM public.people WHERE lower(email) = 'exhibitor@myk9t.com'), 'Casey Morgan',
   'completed', 'paid', 30.00, 100, 2, false, 1,
   true, 'qualified', 'completed', 52.80, 0, 100, 2,
   (((CURRENT_DATE - 60)::timestamp + INTERVAL '15:40:00') AT TIME ZONE 'UTC')),
  ('dededede-0000-0000-0000-0000000c0084',
   'dededede-0000-0000-0000-000000000046', 'dec1a55e-0000-0000-0000-0000000c0061',
   'dededede-0000-0000-0000-000000000013', 'dededede-0000-0000-0000-000000000027',
   (SELECT id FROM public.people WHERE lower(email) = 'secretary@myk9t.com'), 'Jordan Ellis',
   'completed', 'paid', 30.00, 101, 1, false, 1,
   true, 'qualified', 'completed', 47.60, 0, 100, 1,
   (((CURRENT_DATE - 60)::timestamp + INTERVAL '15:34:00') AT TIME ZONE 'UTC')),
  ('dededede-0000-0000-0000-0000000c0085',
   'dededede-0000-0000-0000-000000000041', 'dec1a55e-0000-0000-0000-0000000c0062',
   'dededede-0000-0000-0000-000000000013', 'dededede-0000-0000-0000-000000000027',
   (SELECT id FROM public.people WHERE lower(email) = 'exhibitor@myk9t.com'), 'Casey Morgan',
   'completed', 'paid', 30.00, 100, 1, false, 1,
   true, 'qualified', 'completed', 61.25, 0, 100, 1,
   (((CURRENT_DATE - 60)::timestamp + INTERVAL '16:05:00') AT TIME ZONE 'UTC')),
  ('dededede-0000-0000-0000-0000000c0086',
   'dededede-0000-0000-0000-000000000046', 'dec1a55e-0000-0000-0000-0000000c0062',
   'dededede-0000-0000-0000-000000000013', 'dededede-0000-0000-0000-000000000027',
   (SELECT id FROM public.people WHERE lower(email) = 'secretary@myk9t.com'), 'Jordan Ellis',
   'completed', 'paid', 30.00, 101, 2, false, 1,
   true, 'qualified', 'completed', 66.90, 0, 100, 2,
   (((CURRENT_DATE - 60)::timestamp + INTERVAL '16:12:00') AT TIME ZONE 'UTC'));

SET LOCAL session_replication_role = origin;

-- The past show's results show as they are scored, as the demo's other shows do.
INSERT INTO public.show_visibility_settings (
  show_id, preset, placement_timing, qualification_timing,
  time_timing, faults_timing, self_checkin_enabled
)
VALUES (
  'dededede-0000-0000-0000-000000000013',
  'open', 'class_complete', 'immediate', 'immediate', 'immediate', true
)
ON CONFLICT (show_id) DO NOTHING;

-- A failed staging says so here, in the job's log, not in a screenshot.
DO $$
DECLARE
  v_open integer;
  v_released integer;
  v_firsts integer;
BEGIN
  SELECT count(*) INTO v_open
  FROM public.entries e
  JOIN public.classes c ON c.id = e.class_id
  WHERE e.show_id = 'dededede-0000-0000-0000-000000000010'
    AND e.dog_id = 'dededede-0000-0000-0000-000000000041'
    AND e.armband = 100 AND e.is_scored = false AND c.results_released_at IS NULL;
  SELECT count(*), count(*) FILTER (WHERE e.final_placement = 1) INTO v_released, v_firsts
  FROM public.entries e
  JOIN public.classes c ON c.id = e.class_id
  WHERE e.dog_id = 'dededede-0000-0000-0000-000000000041'
    AND e.show_id = 'dededede-0000-0000-0000-000000000013'
    AND e.is_scored = true AND e.result_status = 'qualified' AND c.results_released_at IS NOT NULL;
  IF v_open <> 2 OR v_released <> 3 OR v_firsts <> 2 THEN
    RAISE EXCEPTION 'MYK9-2309 staging lost the stills: open %, released %, firsts %',
      v_open, v_released, v_firsts;
  END IF;
END $$;

COMMIT;
