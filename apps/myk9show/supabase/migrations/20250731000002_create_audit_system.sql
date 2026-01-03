-- Create Proper Audit Trail System
-- This migration creates the complete audit trail functionality that was missing

-- First, create the audit trigger function
CREATE OR REPLACE FUNCTION log_audit_entry()
RETURNS TRIGGER AS $$
DECLARE
    audit_data JSONB;
    current_user_id UUID;
BEGIN
    -- Get current user from session or default to system
    BEGIN
        current_user_id := current_setting('app.current_user_id', TRUE)::UUID;
    EXCEPTION WHEN OTHERS THEN
        current_user_id := '00000000-0000-0000-0000-000000000000'::UUID; -- System user
    END;

    -- Build audit data based on operation type
    audit_data := jsonb_build_object(
        'timestamp', NOW(),
        'operation', TG_OP,
        'table_name', TG_TABLE_NAME,
        'schema_name', TG_TABLE_SCHEMA
    );

    -- Add old and new values based on operation
    IF TG_OP = 'DELETE' THEN
        audit_data := audit_data || jsonb_build_object('old_values', row_to_json(OLD));
    ELSIF TG_OP = 'UPDATE' THEN
        audit_data := audit_data || jsonb_build_object(
            'old_values', row_to_json(OLD),
            'new_values', row_to_json(NEW)
        );
    ELSIF TG_OP = 'INSERT' THEN
        audit_data := audit_data || jsonb_build_object('new_values', row_to_json(NEW));
    END IF;

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
        audit_data
    );

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add RLS policy to allow audit entries to be inserted
CREATE POLICY "System can insert audit entries" 
ON audit_entry FOR INSERT 
TO authenticated, anon
WITH CHECK (true);

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

-- Add indexes for audit performance
CREATE INDEX IF NOT EXISTS idx_audit_entry_entity_type ON audit_entry(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_entry_entity_id ON audit_entry(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_entry_user_id ON audit_entry(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entry_created_at ON audit_entry(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entry_action ON audit_entry(action);

-- Add comments
COMMENT ON FUNCTION log_audit_entry() IS 'Audit trigger function that logs all table changes to audit_entry table';
COMMENT ON TRIGGER audit_club_trigger ON club IS 'Audit trail trigger for club table changes';
COMMENT ON TRIGGER audit_user_trigger ON "user" IS 'Audit trail trigger for user table changes';
COMMENT ON TRIGGER audit_dog_trigger ON dog IS 'Audit trail trigger for dog table changes';
COMMENT ON TRIGGER audit_show_trigger ON show IS 'Audit trail trigger for show table changes';
COMMENT ON TRIGGER audit_trial_trigger ON trial IS 'Audit trail trigger for trial table changes';
COMMENT ON TRIGGER audit_class_trigger ON class IS 'Audit trail trigger for class table changes';
COMMENT ON TRIGGER audit_entry_trigger ON entry IS 'Audit trail trigger for entry table changes';
COMMENT ON TRIGGER audit_result_trigger ON result IS 'Audit trail trigger for result table changes';