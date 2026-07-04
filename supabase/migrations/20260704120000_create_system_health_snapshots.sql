-- =============================================================================
-- Migration: system_health_snapshots — durable store for daily server-side
--            health-check runs (backs the site-admin /admin/health board).
--
-- The go-live runbook (docs/operations/go-live-runbook.md) Phase 5 is a manual
-- launch-morning parity checklist. A companion change adds a daily job that runs
-- the recurring, machine-checkable parts and INSERTs one snapshot row here; the
-- /admin/health page reads the latest row so the operator opens one page each
-- morning instead of re-running the list.
--
-- Shape note: this table is intentionally the same family as the planned
-- `operator_alerts` table (docs/plan-money-path-hardening.md Phase 6, MP-08 —
-- service-role INSERT, site-admin SELECT) so the two can converge later. They are
-- NOT merged now; keep them consistent.
--
-- Access model (per CLAUDE.md — every CREATE TABLE needs explicit GRANTs AND RLS):
--   * authenticated may SELECT only when is_site_admin() (the migration-156
--     SECURITY DEFINER helper) is true.
--   * service_role may INSERT (the check-runner writes as service_role, which also
--     bypasses RLS in Supabase — so no INSERT policy is required).
--   * anon gets nothing.
-- FORCE ROW LEVEL SECURITY mirrors the 2026-07 force-RLS sweep so the table owner
-- cannot accidentally read past the policy.
--
-- New migration only. Rollback = a follow-up migration that DROPs the table.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Table + index
-- -----------------------------------------------------------------------------
CREATE TABLE public.system_health_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  source          text NOT NULL,
  overall_status  text NOT NULL CHECK (overall_status IN ('ok', 'warn', 'fail')),
  checks          jsonb NOT NULL,   -- array of {key,label,status,detail,checked_at}
  run_duration_ms integer
);

COMMENT ON TABLE public.system_health_snapshots IS
  'Append-only daily server-side health-check runs backing /admin/health. Same family as the planned operator_alerts table (MP-08); do not merge without a dedicated change.';

-- Latest-first reads (the page fetches `order by created_at desc limit 7`).
CREATE INDEX system_health_snapshots_created_at_desc_idx
  ON public.system_health_snapshots (created_at DESC);

-- -----------------------------------------------------------------------------
-- 2. RLS + grants
--    is_site_admin() wrapped in (SELECT ...) so the planner evaluates it once
--    per query (initplan), not per row.
-- -----------------------------------------------------------------------------
ALTER TABLE public.system_health_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_health_snapshots FORCE ROW LEVEL SECURITY;

GRANT SELECT ON public.system_health_snapshots TO authenticated;
GRANT INSERT ON public.system_health_snapshots TO service_role;
-- no grant to anon by design.

CREATE POLICY "system_health_snapshots_select" ON public.system_health_snapshots
  FOR SELECT TO authenticated
  USING ((SELECT public.is_site_admin()));

-- -----------------------------------------------------------------------------
-- 3. Reload PostgREST schema cache so the new table + policy take effect
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
