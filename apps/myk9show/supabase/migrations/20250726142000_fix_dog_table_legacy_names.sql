-- Fix legacy names in dog table
-- Replace dogs references with dog and remove duplicate indexes

BEGIN;

-- 1. Fix Primary Key Constraint (only if it exists with the old name)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'dogs_pkey' 
               AND table_name = 'dog' 
               AND table_schema = 'public') THEN
        ALTER TABLE public.dog RENAME CONSTRAINT dogs_pkey TO dog_pkey;
    END IF;
END $$;

-- 2. Drop duplicate/legacy indexes
-- Keep: idx_dog_breed, idx_dog_owner_id, idx_dog_created_by, idx_dog_deleted_at, idx_dog_name, idx_dog_search_trgm
-- Drop: dogs_breed_idx, dogs_owner_id_idx, idx_dogs_owner_id

DROP INDEX IF EXISTS public.dogs_breed_idx;
DROP INDEX IF EXISTS public.dogs_owner_id_idx;
DROP INDEX IF EXISTS public.idx_dogs_owner_id;

-- Verify we still have the correct indexes (these should remain):
-- - idx_dog_breed
-- - idx_dog_owner_id
-- - idx_dog_created_by
-- - idx_dog_deleted_at
-- - idx_dog_name
-- - idx_dog_search_trgm

-- 3. Add comment to document the cleanup
COMMENT ON TABLE public.dog IS 'Dog table with cleaned up constraint and index names (removed dogs legacy references)';

COMMIT;