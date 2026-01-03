-- Fix legacy names in class_template table
-- Replace class_templates references with class_template

BEGIN;

-- 1. Fix Primary Key Constraint (only if it exists with the old name)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints 
               WHERE constraint_name = 'class_templates_pkey' 
               AND table_name = 'class_template' 
               AND table_schema = 'public') THEN
        ALTER TABLE public.class_template RENAME CONSTRAINT class_templates_pkey TO class_template_pkey;
    END IF;
END $$;

-- 2. Drop legacy indexes and create properly named replacements
DROP INDEX IF EXISTS public.class_templates_created_by_idx;
DROP INDEX IF EXISTS public.class_templates_is_active_idx;
DROP INDEX IF EXISTS public.class_templates_organization_idx;
DROP INDEX IF EXISTS public.class_templates_show_type_idx;

-- 3. Create properly named replacement indexes
CREATE INDEX IF NOT EXISTS idx_class_template_created_by ON public.class_template USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_class_template_is_active ON public.class_template USING btree (is_active);
CREATE INDEX IF NOT EXISTS idx_class_template_organization ON public.class_template USING btree (organization);
CREATE INDEX IF NOT EXISTS idx_class_template_show_type ON public.class_template USING btree (show_type);

-- 4. Add comment to document the cleanup
COMMENT ON TABLE public.class_template IS 'Class template table with cleaned up constraint and index names (removed class_templates legacy references)';

COMMIT;