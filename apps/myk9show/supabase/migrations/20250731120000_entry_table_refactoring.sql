-- Migration: Entry Table Refactoring - Split into entry and class_entry tables
-- Author: Supabase Specialist  
-- Date: 2025-01-31
-- Description: Implements the e-commerce pattern for dog show entries
--              Following the analysis in docs/database/entry-refactoring-analysis.md

BEGIN;

-- =============================================================================
-- STEP 1: CREATE NEW CLASS_ENTRY TABLE
-- =============================================================================

-- Create the new class_entry table for class-specific data
CREATE TABLE IF NOT EXISTS class_entry (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  entry_id UUID NOT NULL,
  class_id UUID NOT NULL,
  trial_id UUID NOT NULL,
  
  -- Class-specific assignment fields
  armband VARCHAR(10),
  run_order INTEGER,
  jump_height VARCHAR(20),
  entry_fee DECIMAL(10,2),
  preferred_judge TEXT,
  
  -- Class-specific status
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'accepted', 'rejected', 'waitlisted', 'withdrawn', 'competing'
  )),
  
  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ,
  
  -- Foreign key constraints
  CONSTRAINT class_entry_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES entry(id) ON DELETE CASCADE,
  CONSTRAINT class_entry_class_id_fkey FOREIGN KEY (class_id) REFERENCES class(id) ON DELETE CASCADE,
  CONSTRAINT class_entry_trial_id_fkey FOREIGN KEY (trial_id) REFERENCES trial(id) ON DELETE CASCADE,
  
  -- Unique constraint to prevent duplicate class entries
  CONSTRAINT class_entry_entry_class_unique UNIQUE (entry_id, class_id)
);

-- Add table comment for documentation
COMMENT ON TABLE class_entry IS 'Class-specific entry data following e-commerce OrderItem pattern';
COMMENT ON COLUMN class_entry.entry_id IS 'Reference to the main entry (Order)';
COMMENT ON COLUMN class_entry.class_id IS 'Reference to the specific class';
COMMENT ON COLUMN class_entry.trial_id IS 'Reference to the trial for direct queries';
COMMENT ON COLUMN class_entry.status IS 'Class-specific status: pending, accepted, rejected, waitlisted, withdrawn, competing';

-- =============================================================================
-- STEP 2: ADD NEW COLUMNS TO EXISTING ENTRY TABLE
-- =============================================================================

-- Add new entry-level fields to the existing entry table
ALTER TABLE entry 
ADD COLUMN IF NOT EXISTS entry_status TEXT DEFAULT 'draft' CHECK (entry_status IN (
  'draft', 'submitted', 'accepted', 'rejected', 'withdrawn'
)),
ADD COLUMN IF NOT EXISTS total_fees DECIMAL(10,2) DEFAULT 0.00;

-- Add column comments
COMMENT ON COLUMN entry.entry_status IS 'Overall entry status separate from individual class statuses';
COMMENT ON COLUMN entry.total_fees IS 'Automatically calculated sum of all class entry fees';

-- =============================================================================
-- STEP 3: CREATE INDEXES FOR PERFORMANCE
-- =============================================================================

