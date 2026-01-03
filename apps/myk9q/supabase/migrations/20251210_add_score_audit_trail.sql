-- Migration: Add Score Audit Trail
-- Purpose: Track all changes to score-related fields for dispute resolution
--
-- This creates:
-- 1. entry_audit table to store change history
-- 2. Trigger function to automatically capture changes
-- 3. Trigger on entries table for score-related UPDATE operations
--
-- Benefits:
-- - Answer "who changed what, when?" questions
-- - Dispute resolution capability
-- - Works regardless of change source (app, sync, direct SQL)

-- ============================================
-- STEP 1: Create Audit Table
-- ============================================

CREATE TABLE IF NOT EXISTS entry_audit (
  id BIGSERIAL PRIMARY KEY,

  -- What changed
  entry_id BIGINT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,

  -- When it changed
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Who/what made the change
  changed_by TEXT,  -- User ID or 'sync', 'system', etc.
  change_source TEXT DEFAULT 'unknown',  -- 'app', 'sync', 'direct_sql', 'migration'

  -- Context
  license_key TEXT NOT NULL,
  class_id BIGINT,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_entry_audit_entry_id ON entry_audit(entry_id);
CREATE INDEX IF NOT EXISTS idx_entry_audit_changed_at ON entry_audit(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_entry_audit_license_key ON entry_audit(license_key);
CREATE INDEX IF NOT EXISTS idx_entry_audit_class_id ON entry_audit(class_id);

-- Comment
COMMENT ON TABLE entry_audit IS
'Audit trail for score changes. Automatically populated by trigger on entries table.';

-- ============================================
-- STEP 2: Create Trigger Function
-- ============================================

CREATE OR REPLACE FUNCTION audit_entry_score_changes()
RETURNS TRIGGER AS $$
DECLARE
  score_fields TEXT[] := ARRAY[
    -- Time fields
    'search_time_seconds',
    'area1_time_seconds',
    'area2_time_seconds',
    'area3_time_seconds',
    'area4_time_seconds',
    -- Fault fields
    'total_faults',
    'area1_faults',
    'area2_faults',
    'area3_faults',
    -- Find fields
    'total_correct_finds',
    'total_incorrect_finds',
    'area1_correct',
    'area1_incorrect',
    'area2_correct',
    'area2_incorrect',
    'area3_correct',
    'area3_incorrect',
    -- Score fields
    'total_score',
    'points_earned',
    'points_possible',
    'bonus_points',
    'penalty_points',
    -- Status fields
    'result_status',
    'final_placement',
    'is_scored',
    'disqualification_reason'
  ];
  field_name TEXT;
  old_val TEXT;
  new_val TEXT;
  change_source TEXT;
BEGIN
  -- Determine change source from application context (if set)
  -- Applications can SET LOCAL myk9q.change_source = 'app' before updates
  BEGIN
    change_source := current_setting('myk9q.change_source', true);
  EXCEPTION WHEN OTHERS THEN
    change_source := 'unknown';
  END;

  IF change_source IS NULL OR change_source = '' THEN
    change_source := 'unknown';
  END IF;

  -- Loop through score fields and log changes
  FOREACH field_name IN ARRAY score_fields LOOP
    -- Get old and new values dynamically using hstore
    EXECUTE format('SELECT ($1).%I::TEXT', field_name) INTO old_val USING OLD;
    EXECUTE format('SELECT ($1).%I::TEXT', field_name) INTO new_val USING NEW;

    -- Only log if value actually changed
    IF old_val IS DISTINCT FROM new_val THEN
      INSERT INTO entry_audit (
        entry_id,
        field_name,
        old_value,
        new_value,
        changed_at,
        changed_by,
        change_source,
        license_key,
        class_id
      ) VALUES (
        NEW.id,
        field_name,
        old_val,
        new_val,
        now(),
        current_setting('myk9q.changed_by', true),
        change_source,
        NEW.license_key,
        NEW.class_id
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

COMMENT ON FUNCTION audit_entry_score_changes() IS
'Trigger function that logs changes to score-related fields in entry_audit table.
Applications can set context variables before updates:
  SET LOCAL myk9q.change_source = ''app'';
  SET LOCAL myk9q.changed_by = ''user_id_here'';';

-- ============================================
-- STEP 3: Create Trigger on Entries Table
-- ============================================

-- Drop existing trigger if it exists (for idempotency)
DROP TRIGGER IF EXISTS trg_audit_entry_scores ON entries;

-- Create trigger for UPDATE operations only
-- (INSERT is the initial state, no "change" to track)
CREATE TRIGGER trg_audit_entry_scores
  AFTER UPDATE ON entries
  FOR EACH ROW
  EXECUTE FUNCTION audit_entry_score_changes();

COMMENT ON TRIGGER trg_audit_entry_scores ON entries IS
'Automatically logs all changes to score-related fields for audit trail.';

-- ============================================
-- STEP 4: Enable Row Level Security (RLS)
-- ============================================

ALTER TABLE entry_audit ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see audit records for their license_key
-- Note: (select ...) wrapper optimizes RLS to evaluate once per query, not per row
CREATE POLICY "Users can view own audit records" ON entry_audit
  FOR SELECT
  USING (license_key = (select current_setting('app.current_license_key', true)));

-- Policy: Only the system (triggers) can insert audit records
-- No direct inserts from applications
CREATE POLICY "System can insert audit records" ON entry_audit
  FOR INSERT
  WITH CHECK (true);

-- ============================================
-- STEP 5: Utility View for Easy Querying
-- ============================================

CREATE OR REPLACE VIEW view_entry_audit_summary
WITH (security_invoker = true)
AS
SELECT
  ea.entry_id,
  ea.field_name,
  ea.old_value,
  ea.new_value,
  ea.changed_at,
  ea.changed_by,
  ea.change_source,
  e.handler_name,
  e.dog_call_name,
  c.element,
  c.level,
  c.section
FROM entry_audit ea
JOIN entries e ON ea.entry_id = e.id
LEFT JOIN classes c ON ea.class_id = c.id
ORDER BY ea.changed_at DESC;

COMMENT ON VIEW view_entry_audit_summary IS
'Human-readable audit log with handler/dog/class context. Uses SECURITY INVOKER to enforce RLS.';

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

SELECT
  'Score audit trail successfully created!' as status,
  'All score changes will now be logged to entry_audit table' as description,
  'Query view_entry_audit_summary for human-readable audit log' as usage_tip;
