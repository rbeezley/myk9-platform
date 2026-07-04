-- =============================================================================
-- Migration: enforce the `checks`-is-array contract on system_health_snapshots.
--
-- The table (migration 20260704120000) typed `checks jsonb NOT NULL` but did not
-- constrain its JSON shape. The spec (openspec admin-system-health) requires
-- `checks` to be an ARRAY of {key,label,status,detail,checked_at}. Without the
-- constraint a writer could insert a non-array payload (e.g. `{}`) alongside
-- `overall_status = 'ok'`; the board's parser maps a non-array to an empty list,
-- so the page would render a fresh "All systems healthy" with zero checks —
-- hiding a misconfigured writer. This closes that gap at the write layer.
--
-- New migration only — 20260704120000 is never edited. The paired parser change
-- (visible degradation of a non-array payload) is defense-in-depth for any row
-- that predates this constraint or is read before it deploys.
-- Rollback = a follow-up migration dropping the constraint.
-- =============================================================================

ALTER TABLE public.system_health_snapshots
  ADD CONSTRAINT system_health_snapshots_checks_is_array
  CHECK (jsonb_typeof(checks) = 'array');

NOTIFY pgrst, 'reload schema';
