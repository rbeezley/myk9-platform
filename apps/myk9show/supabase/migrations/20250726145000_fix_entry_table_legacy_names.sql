-- Fix legacy names in entry table
-- Replace entries references with entry and remove duplicate indexes

BEGIN;

-- 1. Fix Primary Key Constraint (only if it exists with the old name)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'entries_pkey' 
               AND table_name = 'entry' 
               AND table_schema = 'public') THEN
        ALTER TABLE public.entry RENAME CONSTRAINT entries_pkey TO entry_pkey;
    END IF;
END $$;

-- 2. Drop legacy indexes and duplicates
-- Keep the most appropriately named ones: idx_entry_*
-- Drop: entries_* and idx_entries_* variants

DROP INDEX IF EXISTS public.entries_class_id_idx;
DROP INDEX IF EXISTS public.entries_dog_id_idx;
DROP INDEX IF EXISTS public.entries_payment_status_idx;
DROP INDEX IF EXISTS public.entries_show_id_idx;
DROP INDEX IF EXISTS public.entries_status_idx;
DROP INDEX IF EXISTS public.idx_entries_class_id;
DROP INDEX IF EXISTS public.idx_entries_dog_id;

-- 3. Create properly named replacement indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_entry_payment_status ON public.entry USING btree (payment_status);
CREATE INDEX IF NOT EXISTS idx_entry_show_id ON public.entry USING btree (show_id);

-- Note: Keep the unique constraint with legacy name for now to avoid breaking functionality
-- entries_dog_class_unique_idx - this is a complex unique constraint, keep as-is for safety

-- Verify we still have the correct indexes (these should remain):
-- - idx_entry_class_id
-- - idx_entry_dog_id  
-- - idx_entry_status
-- - idx_entry_payment_status (newly created)
-- - idx_entry_show_id (newly created)
-- - entries_dog_class_unique_idx (kept for safety)

-- 4. Add comment to document the cleanup
COMMENT ON TABLE public.entry IS 'Entry table with cleaned up constraint and index names (removed entries legacy references)';

COMMIT;