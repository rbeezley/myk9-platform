-- Landing capture, Results scene (MYK9-2308): the job's own database, set up for the walk.
-- Run by landingSceneResultsCapture.spec.ts through psql, only after it has checked the target is
-- the isolated stack on this machine. It runs after the ring and Entries open captures, which leave
-- their own entries behind, so it starts the show over the same way the Entries setup does and then
-- stages ONE finished class: Container Novice A, every dog scored, the class marked Complete, the
-- results checked by no one and released to no one. The exhibitor is the one the Entries open scene
-- follows (Riley Parker and Piper), and she has already answered the "Show your results publicly?"
-- prompt, so it is not in any frame. Idempotent: every statement can run on a database the Entries
-- setup has or has not touched. Nothing here is a product change.

BEGIN;

-- No history at the canonical show (see landingEntriesSetup.sql): triggers and foreign keys are off
-- for the deletes only, so no money guard objects.
SET LOCAL session_replication_role = replica;
DELETE FROM public.entries WHERE show_id = 'dededede-0000-0000-0000-000000000010';
DELETE FROM public.enrollments WHERE show_id = 'dededede-0000-0000-0000-000000000010';
DELETE FROM public.armbands WHERE show_id = 'dededede-0000-0000-0000-000000000010';
SET LOCAL session_replication_role = origin;

UPDATE public.clubs
SET email = 'secretary@heartland-scentwork.example'
WHERE id = 'dededede-0000-0000-0000-000000000001';

UPDATE public.shows
SET name = 'Prairie Scent Work Trial'
WHERE name LIKE 'Show-day fixture%';

-- The second demo exhibitor, under the name and address a club would see (a guard trigger refuses a
-- contact address that differs from the sign-in one, so it is changed with triggers off, as in the
-- Entries setup; a database that setup already touched has nothing left to change here).
SET LOCAL session_replication_role = replica;
UPDATE public.people
SET email = 'riley.parker@heartland-scentwork.example'
WHERE lower(email) = 'exhibitor2@myk9t.com';
SET LOCAL session_replication_role = origin;

-- She has answered the one-time results question, so the page never asks it (MYK9-1944).
INSERT INTO public.exhibitor_profiles (person_id, auth_user_id, results_public_prompt_answered_at)
SELECT p.id, p.auth_user_id, now()
FROM public.people p
WHERE lower(p.email) = 'riley.parker@heartland-scentwork.example'
  AND p.auth_user_id IS NOT NULL
ON CONFLICT (auth_user_id) DO UPDATE SET results_public_prompt_answered_at = now();

