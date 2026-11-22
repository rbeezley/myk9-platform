-- Landing capture: the club demo show (MYK9-836) is not part of any capture.
-- seed-demo.sql section 20 builds a published club demo show dated today, with six dogs owned by
-- the second demo exhibitor (Riley Parker). The landing stills and scenes are of the Heartland
-- demo and show-day fixtures, so this clears the whole club demo show range before the first
-- capture spec runs: it would otherwise list on Find Shows, in the secretary's shows, on
-- Riley's dogs and entries, in results and ringside. Run once by the workflow, after the seed and
-- before the capture starts, against the job's own database. Range-scoped exactly like
-- seed-demo.sql section 0 (dededede-0000-0000-0836-*, dec1a55e-0000-0000-0836-*), children first.
-- Idempotent. Nothing here is a product change.

BEGIN;
DELETE FROM public.show_payments
WHERE (show_id >= 'dededede-0000-0000-0836-000000000000'::uuid
       AND show_id <  'dededede-0000-0000-0837-000000000000'::uuid)
   OR (enrollment_id >= 'dededede-0000-0000-0836-000000000000'::uuid
       AND enrollment_id <  'dededede-0000-0000-0837-000000000000'::uuid)
   OR (entry_id >= 'dededede-0000-0000-0836-000000000000'::uuid
       AND entry_id <  'dededede-0000-0000-0837-000000000000'::uuid);
DELETE FROM public.entry_cart_items
WHERE class_id >= 'dec1a55e-0000-0000-0836-000000000000'::uuid
  AND class_id <  'dec1a55e-0000-0000-0837-000000000000'::uuid;
DELETE FROM public.entries
WHERE show_id >= 'dededede-0000-0000-0836-000000000000'::uuid
  AND show_id <  'dededede-0000-0000-0837-000000000000'::uuid;
DELETE FROM public.armbands
WHERE show_id >= 'dededede-0000-0000-0836-000000000000'::uuid
  AND show_id <  'dededede-0000-0000-0837-000000000000'::uuid;
-- waitlist_entries.dog_id and entry_cart_items.dog_id are NO ACTION, so a join or
-- cart row a walk made for one of the club demo dogs is cleared before the dogs.
DELETE FROM public.waitlist_entries
WHERE dog_id >= 'dededede-0000-0000-0836-000000000000'::uuid
  AND dog_id <  'dededede-0000-0000-0837-000000000000'::uuid;
DELETE FROM public.entry_cart_items
WHERE dog_id >= 'dededede-0000-0000-0836-000000000000'::uuid
  AND dog_id <  'dededede-0000-0000-0837-000000000000'::uuid;
DELETE FROM public.dogs
WHERE id >= 'dededede-0000-0000-0836-000000000000'::uuid
  AND id <  'dededede-0000-0000-0837-000000000000'::uuid;
DELETE FROM public.enrollments
WHERE show_id >= 'dededede-0000-0000-0836-000000000000'::uuid
  AND show_id <  'dededede-0000-0000-0837-000000000000'::uuid;
DELETE FROM public.judge_assignments
WHERE show_id >= 'dededede-0000-0000-0836-000000000000'::uuid
  AND show_id <  'dededede-0000-0000-0837-000000000000'::uuid;
DELETE FROM public.classes
WHERE id >= 'dec1a55e-0000-0000-0836-000000000000'::uuid
  AND id <  'dec1a55e-0000-0000-0837-000000000000'::uuid;
DELETE FROM public.trials
WHERE id >= 'dededede-0000-0000-0836-000000000000'::uuid
  AND id <  'dededede-0000-0000-0837-000000000000'::uuid;
DELETE FROM public.show_visibility_settings
WHERE show_id >= 'dededede-0000-0000-0836-000000000000'::uuid
  AND show_id <  'dededede-0000-0000-0837-000000000000'::uuid;
DELETE FROM public.shows
WHERE id >= 'dededede-0000-0000-0836-000000000000'::uuid
  AND id <  'dededede-0000-0000-0837-000000000000'::uuid;
COMMIT;
