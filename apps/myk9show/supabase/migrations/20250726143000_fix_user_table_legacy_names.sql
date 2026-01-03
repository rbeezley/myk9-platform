-- Fix legacy names in user table
-- Replace people references with user (from old people table name)

BEGIN;

-- 1. Fix Primary Key Constraint (only if it exists with the old name)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'people_pkey' 
               AND table_name = 'user' 
               AND table_schema = 'public') THEN
        ALTER TABLE public."user" RENAME CONSTRAINT people_pkey TO user_pkey;
    END IF;
END $$;

-- Note: The user table indexes all appear to be correctly named with user_ prefix
-- No duplicate indexes found that need cleanup

-- 2. Add comment to document the cleanup
COMMENT ON TABLE public."user" IS 'User table with cleaned up constraint names (removed people legacy references)';

COMMIT;