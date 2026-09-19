-- MYK9-659: make existing replicated entries observe the new receipt reference.
--
-- 20260918193700 added registration_confirmation_number to the authenticated
-- entry-results views. The view change alone does not advance existing rows in
-- the incremental replication feed, so refresh only entries whose enrollment
-- already has the order-level reference. This deliberately uses the normal
-- entries UPDATE path: it advances OCC/version and emits the same invalidation
-- event as a real entry change, allowing online and offline readers to converge.
-- The join bounds the one-time heal to rows that can actually expose the new
-- column; it does not touch registration-less seed rows.

UPDATE public.entries AS e
SET updated_at = GREATEST(e.updated_at, now())
FROM public.enrollments AS en
WHERE en.id = e.registration_id
  AND en.confirmation_number IS NOT NULL;
