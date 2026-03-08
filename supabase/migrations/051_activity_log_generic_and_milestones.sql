-- Migration 051: Generic Activity Log + User Milestones
-- Extends activity_log to support any record type (dog, show, person, class, trial).
-- Adds user_milestones for progressive tip banners (Phase 4.2).

-- =============================================
-- ACTIVITY LOG — MAKE GENERIC
-- =============================================

-- Add generic record columns
ALTER TABLE activity_log
  ADD COLUMN IF NOT EXISTS record_type TEXT,
  ADD COLUMN IF NOT EXISTS record_id UUID;

-- Backfill existing trial-scoped rows
UPDATE activity_log
  SET record_type = 'trial', record_id = trial_id
  WHERE record_type IS NULL;

-- Make trial_id nullable (new activity entries may not be trial-scoped)
ALTER TABLE activity_log ALTER COLUMN trial_id DROP NOT NULL;

-- Drop the old action_type CHECK constraint (auto-named) and replace with broader set
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'activity_log'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%action_type%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE activity_log DROP CONSTRAINT ' || quote_ident(constraint_name);
  END IF;
END $$;

ALTER TABLE activity_log
  ADD CONSTRAINT activity_log_action_type_check CHECK (action_type IN (
    -- Original trial/pipeline actions
    'stage_transition', 'checklist_completed', 'checklist_uncompleted',
    'custom_item_added', 'custom_item_removed',
    'entry_added', 'entry_removed', 'score_submitted',
    'config_changed', 'note',
    -- Generic record actions
    'created', 'updated', 'deleted', 'status_changed',
    -- Dog actions
    'title_earned', 'registration_added', 'health_record_added',
    'training_session_added', 'owner_changed',
    -- Show actions
    'published', 'entries_opened', 'entries_closed', 'completed',
    -- Person actions
    'role_assigned', 'role_removed', 'qualification_updated',
    -- Class actions
    'results_finalized', 'results_reviewed'
  ));

-- New indexes for generic record queries
CREATE INDEX IF NOT EXISTS idx_activity_log_record
  ON activity_log(record_type, record_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_log_actor
  ON activity_log(actor_id, created_at DESC);

-- =============================================
-- USER MILESTONES (for progressive tip banners)
-- =============================================

CREATE TABLE IF NOT EXISTS user_milestones (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  milestone_key TEXT NOT NULL,
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tip_dismissed BOOLEAN NOT NULL DEFAULT false,

  PRIMARY KEY (user_id, milestone_key)
);

-- =============================================
-- ROW LEVEL SECURITY — USER MILESTONES
-- =============================================

ALTER TABLE user_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "milestones_select" ON user_milestones
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "milestones_insert" ON user_milestones
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "milestones_update" ON user_milestones
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "milestones_delete" ON user_milestones
  FOR DELETE USING (auth.uid() = user_id);
