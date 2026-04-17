-- Secretary-controlled sort order for classes within a trial.
-- Drives the Kanban column order in the class pipeline and any
-- other surface that lists classes in display-friendly order.

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS display_order INTEGER;

-- Backfill: seed each trial's classes in creation order with a
-- 10-step gap so new inserts can slot between without renumbering.
UPDATE public.classes c
SET display_order = sub.seq * 10
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY trial_id ORDER BY created_at) AS seq
  FROM public.classes
  WHERE display_order IS NULL
) sub
WHERE c.id = sub.id AND c.display_order IS NULL;

CREATE INDEX IF NOT EXISTS idx_classes_trial_display_order
  ON public.classes (trial_id, display_order);
