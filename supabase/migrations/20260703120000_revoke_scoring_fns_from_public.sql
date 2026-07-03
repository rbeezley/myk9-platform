-- SA-001: keep internal placement/scoring refresh functions off direct client RPC.
--
-- The entries trigger still calls refresh_class_scoring_state() with definer
-- rights. The authenticated wrapper below preserves the at-show manual
-- backstop, but mirrors ringside scoring authorization before invoking the
-- internal routine.

BEGIN;

CREATE OR REPLACE FUNCTION public.refresh_class_scoring_state_authorized(
  p_class_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid;
  v_class_id uuid;
  v_club_id uuid;
  v_caller_person_id uuid;
  v_is_manager boolean;
  v_is_assigned_judge boolean;
  v_claim_kind text;
  v_claim_show_id text;
  v_claim_role text;
  v_has_judge_claim boolean;
BEGIN
  SELECT c.id, t.show_id, s.club_id
    INTO v_class_id, v_show_id, v_club_id
    FROM public.classes c
    JOIN public.trials t ON t.id = c.trial_id
    JOIN public.shows s ON s.id = t.show_id
   WHERE c.id = p_class_id;

  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'Class % not found', p_class_id
      USING errcode = 'P0002';
  END IF;

  IF v_show_id IS NULL OR v_club_id IS NULL THEN
    RAISE EXCEPTION 'Class % not found or missing show context', p_class_id
      USING errcode = '42501';
  END IF;

  SELECT p.id
    INTO v_caller_person_id
    FROM public.people p
   WHERE p.auth_user_id = (SELECT auth.uid())
   LIMIT 1;

  v_is_manager :=
    public.is_site_admin()
    OR public.is_trial_secretary(v_club_id)
    OR public.is_club_admin(v_club_id);

  v_is_assigned_judge := v_caller_person_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.judge_assignments ja
     WHERE ja.person_id = v_caller_person_id
       AND ja.class_id = v_class_id
       AND ja.status IN ('confirmed', 'invited')
  );

  v_claim_kind := (SELECT auth.jwt()) -> 'app_metadata' ->> 'kind';
  v_claim_show_id := nullif(((SELECT auth.jwt()) -> 'app_metadata' ->> 'show_id'), '');
  v_claim_role := (SELECT auth.jwt()) -> 'app_metadata' ->> 'ringside_role';
  v_has_judge_claim :=
    v_claim_kind = 'ringside_passcode'
    AND v_claim_show_id IS NOT NULL
    AND v_claim_show_id = v_show_id::text
    AND v_claim_role IN ('judge', 'admin');

  IF NOT (v_is_manager OR v_is_assigned_judge OR v_has_judge_claim) THEN
    RAISE EXCEPTION 'Not authorized to refresh scoring state for class %', p_class_id
      USING errcode = '42501';
  END IF;

  PERFORM public.refresh_class_scoring_state(p_class_id);
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_class_placements(uuid[], boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_class_scoring_state(uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.refresh_class_scoring_state_authorized(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_class_scoring_state_authorized(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
