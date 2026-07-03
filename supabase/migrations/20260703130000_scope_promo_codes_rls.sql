-- Scope promo-code catalog access and writes to the show/trial being managed.
-- SA-002 follow-up: direct exhibitor validation moves to a typed-code RPC.

CREATE OR REPLACE FUNCTION public.can_manage_promo_code_scope(
  check_show_id UUID,
  check_trial_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN check_show_id IS NOT NULL AND check_trial_id IS NULL THEN
      public.can_manage_show(check_show_id)
    WHEN check_show_id IS NULL AND check_trial_id IS NOT NULL THEN
      public.can_manage_trial(check_trial_id)
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.can_manage_promo_code_scope(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_promo_code_scope(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_promo_code_scope(UUID, UUID) TO service_role;

DROP POLICY IF EXISTS "promo_codes_select_policy" ON public.promo_codes;
DROP POLICY IF EXISTS "promo_codes_insert_policy" ON public.promo_codes;
DROP POLICY IF EXISTS "promo_codes_update_policy" ON public.promo_codes;
DROP POLICY IF EXISTS "promo_codes_delete_policy" ON public.promo_codes;

CREATE POLICY "promo_codes_select_policy" ON public.promo_codes
  FOR SELECT TO authenticated
  USING (
    public.can_manage_promo_code_scope(show_id, trial_id)
  );

CREATE POLICY "promo_codes_insert_policy" ON public.promo_codes
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.can_manage_promo_code_scope(show_id, trial_id)
  );

CREATE POLICY "promo_codes_update_policy" ON public.promo_codes
  FOR UPDATE TO authenticated
  USING (
    public.can_manage_promo_code_scope(show_id, trial_id)
  )
  WITH CHECK (
    public.can_manage_promo_code_scope(show_id, trial_id)
  );

CREATE POLICY "promo_codes_delete_policy" ON public.promo_codes
  FOR DELETE TO authenticated
  USING (
    public.can_manage_promo_code_scope(show_id, trial_id)
  );

CREATE OR REPLACE FUNCTION public.validate_promo_code_for_entry(
  p_trial_id UUID,
  p_show_id UUID,
  p_code TEXT
)
RETURNS TABLE (
  id UUID,
  show_id UUID,
  trial_id UUID,
  code TEXT,
  discount_type TEXT,
  discount_value NUMERIC,
  usage_limit INTEGER,
  usage_count INTEGER,
  expires_at TIMESTAMPTZ,
  validation_status TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT
    pc.id,
    pc.show_id,
    pc.trial_id,
    pc.code,
    pc.discount_type,
    pc.discount_value,
    pc.usage_limit,
    pc.usage_count,
    pc.expires_at,
    CASE
      WHEN pc.expires_at IS NOT NULL AND pc.expires_at < now() THEN 'expired'
      WHEN pc.usage_limit IS NOT NULL AND pc.usage_count >= pc.usage_limit THEN 'exhausted'
      ELSE 'valid'
    END AS validation_status
  FROM public.promo_codes pc
  WHERE upper(pc.code) = upper(p_code)
    AND (
      pc.trial_id = p_trial_id
      OR pc.show_id = p_show_id
    )
  ORDER BY
    CASE WHEN pc.trial_id = p_trial_id THEN 0 ELSE 1 END,
    pc.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.validate_promo_code_for_entry(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_promo_code_for_entry(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_promo_code_for_entry(UUID, UUID, TEXT) TO service_role;
