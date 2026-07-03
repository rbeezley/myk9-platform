-- Scope trial judge supply checklist access to officials for the owning trial.
-- SA-007 follow-up for the original logged-in-only policies.

DROP POLICY IF EXISTS "trial_judge_supplies_select" ON public.trial_judge_supplies;
DROP POLICY IF EXISTS "trial_judge_supplies_insert" ON public.trial_judge_supplies;
DROP POLICY IF EXISTS "trial_judge_supplies_update" ON public.trial_judge_supplies;
DROP POLICY IF EXISTS "trial_judge_supplies_delete" ON public.trial_judge_supplies;

CREATE POLICY "trial_judge_supplies_select" ON public.trial_judge_supplies
  FOR SELECT TO authenticated
  USING (
    public.can_manage_trial(trial_id)
  );

CREATE POLICY "trial_judge_supplies_insert" ON public.trial_judge_supplies
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_trial(trial_id)
  );

CREATE POLICY "trial_judge_supplies_update" ON public.trial_judge_supplies
  FOR UPDATE TO authenticated
  USING (
    public.can_manage_trial(trial_id)
  )
  WITH CHECK (
    public.can_manage_trial(trial_id)
  );

CREATE POLICY "trial_judge_supplies_delete" ON public.trial_judge_supplies
  FOR DELETE TO authenticated
  USING (
    public.can_manage_trial(trial_id)
  );
