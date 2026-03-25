-- =============================================================================
-- Migration 085: SA-012 — Restrict promo_codes UPDATE to authorized users
--
-- HIGH: Any authenticated user could modify any promo code (discount, limits,
-- expiration). The usage_count increment during checkout is a legitimate
-- operation for any authenticated user, so we provide a dedicated RPC.
-- =============================================================================

-- Drop the overly permissive UPDATE policy
DROP POLICY IF EXISTS "promo_codes_update_policy" ON promo_codes;

-- Only creator, secretary, or platform admin can do general updates
CREATE POLICY "promo_codes_update_policy" ON promo_codes
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR (SELECT is_trial_secretary())
    OR (SELECT is_platform_admin())
  );

-- Dedicated function for safe usage_count increment during checkout.
-- SECURITY DEFINER bypasses RLS so any authenticated user can increment.
CREATE OR REPLACE FUNCTION increment_promo_usage(promo_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.promo_codes
  SET usage_count = usage_count + 1
  WHERE id = promo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Promo code % not found', promo_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION increment_promo_usage(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_promo_usage(UUID) TO authenticated;
