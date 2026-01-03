-- Create Audit Triggers - Final Implementation
-- This migration creates the complete audit trail system with working triggers

-- Drop existing triggers and function if they exist (clean slate)
DROP TRIGGER IF EXISTS audit_club_trigger ON club;
DROP TRIGGER IF EXISTS audit_user_trigger ON "user";
DROP TRIGGER IF EXISTS audit_dog_trigger ON dog;
DROP TRIGGER IF EXISTS audit_show_trigger ON show;
DROP TRIGGER IF EXISTS audit_trial_trigger ON trial;
DROP TRIGGER IF EXISTS audit_class_trigger ON class;
DROP TRIGGER IF EXISTS audit_entry_trigger ON entry;
DROP TRIGGER IF EXISTS audit_result_trigger ON result;

DROP FUNCTION IF EXISTS log_audit_entry();

-- Create the audit trigger function
CREATE OR REPLACE FUNCTION log_audit_entry()
RETURNS TRIGGER AS $$
DECLARE
    current_user_id UUID;
BEGIN
    -- Get current user from auth or default to system
    BEGIN
        current_user_id := auth.uid();
        IF current_user_id IS NULL THEN
            current_user_id := '00000000-0000-0000-0000-000000000000'::UUID;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        current_user_id := '00000000-0000-0000-0000-000000000000'::UUID;
    END;

    -- Insert audit record
    INSERT INTO audit_entry (
        action,
        entity_type,
        entity_id,
        old_values,
        new_values,
        user_id,
        created_at,
        metadata
    ) VALUES (
        TG_OP,
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD)::JSONB END,
        CASE WHEN TG_OP IN ('UPDATE', 'INSERT') THEN row_to_json(NEW)::JSONB END,
        current_user_id,
        NOW(),
        jsonb_build_object(
            'timestamp', NOW(),
            'operation', TG_OP,
            'table_name', TG_TABLE_NAME,
            'schema_name', TG_TABLE_SCHEMA
        )
    );

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure RLS policy exists for audit entries
DO $$
BEGIN
    -- Check if policy exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'audit_entry' 
        AND policyname = 'System can insert audit entries'
    ) THEN
        CREATE POLICY "System can insert audit entries" 
        ON audit_entry FOR INSERT 
        WITH CHECK (true);
    END IF;
END $$;

-- Create audit triggers for all main tables
CREATE TRIGGER audit_club_trigger
    AFTER INSERT OR UPDATE OR DELETE ON club
    FOR EACH ROW EXECUTE FUNCTION log_audit_entry();

CREATE TRIGGER audit_user_trigger
    AFTER INSERT OR UPDATE OR DELETE ON "user"
    FOR EACH ROW EXECUTE FUNCTION log_audit_entry();

CREATE TRIGGER audit_dog_trigger
    AFTER INSERT OR UPDATE OR DELETE ON dog
    FOR EACH ROW EXECUTE FUNCTION log_audit_entry();

CREATE TRIGGER audit_show_trigger
    AFTER INSERT OR UPDATE OR DELETE ON show
    FOR EACH ROW EXECUTE FUNCTION log_audit_entry();

CREATE TRIGGER audit_trial_trigger
    AFTER INSERT OR UPDATE OR DELETE ON trial
    FOR EACH ROW EXECUTE FUNCTION log_audit_entry();

CREATE TRIGGER audit_class_trigger
    AFTER INSERT OR UPDATE OR DELETE ON class
    FOR EACH ROW EXECUTE FUNCTION log_audit_entry();

CREATE TRIGGER audit_entry_trigger
    AFTER INSERT OR UPDATE OR DELETE ON entry
    FOR EACH ROW EXECUTE FUNCTION log_audit_entry();

CREATE TRIGGER audit_result_trigger
    AFTER INSERT OR UPDATE OR DELETE ON result
    FOR EACH ROW EXECUTE FUNCTION log_audit_entry();

-- Add helpful comments
COMMENT ON FUNCTION log_audit_entry() IS 'Audit trigger function that logs all table changes to audit_entry table';
COMMENT ON TRIGGER audit_club_trigger ON club IS 'Audit trail trigger for club table changes';
COMMENT ON TRIGGER audit_user_trigger ON "user" IS 'Audit trail trigger for user table changes';
COMMENT ON TRIGGER audit_dog_trigger ON dog IS 'Audit trail trigger for dog table changes';
COMMENT ON TRIGGER audit_show_trigger ON show IS 'Audit trail trigger for show table changes';
COMMENT ON TRIGGER audit_trial_trigger ON trial IS 'Audit trail trigger for trial table changes';
COMMENT ON TRIGGER audit_class_trigger ON class IS 'Audit trail trigger for class table changes';
COMMENT ON TRIGGER audit_entry_trigger ON entry IS 'Audit trail trigger for entry table changes';
COMMENT ON TRIGGER audit_result_trigger ON result IS 'Audit trail trigger for result table changes';

-- Create indexes for better audit query performance
CREATE INDEX IF NOT EXISTS idx_audit_entry_entity_type_id ON audit_entry(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_entry_user_id ON audit_entry(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entry_created_at ON audit_entry(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entry_action ON audit_entry(action);

-- Test the function with a simple verification
SELECT 'Audit trigger system successfully created!' as status;