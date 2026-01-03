-- Migration: Add timing fields for class scheduling to tbl_class_queue
-- Author: supabase-specialist
-- Date: 2025-09-20
-- Description: Add scheduling timestamp fields for class timing management

BEGIN;

-- Add timing fields to tbl_class_queue table
ALTER TABLE tbl_class_queue
ADD COLUMN IF NOT EXISTS scheduled_start_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS briefing_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS break_until TIMESTAMPTZ;

-- Add helpful comments explaining the purpose of each field
COMMENT ON COLUMN tbl_class_queue.scheduled_start_time IS 'When the class is scheduled to start';
COMMENT ON COLUMN tbl_class_queue.briefing_time IS 'When the briefing for this class occurs';
COMMENT ON COLUMN tbl_class_queue.break_until IS 'When break ends and class resumes';

-- Create indexes for performance when querying by timing fields
CREATE INDEX IF NOT EXISTS idx_class_queue_scheduled_start_time ON tbl_class_queue(scheduled_start_time);
CREATE INDEX IF NOT EXISTS idx_class_queue_briefing_time ON tbl_class_queue(briefing_time);
CREATE INDEX IF NOT EXISTS idx_class_queue_break_until ON tbl_class_queue(break_until);

-- Create a composite index for classes with scheduling information
CREATE INDEX IF NOT EXISTS idx_class_queue_timing_composite ON tbl_class_queue(scheduled_start_time, briefing_time)
WHERE scheduled_start_time IS NOT NULL;

COMMIT;

-- Verification queries
SELECT 'Timing fields added to tbl_class_queue successfully' as status;

-- Show the new column structure
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default,
  COALESCE(col_description(pgc.oid, a.attnum), '') as comment
FROM information_schema.columns a
JOIN pg_class pgc ON pgc.relname = a.table_name
WHERE a.table_name = 'tbl_class_queue'
  AND a.column_name IN ('scheduled_start_time', 'briefing_time', 'break_until')
ORDER BY a.column_name;