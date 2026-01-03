-- Fix legacy names in club table
-- Replace clubs references with club

BEGIN;

-- 1. Fix Primary Key Constraint (only if it exists with the old name)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'clubs_pkey' 
               AND table_name = 'club' 
               AND table_schema = 'public') THEN
        ALTER TABLE public.club RENAME CONSTRAINT clubs_pkey TO club_pkey;
    END IF;
END $$;

-- 2. Add comment to document the cleanup
COMMENT ON TABLE public.club IS 'Club table with cleaned up constraint names (removed clubs legacy references)';

COMMIT;