-- Indexes for class_entry table
CREATE INDEX IF NOT EXISTS idx_class_entry_entry_id ON class_entry(entry_id);
CREATE INDEX IF NOT EXISTS idx_class_entry_class_id ON class_entry(class_id);
CREATE INDEX IF NOT EXISTS idx_class_entry_trial_id ON class_entry(trial_id);
CREATE INDEX IF NOT EXISTS idx_class_entry_status ON class_entry(status);
CREATE INDEX IF NOT EXISTS idx_class_entry_created_at ON class_entry(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_class_entry_active ON class_entry(id) WHERE deleted_at IS NULL;

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_class_entry_entry_status ON class_entry(entry_id, status);
CREATE INDEX IF NOT EXISTS idx_class_entry_class_status ON class_entry(class_id, status);
CREATE INDEX IF NOT EXISTS idx_class_entry_trial_status ON class_entry(trial_id, status);

-- New indexes for updated entry table
CREATE INDEX IF NOT EXISTS idx_entry_entry_status ON entry(entry_status);
CREATE INDEX IF NOT EXISTS idx_entry_total_fees ON entry(total_fees) WHERE total_fees > 0;

-- =============================================================================
-- STEP 4: CREATE TRIGGERS FOR AUTOMATIC TOTAL_FEES CALCULATION
-- =============================================================================

-- Function to calculate total fees for an entry
CREATE OR REPLACE FUNCTION calculate_total_fees()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the total_fees for the entry based on all associated class_entry records
  UPDATE entry 
  SET total_fees = (
    SELECT COALESCE(SUM(entry_fee), 0) 
    FROM class_entry 
    WHERE entry_id = COALESCE(NEW.entry_id, OLD.entry_id)
    AND deleted_at IS NULL
    AND status NOT IN ('rejected', 'withdrawn')
  ),
  updated_at = NOW()
  WHERE id = COALESCE(NEW.entry_id, OLD.entry_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add function comment
COMMENT ON FUNCTION calculate_total_fees() IS 'Automatically recalculates total_fees when class_entry records change';

-- Create triggers for automatic fee calculation
CREATE TRIGGER trigger_calculate_total_fees_insert
  AFTER INSERT ON class_entry
  FOR EACH ROW EXECUTE FUNCTION calculate_total_fees();

CREATE TRIGGER trigger_calculate_total_fees_update
  AFTER UPDATE ON class_entry
  FOR EACH ROW EXECUTE FUNCTION calculate_total_fees();

CREATE TRIGGER trigger_calculate_total_fees_delete
  AFTER DELETE ON class_entry
  FOR EACH ROW EXECUTE FUNCTION calculate_total_fees();

-- =============================================================================
-- STEP 5: ENABLE ROW LEVEL SECURITY AND CREATE POLICIES
-- =============================================================================

-- Enable RLS on class_entry table
ALTER TABLE class_entry ENABLE ROW LEVEL SECURITY;

-- Policy for viewing class entries - users can see entries they created or are associated with
CREATE POLICY "Users can view their own class entries" ON class_entry
  FOR SELECT USING (
    -- User created the parent entry
    entry_id IN (
      SELECT id FROM entry WHERE created_by = auth.uid()
    )
    OR 
    -- User is associated with the dog in the entry
    entry_id IN (
      SELECT e.id FROM entry e
      JOIN dog d ON e.dog_id = d.id
      WHERE d.owner_id = auth.uid() OR d.created_by = auth.uid()
    )
    OR
    -- User has admin or secretary role
    EXISTS (
      SELECT 1 FROM user_role ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role_name IN ('admin', 'secretary')
    )
  );

-- Policy for creating class entries
CREATE POLICY "Users can create class entries for their entries" ON class_entry
  FOR INSERT WITH CHECK (
    -- User created the parent entry
    entry_id IN (
      SELECT id FROM entry WHERE created_by = auth.uid()
    )
    OR 
    -- User is associated with the dog in the entry
    entry_id IN (
      SELECT e.id FROM entry e
      JOIN dog d ON e.dog_id = d.id
      WHERE d.owner_id = auth.uid() OR d.created_by = auth.uid()
    )
    OR
    -- User has admin or secretary role
    EXISTS (
      SELECT 1 FROM user_role ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role_name IN ('admin', 'secretary')
    )
  );

-- Policy for updating class entries
CREATE POLICY "Users can update their own class entries" ON class_entry
  FOR UPDATE USING (
    -- User created the parent entry
    entry_id IN (
      SELECT id FROM entry WHERE created_by = auth.uid()
    )
    OR 
    -- User is associated with the dog in the entry
    entry_id IN (
      SELECT e.id FROM entry e
      JOIN dog d ON e.dog_id = d.id
      WHERE d.owner_id = auth.uid() OR d.created_by = auth.uid()
    )
    OR
    -- User has admin or secretary role
    EXISTS (
      SELECT 1 FROM user_role ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role_name IN ('admin', 'secretary')
    )
  ) WITH CHECK (
    -- Same conditions as SELECT policy
    entry_id IN (
      SELECT id FROM entry WHERE created_by = auth.uid()
    )
    OR 
    entry_id IN (
      SELECT e.id FROM entry e
      JOIN dog d ON e.dog_id = d.id
      WHERE d.owner_id = auth.uid() OR d.created_by = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM user_role ur 
      WHERE ur.user_id = auth.uid() 
      AND ur.role_name IN ('admin', 'secretary')
    )
  );

-- Policy for deleting class entries (soft delete only)
CREATE POLICY "Users can delete their own class entries" ON class_entry
  FOR UPDATE USING (
    deleted_at IS NULL AND (
      entry_id IN (
        SELECT id FROM entry WHERE created_by = auth.uid()
      )
      OR 
      entry_id IN (
        SELECT e.id FROM entry e
        JOIN dog d ON e.dog_id = d.id
        WHERE d.owner_id = auth.uid() OR d.created_by = auth.uid()
      )
      OR
      EXISTS (
        SELECT 1 FROM user_role ur 
        WHERE ur.user_id = auth.uid() 
        AND ur.role_name IN ('admin', 'secretary')
      )
    )
  );

-- =============================================================================
-- STEP 6: CREATE AUDIT TRIGGERS FOR CLASS_ENTRY TABLE
-- =============================================================================

-- Add audit trigger for class_entry table (reuse existing audit function)
DO $$
BEGIN
  -- Check if the audit function exists
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_audit_log') THEN
    EXECUTE 'CREATE TRIGGER audit_class_entry_changes
      AFTER INSERT OR UPDATE OR DELETE ON class_entry
      FOR EACH ROW EXECUTE FUNCTION create_audit_log()';
  ELSE
    RAISE NOTICE 'Audit function create_audit_log() not found. Audit trigger not created.';
  END IF;
END
$$;

-- =============================================================================
-- STEP 7: CREATE MIGRATION HELPER FUNCTIONS
-- =============================================================================

-- Function to migrate existing entry data to the new structure
CREATE OR REPLACE FUNCTION migrate_entry_data_to_class_entry()
RETURNS TEXT AS $$
DECLARE
  record_count INTEGER := 0;
  entry_record RECORD;
  trial_id_var UUID;
BEGIN
  -- Migrate existing entry records to class_entry
  FOR entry_record IN 
    SELECT 
      id as entry_id,
      class_id,
      armband,
      run_order,
      jump_height,
      entry_fee,
      preferred_judge,
      status,
      created_at,
      updated_at,
      created_by,
      updated_by
    FROM entry 
    WHERE class_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM class_entry ce WHERE ce.entry_id = entry.id AND ce.class_id = entry.class_id
      )
  LOOP
    -- Get trial_id from class
    SELECT c.trial_id INTO trial_id_var
    FROM class c
    WHERE c.id = entry_record.class_id;
    
    -- Only proceed if we found a valid trial_id
    IF trial_id_var IS NOT NULL THEN
      INSERT INTO class_entry (
        entry_id,
        class_id,
        trial_id,
        armband,
        run_order,
        jump_height,
        entry_fee,
        preferred_judge,
        status,
        created_at,
        updated_at,
        created_by,
        updated_by
      ) VALUES (
        entry_record.entry_id,
        entry_record.class_id,
        trial_id_var,
        entry_record.armband,
        entry_record.run_order,
        entry_record.jump_height,
        entry_record.entry_fee,
        entry_record.preferred_judge,
        COALESCE(entry_record.status, 'pending'),
        entry_record.created_at,
        entry_record.updated_at,
        entry_record.created_by,
        entry_record.updated_by
      );
      
      record_count := record_count + 1;
    END IF;
  END LOOP;
  
  -- Update entry_status based on existing status
  UPDATE entry 
  SET entry_status = CASE 
    WHEN status IN ('submitted', 'confirmed', 'paid') THEN 'submitted'
    WHEN status = 'withdrawn' THEN 'withdrawn'
    WHEN status = 'rejected' THEN 'rejected'
    ELSE 'draft'
  END
  WHERE entry_status IS NULL OR entry_status = 'draft';
  
  -- Calculate total_fees for all entries (the trigger will handle this going forward)
  UPDATE entry 
  SET total_fees = (
    SELECT COALESCE(SUM(ce.entry_fee), 0) 
    FROM class_entry ce 
    WHERE ce.entry_id = entry.id
    AND ce.deleted_at IS NULL
    AND ce.status NOT IN ('rejected', 'withdrawn')
  );
  
  RETURN format('Successfully migrated %s records to class_entry table', record_count);
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION migrate_entry_data_to_class_entry() IS 'One-time migration function to populate class_entry from existing entry data';

-- =============================================================================
-- STEP 8: CREATE HELPER VIEWS FOR BACKWARD COMPATIBILITY
-- =============================================================================

-- View that combines entry and class_entry data for backward compatibility
CREATE OR REPLACE VIEW entry_with_class_details AS
SELECT 
  e.id,
  e.dog_id,
  e.show_id,
  e.handler,
  e.handler_id,
  e.payment_status,
  e.special_requests,
  e.move_up_requested,
  e.submitted_at,
  e.entry_status,
  e.total_fees,
  e.created_at,
  e.updated_at,
  e.created_by,
  e.updated_by,
  e.deleted_at,
  -- Class entry details
  ce.id as class_entry_id,
  ce.class_id,
  ce.trial_id,
  ce.armband,
  ce.run_order,
  ce.jump_height,
  ce.entry_fee,
  ce.preferred_judge,
  ce.status as class_status
FROM entry e
LEFT JOIN class_entry ce ON e.id = ce.entry_id AND ce.deleted_at IS NULL;

-- Add view comment
COMMENT ON VIEW entry_with_class_details IS 'Backward compatibility view combining entry and class_entry data';

-- =============================================================================
-- STEP 9: CREATE VALIDATION FUNCTIONS
-- =============================================================================

-- Function to validate the migration
CREATE OR REPLACE FUNCTION validate_entry_migration()
RETURNS TABLE(
  validation_check TEXT,
  status TEXT,
  count_value BIGINT,
  details TEXT
) AS $$
BEGIN
  -- Check total entries
  RETURN QUERY
  SELECT 
    'Total Entries'::TEXT,
    'INFO'::TEXT,
    COUNT(*)::BIGINT,
    'Total number of entry records'::TEXT
  FROM entry;
  
  -- Check class entries created
  RETURN QUERY
  SELECT 
    'Class Entries Created'::TEXT,
    'INFO'::TEXT,
    COUNT(*)::BIGINT,
    'Total number of class_entry records created'::TEXT
  FROM class_entry;
  
  -- Check entries with calculated total_fees
  RETURN QUERY
  SELECT 
    'Entries with Total Fees'::TEXT,
    'INFO'::TEXT,
    COUNT(*)::BIGINT,
    'Entries where total_fees has been calculated'::TEXT
  FROM entry
  WHERE total_fees IS NOT NULL AND total_fees > 0;
  
  -- Check for entries without class associations
  RETURN QUERY
  SELECT 
    'Entries without Class Entries'::TEXT,
    CASE WHEN COUNT(*) > 0 THEN 'WARNING' ELSE 'OK' END::TEXT,
    COUNT(*)::BIGINT,
    'Entries that do not have corresponding class_entry records'::TEXT
  FROM entry e
  WHERE NOT EXISTS (
    SELECT 1 FROM class_entry ce WHERE ce.entry_id = e.id AND ce.deleted_at IS NULL
  ) AND e.deleted_at IS NULL;
  
  -- Check for orphaned class entries
  RETURN QUERY
  SELECT 
    'Orphaned Class Entries'::TEXT,
    CASE WHEN COUNT(*) > 0 THEN 'ERROR' ELSE 'OK' END::TEXT,
    COUNT(*)::BIGINT,
    'Class entries without corresponding entry records'::TEXT
  FROM class_entry ce
  WHERE NOT EXISTS (
    SELECT 1 FROM entry e WHERE e.id = ce.entry_id
  );
  
  -- Check fee calculations
  RETURN QUERY
  SELECT 
    'Fee Calculation Accuracy'::TEXT,
    CASE WHEN COUNT(*) > 0 THEN 'WARNING' ELSE 'OK' END::TEXT,
    COUNT(*)::BIGINT,
    'Entries where calculated total_fees does not match sum of class entry fees'::TEXT
  FROM entry e
  WHERE e.total_fees != (
    SELECT COALESCE(SUM(ce.entry_fee), 0) 
    FROM class_entry ce 
    WHERE ce.entry_id = e.id
    AND ce.deleted_at IS NULL
    AND ce.status NOT IN ('rejected', 'withdrawn')
  );
  
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION validate_entry_migration() IS 'Validates the entry table refactoring migration';

-- =============================================================================
-- STEP 10: GRANT PERMISSIONS
-- =============================================================================

-- Grant permissions for the new table
GRANT SELECT, INSERT, UPDATE, DELETE ON class_entry TO authenticated;
GRANT SELECT ON entry_with_class_details TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_total_fees() TO authenticated;
GRANT EXECUTE ON FUNCTION migrate_entry_data_to_class_entry() TO service_role;
GRANT EXECUTE ON FUNCTION validate_entry_migration() TO authenticated;

-- Grant usage on the sequence if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'class_entry_id_seq') THEN
    GRANT USAGE ON SEQUENCE class_entry_id_seq TO authenticated;
  END IF;
