-- MYK9-659: make existing replicated entries observe the new receipt reference.
--
-- 20260918193700 added registration_confirmation_number to the authenticated
-- entry-results views. The view change alone does not advance existing rows in
-- the incremental replication feed, so refresh only entries whose enrollment
-- already has the order-level reference. The join bounds the one-time heal to
-- rows that can actually expose the new column; it does not touch
-- registration-less seed rows.

-- This is a cache invalidation, not an entry mutation. Do not increment OCC
-- versions or broadcast one show-day event per row while doing it. The normal
-- updated_at trigger is also disabled because the explicit values below are
-- deliberately monotonic across the whole batch.
ALTER TABLE public.entries DISABLE TRIGGER entries_version_increment;
ALTER TABLE public.entries DISABLE TRIGGER broadcast_entries_showday_change;
ALTER TABLE public.entries DISABLE TRIGGER update_entries_updated_at;

WITH refresh_base AS (
  SELECT GREATEST(
    COALESCE(MAX(e.updated_at), statement_timestamp()),
    statement_timestamp()
  ) AS base_at
  FROM public.entries AS e
  JOIN public.enrollments AS en ON en.id = e.registration_id
  WHERE en.confirmation_number IS NOT NULL
), refresh_rows AS (
  SELECT
    e.id,
    refresh_base.base_at
      + (row_number() OVER (ORDER BY e.id) * interval '1 microsecond') AS refreshed_at
  FROM public.entries AS e
  JOIN public.enrollments AS en ON en.id = e.registration_id
  CROSS JOIN refresh_base
  WHERE en.confirmation_number IS NOT NULL
)
UPDATE public.entries AS e
SET updated_at = refresh_rows.refreshed_at
FROM refresh_rows
WHERE e.id = refresh_rows.id;

ALTER TABLE public.entries ENABLE TRIGGER update_entries_updated_at;
ALTER TABLE public.entries ENABLE TRIGGER broadcast_entries_showday_change;
ALTER TABLE public.entries ENABLE TRIGGER entries_version_increment;
