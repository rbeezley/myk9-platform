-- Landing capture: the club demo show (MYK9-836) is not part of any capture.
-- seed-demo.sql section 20 is INSERT-ONLY: each reseed day adds a published club demo show dated
-- that day (ids dededede-0000-0000-0836-<YYYYMMDD>00NN, classes dec1a55e-0000-0000-0836-*) and
-- creates, once, a made-up exhibitor (Dana Whitcomb, a people row with no sign-in, ...0836-0000000000e1)
-- and her six dogs (...0836-0000000000d{1..6}). The landing stills and scenes are of the Heartland demo
-- and show-day fixtures, so this clears every club demo show with its children, then the dogs and the
-- person, before the first capture spec runs: they would otherwise list on Find Shows, in the
-- secretary's shows, in results and ringside. Run once by the workflow, after the seed and before the
-- capture starts, against the job's own throwaway database ONLY (the workflow refuses any URL that is
-- not this machine's stack). The seed itself never deletes any of this, on staging or anywhere else;
-- this file is the one place that does, and it must never be pointed at a shared database.
-- It has no refusals: the job's database is throwaway. Idempotent. Nothing here is a product change.

BEGIN;
DELETE FROM public.show_payments
WHERE (show_id >= 'dededede-0000-0000-0836-000000000000'::uuid
       AND show_id <  'dededede-0000-0000-0837-000000000000'::uuid)
   OR (enrollment_id >= 'dededede-0000-0000-0836-000000000000'::uuid
       AND enrollment_id <  'dededede-0000-0000-0837-000000000000'::uuid)
   OR (entry_id >= 'dededede-0000-0000-0836-000000000000'::uuid
       AND entry_id <  'dededede-0000-0000-0837-000000000000'::uuid);
-- Cart and waitlist rows: by class, by dog (NO ACTION on dogs) or by the demo
-- exhibitor (handler_id is NO ACTION on people).
DELETE FROM public.entry_cart_items
WHERE (class_id >= 'dec1a55e-0000-0000-0836-000000000000'::uuid
       AND class_id <  'dec1a55e-0000-0000-0837-000000000000'::uuid)
   OR (dog_id >= 'dededede-0000-0000-0836-000000000000'::uuid
       AND dog_id <  'dededede-0000-0000-0837-000000000000'::uuid)
   OR handler_id = 'dededede-0000-0000-0836-0000000000e1';
DELETE FROM public.waitlist_entries
WHERE (dog_id >= 'dededede-0000-0000-0836-000000000000'::uuid
       AND dog_id <  'dededede-0000-0000-0837-000000000000'::uuid)
   OR handler_id = 'dededede-0000-0000-0836-0000000000e1';
DELETE FROM public.entries
WHERE show_id >= 'dededede-0000-0000-0836-000000000000'::uuid
  AND show_id <  'dededede-0000-0000-0837-000000000000'::uuid;
DELETE FROM public.armbands
WHERE show_id >= 'dededede-0000-0000-0836-000000000000'::uuid
  AND show_id <  'dededede-0000-0000-0837-000000000000'::uuid;
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
DELETE FROM public.dogs
WHERE id >= 'dededede-0000-0000-0836-000000000000'::uuid
  AND id <  'dededede-0000-0000-0837-000000000000'::uuid;
-- The demo exhibitor last: nothing else in the range references it. A default
-- handler pointing at it (NO ACTION) is released first.
UPDATE public.exhibitor_profiles SET default_handler_id = NULL
WHERE default_handler_id = 'dededede-0000-0000-0836-0000000000e1';
DELETE FROM public.people
WHERE id = 'dededede-0000-0000-0836-0000000000e1';
COMMIT;