END
$$;

COMMIT;

-- =============================================================================
-- POST-MIGRATION INSTRUCTIONS
-- =============================================================================

-- After running this migration, execute the following steps:

-- 1. Run the data migration (as service_role or superuser):
-- SELECT migrate_entry_data_to_class_entry();

-- 2. Validate the migration:
-- SELECT * FROM validate_entry_migration();

-- 3. Test the new structure with sample queries:
-- SELECT * FROM entry_with_class_details LIMIT 5;

-- 4. Verify triggers are working:
-- INSERT INTO class_entry (entry_id, class_id, trial_id, entry_fee) 
-- VALUES (...) -- and check if total_fees updates automatically

-- =============================================================================
-- MIGRATION NOTES
-- =============================================================================

-- This migration implements the e-commerce pattern for dog show entries:
-- - entry table = Order (payment, customer, submission info)
-- - class_entry table = OrderItem (specific class details, pricing)

-- Key benefits:
-- 1. Proper normalization eliminates data redundancy
-- 2. Clean separation of entry-level vs class-level concerns  
-- 3. Supports multiple classes per entry efficiently
-- 4. Automatic total fee calculation via triggers
-- 5. Comprehensive audit trail and RLS policies
-- 6. Backward compatibility through views

-- The migration maintains data integrity through:
-- - Foreign key constraints with proper cascade behavior
-- - Check constraints for valid status values
-- - Unique constraints to prevent duplicate entries
-- - Automatic fee calculation triggers
-- - Comprehensive RLS policies for security

-- Future cleanup migrations should:
-- - Remove legacy columns from entry table after application updates
-- - Add any additional business logic constraints
-- - Optimize indexes based on actual query patterns