-- =============================================================================
-- Migration 20260703124000: SA-007 — scope trial_judge_supplies to show officials
--
-- MEDIUM (2026-07-03 pre-launch audit): all four trial_judge_supplies policies
-- gated only on `auth.uid() IS NOT NULL`, so any authenticated user (including
-- exhibitors) could read, write, or delete another trial's judge-supply rows —
-- a cross-tenant operational-data write hole.
--
-- Replaces all four policies with `trials`-joined predicates gating on
-- can_manage_show() of the row's trial's show, mirroring the accepted 087
-- trial_checklist_state precedent. Read is scoped the same as writes:
-- pre-work (SA-007) confirmed every consumer of this table is an official
-- surface (TrialDetailsMain secretary view + JudgeSupplyChecklistReport); no
-- exhibitor/participant surface reads it, so least-privilege official-only read
-- is correct and does not regress any consumer.
-- =============================================================================

-- SELECT: only users who manage the row's trial's show (or platform admin)
DROP POLICY IF EXISTS "trial_judge_supplies_select" ON public.trial_judge_supplies;
CREATE POLICY "trial_judge_supplies_select" ON public.trial_judge_supplies
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_site_admin())
    OR (SELECT public.can_manage_trial(trial_judge_supplies.trial_id))
  );

-- INSERT: only show managers or platform admins
DROP POLICY IF EXISTS "trial_judge_supplies_insert" ON public.trial_judge_supplies;
CREATE POLICY "trial_judge_supplies_insert" ON public.trial_judge_supplies
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_site_admin())
    OR (SELECT public.can_manage_trial(trial_judge_supplies.trial_id))
  );

-- UPDATE: only show managers or platform admins
DROP POLICY IF EXISTS "trial_judge_supplies_update" ON public.trial_judge_supplies;
CREATE POLICY "trial_judge_supplies_update" ON public.trial_judge_supplies
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_site_admin())
    OR (SELECT public.can_manage_trial(trial_judge_supplies.trial_id))
  );

-- DELETE: only show managers or platform admins
DROP POLICY IF EXISTS "trial_judge_supplies_delete" ON public.trial_judge_supplies;
CREATE POLICY "trial_judge_supplies_delete" ON public.trial_judge_supplies
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_site_admin())
    OR (SELECT public.can_manage_trial(trial_judge_supplies.trial_id))
  );

NOTIFY pgrst, 'reload schema';
