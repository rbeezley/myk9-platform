-- =============================================================================
-- Migration: operator_alerts — durable store for operator-facing alerts raised
--            by edge functions (payment/payout failures, unmatched refunds,
--            unstamped show refunds, etc.), surfaced on the /admin/health board.
--
-- money-path-hardening-remainder (MP-08, MP-12). This is the table the
-- system_health_snapshots migration (20260704120000) reserved the name for:
-- "Shape note: this table is intentionally the same family as the planned
-- operator_alerts table ... service-role INSERT, site-admin SELECT ... They are
-- NOT merged now; keep them consistent." Mirror that migration's RLS/GRANT shape.
--
-- Why persistence, not just email: `_shared/alertAdmin.ts` was email-only
-- (Resend). A missing RESEND_API_KEY, an unset PLATFORM_ALERT_EMAIL inbox, or a
-- transient Resend outage silently dropped every operator alert with no other
-- record. This table makes every alertAdmin() call durable regardless of email
-- delivery, and gives site admins an in-app place to see and resolve them.
--
-- Dedupe: Stripe re-delivers webhook events (and cron re-runs), so an
-- alert-raising branch keyed only on "this condition is true" would create a
-- new unresolved row on every re-delivery. The partial unique index on
-- (source, dedupe_key) WHERE resolved_at IS NULL AND dedupe_key IS NOT NULL
-- makes a second insert with the same (source, dedupe_key) a benign unique
-- violation while the first alert is still unresolved. Once resolved, the
-- index no longer applies, so a genuine recurrence raises a fresh alert.
--
-- Resolution via RPC, not a direct UPDATE RLS policy: a `WITH CHECK` that
-- restricts an authenticated UPDATE to only the resolution columns is awkward
-- to express in RLS. `resolve_operator_alert` mirrors the restore-RPC pattern
-- (20260617120000_restore_entity_rpcs.sql) — SECURITY DEFINER, gated by
-- is_site_admin() inside the function body, EXECUTE granted to authenticated.
-- No UPDATE grant/policy exists on the table itself.
--
-- Access model (per CLAUDE.md — every CREATE TABLE needs explicit GRANTs AND RLS):
--   * authenticated may SELECT only when is_site_admin() is true.
--   * authenticated may resolve an alert only via the resolve_operator_alert()
--     SECURITY DEFINER RPC (also is_site_admin()-gated).
--   * service_role may INSERT (edge functions write as service_role, which also
--     bypasses RLS in Supabase — so no INSERT policy is required).
--   * anon gets nothing.
-- FORCE ROW LEVEL SECURITY mirrors the 2026-07 force-RLS sweep so the table
-- owner cannot accidentally read past the policy.
--
-- New migration only. Rollback = a follow-up migration that DROPs the table
-- and the RPC.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Table + indexes
-- -----------------------------------------------------------------------------
CREATE TABLE public.operator_alerts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  source       text NOT NULL,                 -- the emitting function, e.g. 'stripe-webhook'
  severity     text NOT NULL CHECK (severity IN ('info', 'warn', 'error')),
  title        text NOT NULL,
  detail       jsonb,                          -- structured context (payment ids, amounts, etc.)
  dedupe_key   text,                            -- e.g. the Stripe event id; scoped per-source
  resolved_at  timestamptz,
  resolved_by  uuid REFERENCES auth.users(id)
);

COMMENT ON TABLE public.operator_alerts IS
  'Durable operator alerts raised by edge functions, surfaced on /admin/health. Same family as system_health_snapshots (MP-08); persist-then-email via _shared/alertAdmin.ts.';

-- Latest-first reads (the board fetches unresolved rows newest first).
CREATE INDEX operator_alerts_created_at_desc_idx
  ON public.operator_alerts (created_at DESC);

-- Dedupe under event re-delivery: a second insert with the same (source,
-- dedupe_key) while the first alert is still unresolved hits this unique
-- index (23505) instead of creating a duplicate row. Resolved rows fall out
-- of the partial index, so a genuine recurrence alerts again.
CREATE UNIQUE INDEX operator_alerts_source_dedupe_key_unresolved_idx
  ON public.operator_alerts (source, dedupe_key)
  WHERE resolved_at IS NULL AND dedupe_key IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. RLS + grants
--    is_site_admin() wrapped in (SELECT ...) so the planner evaluates it once
--    per query (initplan), not per row.
-- -----------------------------------------------------------------------------
ALTER TABLE public.operator_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_alerts FORCE ROW LEVEL SECURITY;

GRANT SELECT ON public.operator_alerts TO authenticated;
GRANT INSERT ON public.operator_alerts TO service_role;
-- no grant to anon by design; no UPDATE grant to authenticated — resolution is
-- only reachable through the resolve_operator_alert() RPC below.

CREATE POLICY "operator_alerts_select" ON public.operator_alerts
  FOR SELECT TO authenticated
  USING ((SELECT public.is_site_admin()));

-- -----------------------------------------------------------------------------
-- 3. resolve_operator_alert — site-admin-only resolution RPC
--    Idempotent: resolving an already-resolved alert is a no-op (not an
--    error) and returns the row unchanged, so a double-click or a race
--    between two admins never raises. Unresolved-not-found (bad id) errors.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_operator_alert(p_alert_id uuid)
RETURNS public.operator_alerts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.operator_alerts;
BEGIN
  IF NOT (SELECT public.is_site_admin()) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.operator_alerts WHERE id = p_alert_id) THEN
    RAISE EXCEPTION 'Alert not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.operator_alerts
  SET resolved_at = now(), resolved_by = auth.uid()
  WHERE id = p_alert_id AND resolved_at IS NULL;

  SELECT * INTO v_row FROM public.operator_alerts WHERE id = p_alert_id;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_operator_alert(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_operator_alert(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Reload PostgREST schema cache so the new table + policy take effect
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
