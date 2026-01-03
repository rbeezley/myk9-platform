-- Fix legacy names in show table
-- Replace shows references with show

BEGIN;

-- 1. Fix Primary Key Constraint (only if it exists with the old name)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'shows_pkey' 
               AND table_name = 'show' 
               AND table_schema = 'public') THEN
        ALTER TABLE public.show RENAME CONSTRAINT shows_pkey TO show_pkey;
    END IF;
END $$;

-- 2. Fix Foreign Key Constraint (only if it exists with the old name)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'shows_club_id_fkey' 
               AND table_name = 'show' 
               AND table_schema = 'public') THEN
        ALTER TABLE public.show RENAME CONSTRAINT shows_club_id_fkey TO show_club_id_fkey;
    END IF;
END $$;

-- 3. Fix Check Constraint (only if it exists with the old name)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'shows_status_check' 
               AND table_name = 'show' 
               AND table_schema = 'public') THEN
        ALTER TABLE public.show RENAME CONSTRAINT shows_status_check TO show_status_check;
    END IF;
END $$;

-- 4. Drop duplicate/legacy indexes (keep the correct ones)
-- Keep: idx_show_start_date, idx_show_club_id
-- Drop: shows_club_id_idx, shows_start_date_idx, shows_status_idx, idx_shows_club_id

DROP INDEX IF EXISTS public.shows_club_id_idx;
DROP INDEX IF EXISTS public.shows_start_date_idx;
DROP INDEX IF EXISTS public.shows_status_idx;
DROP INDEX IF EXISTS public.idx_shows_club_id;

-- Verify we still have the correct indexes (these should remain):
-- - idx_show_start_date 
-- - idx_show_club_id

-- 5. Add comment to document the cleanup
COMMENT ON TABLE public.show IS 'Show table with cleaned up constraint and index names (removed shows legacy references)';

COMMIT;