INSERT INTO public.dogs (id, name, call_name, breed, sex, date_of_birth, color, status, owner_id, version)
VALUES
  ('dededede-0000-0000-0000-0000000c0001', 'Piper', 'Piper', 'Labrador Retriever', 'female', '2022-04-09', 'Yellow', 'active',
   (SELECT id FROM public.people WHERE lower(email) = 'riley.parker@heartland-scentwork.example'), 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.dog_registrations (
  dog_id, organization, registration_number, registered_name, breed, status, is_primary
)
SELECT d.id, 'AKC (American Kennel Club)', 'SR' || upper(substr(md5(d.id::text), 1, 8)),
       d.name, d.breed, 'Active', true
FROM public.dogs d
WHERE d.id = 'dededede-0000-0000-0000-0000000c0001'
  AND NOT EXISTS (
    SELECT 1 FROM public.dog_registrations r
    WHERE r.dog_id = d.id AND r.organization = 'AKC (American Kennel Club)'
  );

-- Armbands for the three dogs that ran (the show's armband list is empty after the wipe above).
INSERT INTO public.armbands (id, show_id, dog_id, armband_number, is_available, assigned_at, version)
VALUES
  ('dededede-0000-0000-0000-0000000c0041', 'dededede-0000-0000-0000-000000000010',
   'dededede-0000-0000-0000-000000000041', '100', false, now(), 1),
  ('dededede-0000-0000-0000-0000000c0042', 'dededede-0000-0000-0000-000000000010',
   'dededede-0000-0000-0000-0000000c0001', '101', false, now(), 1),
  ('dededede-0000-0000-0000-0000000c0043', 'dededede-0000-0000-0000-000000000010',
   'dededede-0000-0000-0000-000000000046', '102', false, now(), 1);

-- Container Novice A (Saturday, Trial 1): three entries, unscored. Piper is the exhibitor's, Willow
-- and Cooper are the demo's own dogs. Different handlers, so no handler clash is flagged.
INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, handler_id, handler,
  entry_status, payment_status, entry_fee, armband, run_order, move_up_requested, version
)
VALUES
  ('dededede-0000-0000-0000-0000000c0051',
   'dededede-0000-0000-0000-000000000041', 'dec1a55e-0000-0000-0000-000000000031',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000021',
   (SELECT id FROM public.people WHERE lower(email) = 'exhibitor@myk9t.com'), 'Casey Morgan',
   'confirmed', 'paid', 30.00, 100, 1, false, 1),
  ('dededede-0000-0000-0000-0000000c0052',
   'dededede-0000-0000-0000-0000000c0001', 'dec1a55e-0000-0000-0000-000000000031',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000021',
   (SELECT id FROM public.people WHERE lower(email) = 'riley.parker@heartland-scentwork.example'), 'Riley Parker',
   'confirmed', 'paid', 30.00, 101, 2, false, 1),
  ('dededede-0000-0000-0000-0000000c0053',
   'dededede-0000-0000-0000-000000000046', 'dec1a55e-0000-0000-0000-000000000031',
   'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000021',
   (SELECT id FROM public.people WHERE lower(email) = 'secretary@myk9t.com'), 'Jordan Ellis',
   'confirmed', 'paid', 30.00, 102, 3, false, 1);

-- The class is finished and marked Complete, and nothing is released or checked yet. (The class row
-- is set first, as the seed's preliminary-results fixture does, because the entry trigger owns
-- placement and clears a partly scored class.) The placements are the ones that trigger computes for
-- a non-nationals class: qualified, fewest faults, then the fastest time.
UPDATE public.classes SET
  status = 'completed', is_scoring_finalized = true, scored_count = 3,
  results_released_at = NULL, results_verified_at = NULL, results_verified_by = NULL
WHERE id = 'dec1a55e-0000-0000-0000-000000000031';

UPDATE public.entries SET
  is_scored = true, result_status = 'qualified', check_in_status = 'completed',
  entry_status = 'completed', search_time_seconds = 41.30, total_faults = 0,
  total_score = 100, final_placement = 1,
  scoring_completed_at = (((CURRENT_DATE + 45)::timestamp + INTERVAL '09:15:00') AT TIME ZONE 'UTC')
WHERE id = 'dededede-0000-0000-0000-0000000c0052';  -- Piper
UPDATE public.entries SET
  is_scored = true, result_status = 'qualified', check_in_status = 'completed',
  entry_status = 'completed', search_time_seconds = 44.90, total_faults = 0,
  total_score = 100, final_placement = 2,
  scoring_completed_at = (((CURRENT_DATE + 45)::timestamp + INTERVAL '09:22:00') AT TIME ZONE 'UTC')
WHERE id = 'dededede-0000-0000-0000-0000000c0051';  -- Willow
UPDATE public.entries SET
  is_scored = true, result_status = 'qualified', check_in_status = 'completed',
  entry_status = 'completed', search_time_seconds = 47.25, total_faults = 0,
  total_score = 100, final_placement = 3,
  scoring_completed_at = (((CURRENT_DATE + 45)::timestamp + INTERVAL '09:30:00') AT TIME ZONE 'UTC')
WHERE id = 'dededede-0000-0000-0000-0000000c0053';  -- Cooper

-- A failed staging says so here, in the job's log, not in a screenshot.
DO $$
DECLARE
  v_placements text;
  v_class record;
BEGIN
  SELECT string_agg(final_placement::text, ',' ORDER BY final_placement) INTO v_placements
  FROM public.entries
  WHERE class_id = 'dec1a55e-0000-0000-0000-000000000031' AND is_scored = true;
  SELECT status, scored_count, results_released_at, results_verified_at INTO v_class
  FROM public.classes WHERE id = 'dec1a55e-0000-0000-0000-000000000031';
  IF v_placements IS DISTINCT FROM '1,2,3'
     OR v_class.status IS DISTINCT FROM 'completed'
     OR v_class.scored_count IS DISTINCT FROM 3
     OR v_class.results_released_at IS NOT NULL
     OR v_class.results_verified_at IS NOT NULL THEN
    RAISE EXCEPTION 'MYK9-2308 staging lost the finished class: placements %, class %', v_placements, v_class;
  END IF;
END $$;

COMMIT;
