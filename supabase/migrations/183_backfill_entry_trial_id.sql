-- Backfill trial_id on entries that were submitted before migration 182.
-- Resolves via classes.trial_id since that FK is always set.
UPDATE public.entries e
SET trial_id = c.trial_id
FROM public.classes c
WHERE e.class_id = c.id
  AND e.trial_id IS NULL;
