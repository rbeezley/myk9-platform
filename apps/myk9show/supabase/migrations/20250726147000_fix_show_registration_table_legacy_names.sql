-- Fix legacy names in show_registration table
-- Replace show_registrations references with show_registration

BEGIN;

-- 1. Fix Primary Key Constraint (only if it exists with the old name)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'show_registrations_pkey' 
               AND table_name = 'show_registration' 
               AND table_schema = 'public') THEN
        ALTER TABLE public.show_registration RENAME CONSTRAINT show_registrations_pkey TO show_registration_pkey;
    END IF;
END $$;

-- 2. Drop legacy indexes and create properly named replacements
DROP INDEX IF EXISTS public.show_registrations_checked_in_idx;
DROP INDEX IF EXISTS public.show_registrations_payment_status_idx;
DROP INDEX IF EXISTS public.show_registrations_person_id_idx;
DROP INDEX IF EXISTS public.show_registrations_registration_type_idx;
DROP INDEX IF EXISTS public.show_registrations_show_id_idx;

-- 3. Create properly named replacement indexes
CREATE INDEX IF NOT EXISTS idx_show_registration_checked_in ON public.show_registration USING btree (checked_in);
CREATE INDEX IF NOT EXISTS idx_show_registration_payment_status ON public.show_registration USING btree (payment_status);
CREATE INDEX IF NOT EXISTS idx_show_registration_person_id ON public.show_registration USING btree (person_id);
CREATE INDEX IF NOT EXISTS idx_show_registration_registration_type ON public.show_registration USING btree (registration_type);
CREATE INDEX IF NOT EXISTS idx_show_registration_show_id ON public.show_registration USING btree (show_id);

-- 4. Add comment to document the cleanup
COMMENT ON TABLE public.show_registration IS 'Show registration table with cleaned up constraint and index names (removed show_registrations legacy references)';

COMMIT;