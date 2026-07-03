-- =============================================================================
-- Migration 20260703124000: SA-007 — scope trial_judge_supplies to show managers
--
-- MEDIUM (2026-07-03 pre-launch audit): all four trial_judge_supplies policies
-- gated only on `auth.uid() IS NOT NULL`, so any authenticated user (including
-- exhibitors) could read, write, or delete another trial's judge-supply rows —
-- a cross-tenant operational-data write hole.
--
-- Replaces all four policies with `can_manage_trial()` (SECURITY DEFINER, mig
-- 038 — does the trials->shows join internally and bypasses trials RLS), the
-- same CLUB-scoped authorization the accepted 087 trial_checklist_state
-- precedent uses. Authorization is club admin / club secretary / site admin per
-- the SA-002/SA-007 authz decision (Option A) — show-scoped-only officials are
-- intentionally NOT admitted; every live consumer is a club-secretary surface
-- (TrialDetailsMain view + JudgeSupplyChecklistReport). Read is scoped the same
-- as writes; pre-work (SA-007) confirmed no exhibitor/participant surface reads
-- this table, so least-privilege manager-only read regresses no consumer.
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
