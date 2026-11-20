-- Landing capture, Entries open scene (MYK9-2296): the job's own database, set up for the walk.
-- Run by landingSceneEntriesCapture.spec.ts through psql, only after it has checked the target is
-- the isolated stack on this machine. It runs after the ring capture and nothing reads the old
-- entries again, so the show is made to look like a club's own: one exhibitor, two dogs, one
-- form, a plausible secretary contact and no fixture names. Nothing here is a product change.

BEGIN;

-- No history at the canonical show: the demo seed's entries, forms and armbands (refunds,
-- withdrawals, a paid multi-dog order) are the seed's test fixtures, not what a club sees.
-- Triggers and foreign keys are off for the deletes only, so no money guard objects.
SET LOCAL session_replication_role = replica;
DELETE FROM public.entries WHERE show_id = 'dededede-0000-0000-0000-000000000010';
DELETE FROM public.enrollments WHERE show_id = 'dededede-0000-0000-0000-000000000010';
DELETE FROM public.armbands WHERE show_id = 'dededede-0000-0000-0000-000000000010';
SET LOCAL session_replication_role = origin;

-- The address the wizard's full-class reason and the club's emails come from.
UPDATE public.clubs
SET email = 'secretary@heartland-scentwork.example'
WHERE id = 'dededede-0000-0000-0000-000000000001';

-- The show-day fixture is pinned in the secretary's navigation under its fixture name.
UPDATE public.shows
SET name = 'Prairie Scent Work Trial'
WHERE name LIKE 'Show-day fixture%';

-- The second demo exhibitor (no entries anywhere), under a name and address a club would see.
UPDATE public.people
SET email = 'riley.parker@heartland-scentwork.example'
WHERE lower(email) = 'exhibitor2@myk9t.com';

INSERT INTO public.dogs (id, name, call_name, breed, sex, date_of_birth, color, status, owner_id, version)
VALUES
  ('dededede-0000-0000-0000-0000000c0001', 'Piper', 'Piper', 'Labrador Retriever', 'female', '2022-04-09', 'Yellow', 'active',
   (SELECT id FROM public.people WHERE lower(email) = 'riley.parker@heartland-scentwork.example'), 1),
  ('dededede-0000-0000-0000-0000000c0002', 'Tessa', 'Tessa', 'Border Collie', 'female', '2021-08-23', 'Black & White', 'active',
   (SELECT id FROM public.people WHERE lower(email) = 'riley.parker@heartland-scentwork.example'), 1);

INSERT INTO public.dog_registrations (
  dog_id, organization, registration_number, registered_name, breed, status, is_primary
)
SELECT d.id, 'AKC (American Kennel Club)', 'SR' || upper(substr(md5(d.id::text), 1, 8)),
       d.name, d.breed, 'Active', true
FROM public.dogs d
WHERE d.id IN (
  'dededede-0000-0000-0000-0000000c0001',
  'dededede-0000-0000-0000-0000000c0002'
);

-- Tessa is already entered, in the class that holds one dog and no more, so for Piper it is full.
-- Her form is the one Piper's entry joins.
INSERT INTO public.enrollments (id, show_id, handler_id, payment_status, payment_method, total_amount)
VALUES (
  'dededede-0000-0000-0000-0000000c0021',
  'dededede-0000-0000-0000-000000000010',
  (SELECT id FROM public.people WHERE lower(email) = 'riley.parker@heartland-scentwork.example'),
  'pending', 'check', 3000
);

INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, handler_id, handler, registration_id,
  entry_status, payment_status, entry_fee, armband, run_order, move_up_requested, version
)
VALUES (
  'dededede-0000-0000-0000-0000000c0011',
  'dededede-0000-0000-0000-0000000c0002', 'dec1a55e-0000-0000-0000-000000000045',
  'dededede-0000-0000-0000-000000000010', 'dededede-0000-0000-0000-000000000024',
  (SELECT id FROM public.people WHERE lower(email) = 'riley.parker@heartland-scentwork.example'),
  'Riley Parker', 'dededede-0000-0000-0000-0000000c0021',
  'confirmed', 'pending', 30.00, 100, 1, false, 1
);

INSERT INTO public.armbands (id, show_id, dog_id, armband_number, is_available, assigned_at, version)
VALUES (
  'dededede-0000-0000-0000-0000000c0031', 'dededede-0000-0000-0000-000000000010',
  'dededede-0000-0000-0000-0000000c0002', '100', false, now(), 1
);

COMMIT;
