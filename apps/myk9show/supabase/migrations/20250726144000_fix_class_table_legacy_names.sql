-- Fix legacy names in class table
-- Replace classes references with class and remove duplicate indexes

BEGIN;

-- 1. Fix Primary Key Constraint (only if it exists with the old name)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'classes_pkey' 
               AND table_name = 'class' 
               AND table_schema = 'public') THEN
        ALTER TABLE public.class RENAME CONSTRAINT classes_pkey TO class_pkey;
    END IF;
END $$;

-- 2. Drop legacy indexes and duplicates
-- Keep: idx_class_trial_id (most appropriately named)
-- Drop: classes_level_idx, classes_trial_id_idx, idx_classes_trial_id

DROP INDEX IF EXISTS public.classes_level_idx;
DROP INDEX IF EXISTS public.classes_trial_id_idx;
DROP INDEX IF EXISTS public.idx_classes_trial_id;

-- 3. Create properly named replacement indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_class_level ON public.class USING btree (level);

-- Note: idx_class_trial_id already exists and is correctly named
-- Verify we still have the correct indexes (these should remain):
-- - idx_class_trial_id

-- 4. Add comment to document the cleanup
COMMENT ON TABLE public.class IS 'Class table with cleaned up constraint and index names (removed classes legacy references)';

COMMIT;