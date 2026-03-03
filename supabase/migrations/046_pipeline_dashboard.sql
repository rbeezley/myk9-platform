-- Migration 046: Pipeline Dashboard
-- Adds pipeline stage tracking, checklist state persistence, and activity logging.

-- =============================================
-- TRIALS TABLE — ADD PIPELINE STAGE
-- =============================================

ALTER TABLE trials
  ADD COLUMN IF NOT EXISTS pipeline_stage INTEGER NOT NULL DEFAULT 1
    CHECK (pipeline_stage >= 1 AND pipeline_stage <= 6);

CREATE INDEX IF NOT EXISTS idx_trials_pipeline_stage ON trials(pipeline_stage);

-- =============================================
-- TRIAL CHECKLIST STATE
-- =============================================

CREATE TABLE IF NOT EXISTS trial_checklist_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id UUID NOT NULL REFERENCES trials(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL CHECK (stage >= 1 AND stage <= 6),
  item_key TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('canned', 'custom')),
  label TEXT,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  auto_completed BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT trial_checklist_unique UNIQUE (trial_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_checklist_trial_id ON trial_checklist_state(trial_id);
CREATE INDEX IF NOT EXISTS idx_checklist_trial_stage ON trial_checklist_state(trial_id, stage);

DROP TRIGGER IF EXISTS set_trial_checklist_state_updated_at ON trial_checklist_state;
CREATE TRIGGER set_trial_checklist_state_updated_at
  BEFORE UPDATE ON trial_checklist_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- ACTIVITY LOG
-- =============================================

CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id UUID NOT NULL REFERENCES trials(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'stage_transition', 'checklist_completed', 'checklist_uncompleted',
    'custom_item_added', 'custom_item_removed',
    'entry_added', 'entry_removed', 'score_submitted',
    'config_changed', 'note'
  )),
  description TEXT NOT NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_trial_id ON activity_log(trial_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_trial_created ON activity_log(trial_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_action_type ON activity_log(action_type);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE trial_checklist_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checklist_select" ON trial_checklist_state;
CREATE POLICY "checklist_select" ON trial_checklist_state
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "checklist_insert" ON trial_checklist_state;
CREATE POLICY "checklist_insert" ON trial_checklist_state
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "checklist_update" ON trial_checklist_state;
CREATE POLICY "checklist_update" ON trial_checklist_state
  FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "checklist_delete" ON trial_checklist_state;
CREATE POLICY "checklist_delete" ON trial_checklist_state
  FOR DELETE USING (auth.uid() IS NOT NULL);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_log_select" ON activity_log;
CREATE POLICY "activity_log_select" ON activity_log
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "activity_log_insert" ON activity_log;
CREATE POLICY "activity_log_insert" ON activity_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Activity log is append-only: no update/delete policies
