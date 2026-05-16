-- Migration 20260516170000: Trial Judge Supplies
--
-- Per-trial-per-judge supply checklist rows for the show-day judge supply
-- checklist feature. On first "Manage supplies" open for a (trial, judge)
-- pair, the app snapshots the registry default template (held in a TS
-- constant, not a DB table) into rows here. Subsequent edits mutate these
-- rows directly. Template edits do not retroactively flow into existing
-- snapshots.
--
-- Plan: docs/plan-judge-supply-checklist.md
-- Pattern mirror: migration 046 (trial_checklist_state) — trigger function,
-- RLS posture (lazy auth.uid() IS NOT NULL), index conventions.

-- =============================================
-- TRIAL JUDGE SUPPLIES
-- =============================================

CREATE TABLE IF NOT EXISTS public.trial_judge_supplies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id UUID NOT NULL REFERENCES public.trials(id) ON DELETE CASCADE,

  -- person_id is the canonical link via judge_assignments. judge_name is
  -- denormalized for display and for the legacy case where a class has
  -- classes.judge_name set without a corresponding judge_assignments row.
  -- The snapshot is keyed by (trial_id, person_id) when person_id is set,
  -- and by (trial_id, judge_name) when it is null.
  person_id UUID REFERENCES public.people(id) ON DELETE SET NULL,
  judge_name TEXT NOT NULL CHECK (length(judge_name) BETWEEN 1 AND 200),

  item_label TEXT NOT NULL CHECK (length(item_label) BETWEEN 1 AND 200),
  included BOOLEAN NOT NULL DEFAULT true,
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  sort_order INTEGER NOT NULL DEFAULT 0,
  -- true if added by secretary as a custom item, false if seeded from the
  -- registry template. Custom rows can be deleted; template rows can only
  -- be excluded (included = false).
  is_custom BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique indexes prevent duplicate seeds from concurrent
-- ensureSeededForJudge calls. Postgres treats nulls as not-equal in
-- unique constraints, so a single UNIQUE(trial_id, person_id, item_label)
-- would not catch the person_id = NULL case (legacy judges).
CREATE UNIQUE INDEX IF NOT EXISTS trial_judge_supplies_unique_with_person
  ON public.trial_judge_supplies (trial_id, person_id, item_label)
  WHERE person_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS trial_judge_supplies_unique_no_person
  ON public.trial_judge_supplies (trial_id, judge_name, item_label)
  WHERE person_id IS NULL;

CREATE INDEX IF NOT EXISTS trial_judge_supplies_trial_judge_idx
  ON public.trial_judge_supplies (trial_id, person_id, sort_order);

CREATE INDEX IF NOT EXISTS trial_judge_supplies_trial_name_idx
  ON public.trial_judge_supplies (trial_id, judge_name, sort_order);

DROP TRIGGER IF EXISTS set_trial_judge_supplies_updated_at
  ON public.trial_judge_supplies;
CREATE TRIGGER set_trial_judge_supplies_updated_at
  BEFORE UPDATE ON public.trial_judge_supplies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE public.trial_judge_supplies ENABLE ROW LEVEL SECURITY;

-- Mirrors the lazy auth.uid() IS NOT NULL pattern from trial_checklist_state
-- in migration 046. Any authenticated user can read and write; show-scoped
-- gating happens at the application layer via the trial selection.
DROP POLICY IF EXISTS "trial_judge_supplies_select" ON public.trial_judge_supplies;
CREATE POLICY "trial_judge_supplies_select" ON public.trial_judge_supplies
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "trial_judge_supplies_insert" ON public.trial_judge_supplies;
CREATE POLICY "trial_judge_supplies_insert" ON public.trial_judge_supplies
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "trial_judge_supplies_update" ON public.trial_judge_supplies;
CREATE POLICY "trial_judge_supplies_update" ON public.trial_judge_supplies
  FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "trial_judge_supplies_delete" ON public.trial_judge_supplies;
CREATE POLICY "trial_judge_supplies_delete" ON public.trial_judge_supplies
  FOR DELETE USING (auth.uid() IS NOT NULL);
