-- supabase/migrations/134_entries_pending_idx.sql
-- Partial index for cross-show pending entry queries used by the secretary dashboard Entries tab.

CREATE INDEX IF NOT EXISTS entries_payment_status_show_id_idx
  ON entries (payment_status, show_id)
  WHERE payment_status = 'pending';

-- ROLLBACK:
--   DROP INDEX IF EXISTS entries_payment_status_show_id_idx;
