-- =============================================================================
-- Migration 20260731160000: officials-only accessor for judge-set hide counts
--
-- SA-2026-07-29-01 / MYK9-127, part A of two. This half is ADDITIVE and safe to
-- apply on its own, ahead of the code that uses it.
--
--   A (this file)   creates get_show_class_hide_counts. Changes no existing
--                   behaviour: nothing calls it until the client ships.
--   B (…170000)     revokes authenticated's table-wide SELECT on classes and
--                   re-grants the 54 non-secret columns. That one MUST land with
--                   the client change.
--
-- WHY SPLIT. The two halves are unsafe in either order as a single migration:
--   * code-then-migration — the client calls an RPC that does not exist and every
--     class sync 404s. CI caught exactly this on PR #1542.
--   * migration-then-code — the REVOKE lands while the deployed client still does
--     `select('*')` on classes, so every class sync 42501s for every user.
-- Expand first, contract second: A can sit applied indefinitely with no effect,
-- and B becomes safe the moment the client stops selecting the column.
--
-- WHAT IT DOES. Returns the judge-set hide count for a show's classes to show
-- officials only. `classes.num_hides` is the count a judge picked inside the
-- rule's band on a class whose count was deliberately not disclosed
-- (hides_known = false); a competitor who reads it before running has a decisive
-- advantage.
--
-- WHY A FUNCTION AND NOT A VIEW. The natural view shape needs a per-row
-- authorization call — the O(N) policy anti-pattern this repo has had to unwind
-- before. Ringside syncs per show, so a show-scoped function authorizes ONCE and
-- then filters rows with plain joins.
--
-- WHY NOT is_show_official(). It resolves only site_admin / secretary / chairman /
-- steward from user_roles. It never consults judge_assignments and has no notion
-- of a passcode session, so gating on it would deny the assigned judge — the
-- person the hide count exists for — and every account-less ringside user. The
-- tiers below are copied from ringside_update_entry (20260712101000), which
-- already resolves exactly this question; one answer rather than two is the point.
--
-- EXHIBITOR PASSCODES DO NOT QUALIFY. A show passcode can carry ringside_role
-- 'exhibitor'; only judge/admin/steward are accepted, and the claim's generation
-- must be current so a regenerated passcode stops working.
--
-- Returns zero rows rather than raising for an unauthorized caller: the client
-- treats "no counts" and "not entitled" identically, and not raising avoids
-- disclosing whether a show id exists.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_show_class_hide_counts(p_show_id uuid)
RETURNS TABLE (class_id uuid, num_hides integer)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
DECLARE
  v_club_id               uuid;
  v_caller_person_id      uuid;
  v_is_manager            boolean;
  v_is_steward            boolean;
  v_claim_kind            text;
  v_claim_show_id         text;
  v_claim_role            text;
  v_has_passcode_official boolean;
BEGIN
  IF p_show_id IS NULL THEN
    RAISE EXCEPTION 'p_show_id is required' USING ERRCODE = '22023';
  END IF;

  SELECT s.club_id INTO v_club_id FROM public.shows s WHERE s.id = p_show_id;
  IF v_club_id IS NULL THEN
    RETURN;  -- unknown show: empty, not an error, so existence is not disclosed
  END IF;

  -- NULL for a passcode/anonymous session, which has no person row.
  SELECT p.id INTO v_caller_person_id
    FROM public.people p
   WHERE p.auth_user_id = (SELECT auth.uid())
   LIMIT 1;

  v_is_manager :=
    public.is_site_admin()
    OR public.is_trial_secretary(v_club_id)
    OR public.is_club_admin(v_club_id);

  v_is_steward := EXISTS (
    SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.auth_user_id = (SELECT auth.uid())
       AND r.name = 'steward'
       AND ur.is_active
       AND (ur.expires_at IS NULL OR ur.expires_at > now())
       AND (ur.show_id = p_show_id
            OR (ur.show_id IS NULL AND ur.club_id = v_club_id))
  );

  v_claim_kind    := (SELECT auth.jwt()) -> 'app_metadata' ->> 'kind';
  v_claim_show_id := nullif(((SELECT auth.jwt()) -> 'app_metadata' ->> 'show_id'), '');
  v_claim_role    := (SELECT auth.jwt()) -> 'app_metadata' ->> 'ringside_role';

  v_has_passcode_official :=
    v_claim_kind = 'ringside_passcode'
    AND v_claim_show_id IS NOT NULL
    AND v_claim_show_id = p_show_id::text
    AND v_claim_role IN ('judge', 'admin', 'steward')
    AND public.ringside_claim_generation_current() IS NOT DISTINCT FROM true;

  RETURN QUERY
  SELECT c.id, c.num_hides
    FROM public.classes c
    JOIN public.trials t ON t.id = c.trial_id
   WHERE t.show_id = p_show_id
     AND c.deleted_at IS NULL
     AND (
       v_is_manager
       OR v_is_steward
       OR v_has_passcode_official
       -- An account-holding judge sees only the classes assigned to them.
       OR (
         v_caller_person_id IS NOT NULL
         AND EXISTS (
           SELECT 1
             FROM public.judge_assignments ja
            WHERE ja.person_id = v_caller_person_id
              AND ja.class_id = c.id
              AND ja.status IN ('confirmed', 'invited')
         )
       )
     );
END;
$$;

-- Officials reach this while signed in, including via a passcode session, which
-- resolves to the authenticated role. anon never qualifies, so it never needs
-- EXECUTE; stated explicitly per the migration grant-decision contract.
REVOKE ALL ON FUNCTION public.get_show_class_hide_counts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_show_class_hide_counts(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_show_class_hide_counts(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_show_class_hide_counts(uuid) IS
  'Show-scoped judge-set hide counts for officials only (manager/secretary/site-admin, show steward, assigned judge, or a current ringside judge/admin/steward passcode claim). Authorization runs once per call, not per row. Returns zero rows for anyone else. MYK9-127.';
