-- Migration 035: Convert show date columns from DATE to TIMESTAMPTZ
-- Enables storing exact times for show start/end and entry open/close
-- Existing DATE values implicitly cast to midnight UTC (no data loss)

ALTER TABLE shows ALTER COLUMN start_date TYPE TIMESTAMPTZ USING start_date::TIMESTAMPTZ;
ALTER TABLE shows ALTER COLUMN end_date TYPE TIMESTAMPTZ USING end_date::TIMESTAMPTZ;
ALTER TABLE shows ALTER COLUMN entry_open_date TYPE TIMESTAMPTZ USING entry_open_date::TIMESTAMPTZ;
ALTER TABLE shows ALTER COLUMN entry_close_date TYPE TIMESTAMPTZ USING entry_close_date::TIMESTAMPTZ;
