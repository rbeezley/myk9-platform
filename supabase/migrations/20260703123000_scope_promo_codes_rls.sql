-- =============================================================================
-- Migration 20260703123000: SA-002 — scope ALL promo_codes mutations + SELECT to
-- show managers, and move exhibitor code-validation to a validate-only RPC.
--
-- MEDIUM (2026-07-03 pre-launch audit): promo_codes INSERT was gated on
-- `created_by = auth.uid()` and SELECT on `auth.uid() IS NOT NULL`, so any
-- authenticated user could create a promo code and enumerate the full catalog
-- for every show — a cross-tenant financial-config disclosure + write hole.
--
-- promo_codes rows are scoped by EITHER `show_id` OR `trial_id` (both nullable);
-- a user "manages" the row when they can_manage_show() the row's show, resolved
-- directly (show_id) or via the trial (can_manage_trial(), which does the
-- trials->shows join internally and bypasses trials RLS). Authorization is
-- CLUB-scoped (club admin / club secretary / site admin) per can_manage_show —
-- see the SA-002 authz decision (Option A): financial config stays
-- club-controlled; show-scoped-only officials are intentionally NOT admitted.
--
-- All four policies (INSERT/SELECT/UPDATE/DELETE) now use the same predicate.
-- Codex review (PR #1109) flagged that leaving UPDATE (mig 085: unscoped
-- `is_trial_secretary()`) and DELETE (mig 045: creator-only) as-is left a
-- residual cross-tenant mutation hole — a secretary of ANY club, or a stale
-- creator, could edit/delete another show's promo config. The only live UPDATE
-- path is the SECURITY DEFINER increment_promo_usage RPC (mig 085), which
-- bypasses RLS, so tightening the UPDATE/DELETE policies regresses nothing.
--
-- Exhibitors never read the catalog: they validate a specific typed code through
-- validate_promo_code() (SECURITY DEFINER), which returns only match/no-match +
-- discount, never the underlying row set.
-- =============================================================================

-- --- INSERT: only users who manage the row's show/trial (or platform admin) ---
DROP POLICY IF EXISTS "promo_codes_insert_policy" ON public.promo_codes;
CREATE POLICY "promo_codes_insert_policy" ON public.promo_codes
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_site_admin())
    OR (
      promo_codes.show_id IS NOT NULL
      AND (SELECT public.can_manage_show(promo_codes.show_id))
    )
    OR (
      promo_codes.trial_id IS NOT NULL
      AND (SELECT public.can_manage_trial(promo_codes.trial_id))
    )
  );

-- --- SELECT: managers only. Exhibitors use validate_promo_code() instead. ---
DROP POLICY IF EXISTS "promo_codes_select_policy" ON public.promo_codes;
CREATE POLICY "promo_codes_select_policy" ON public.promo_codes
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_site_admin())
    OR (
      promo_codes.show_id IS NOT NULL
      AND (SELECT public.can_manage_show(promo_codes.show_id))
    )
    OR (
      promo_codes.trial_id IS NOT NULL
      AND (SELECT public.can_manage_trial(promo_codes.trial_id))
    )
  );

-- --- UPDATE: managers only (replaces mig 085's unscoped is_trial_secretary()).
-- WITH CHECK mirrors USING so a row cannot be re-scoped to a show/trial the
-- caller does not manage. The usage_count increment path is the SECURITY DEFINER
-- increment_promo_usage RPC (mig 085), which bypasses RLS and is unaffected.
DROP POLICY IF EXISTS "promo_codes_update_policy" ON public.promo_codes;
CREATE POLICY "promo_codes_update_policy" ON public.promo_codes
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_site_admin())
    OR (
      promo_codes.show_id IS NOT NULL
      AND (SELECT public.can_manage_show(promo_codes.show_id))
    )
    OR (
      promo_codes.trial_id IS NOT NULL
      AND (SELECT public.can_manage_trial(promo_codes.trial_id))
    )
  )
  WITH CHECK (
    (SELECT public.is_site_admin())
    OR (
      promo_codes.show_id IS NOT NULL
      AND (SELECT public.can_manage_show(promo_codes.show_id))
    )
    OR (
      promo_codes.trial_id IS NOT NULL
      AND (SELECT public.can_manage_trial(promo_codes.trial_id))
    )
  );

-- --- DELETE: managers only (replaces mig 045's creator-only predicate). ---
DROP POLICY IF EXISTS "promo_codes_delete_policy" ON public.promo_codes;
CREATE POLICY "promo_codes_delete_policy" ON public.promo_codes
  FOR DELETE TO authenticated
  USING (
    (SELECT public.is_site_admin())
    OR (
      promo_codes.show_id IS NOT NULL
      AND (SELECT public.can_manage_show(promo_codes.show_id))
    )
    OR (
      promo_codes.trial_id IS NOT NULL
      AND (SELECT public.can_manage_trial(promo_codes.trial_id))
    )
  );

-- --- Validate-only RPC for exhibitor checkout ------------------------------
-- Returns match/no-match + discount for a SPECIFIC typed code, never a row set.
-- SECURITY DEFINER bypasses the officials-only SELECT above. Trial-level codes
-- take precedence over show-level, matching the prior client resolution order.
CREATE OR REPLACE FUNCTION public.validate_promo_code(
  p_code TEXT,
  p_trial_id UUID DEFAULT NULL,
  p_show_id UUID DEFAULT NULL
)
RETURNS TABLE (
  valid BOOLEAN,
  promo_code_id UUID,
  discount_type TEXT,
  discount_value NUMERIC,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.promo_codes%ROWTYPE;
BEGIN
  IF p_code IS NULL OR btrim(p_code) = '' THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::NUMERIC, 'Invalid promo code'::TEXT;
    RETURN;
  END IF;

  SELECT pc.* INTO v_row
  FROM public.promo_codes pc
  WHERE upper(pc.code) = upper(btrim(p_code))
    AND (
      (p_trial_id IS NOT NULL AND pc.trial_id = p_trial_id)
      OR (p_show_id IS NOT NULL AND pc.show_id = p_show_id)
    )
  ORDER BY (pc.trial_id IS NOT NULL) DESC
  LIMIT 1;

  IF v_row.id IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::NUMERIC, 'Invalid promo code'::TEXT;
    RETURN;
  END IF;

  IF v_row.expires_at IS NOT NULL AND v_row.expires_at < now() THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::NUMERIC, 'This promo code has expired'::TEXT;
    RETURN;
  END IF;

  IF v_row.usage_limit IS NOT NULL AND v_row.usage_count >= v_row.usage_limit THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::NUMERIC, 'This promo code has reached its usage limit'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_row.id, v_row.discount_type, v_row.discount_value, NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_promo_code(TEXT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_promo_code(TEXT, UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
