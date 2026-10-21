-- MYK9-1300: give armbands an updated_at column so replication can read a delta.
--
-- Every device's 60 s sync pass re-downloads every assigned armband for every
-- show, because armbands had no updated_at and ReplicatedArmbandsTable ran with
-- forceFullSync. The authenticated SELECT policy evaluates correlated
-- can_manage_show / is_show_official subplans per row, so the read costs about
-- 0.5 ms per row as a real user. In the sessions=50 G9 baseline (run
-- 39487970380) it was the largest single sync statement: 118 s over 168 calls.
-- A delta returns no rows on a steady-state pass.
--
-- Measured 2026-10-21 on the live DB (EXPLAIN ANALYZE as authenticated, this
-- file applied inside a rolled-back transaction): the current full read took
-- 273 ms for secretary@myk9t.com (53 rows) and 26 ms for exhibitor@myk9t.com
-- (46 rows). The steady-state delta took 2.1 ms and 0.1 ms, returning 0 rows.
--
-- This migration only adds the column and its trigger. The client switches to
-- the delta in a later PR, after this is pushed.
--
-- Design notes:
-- * No backfill UPDATE. An UPDATE would fire armbands_version_increment and
--   invalidate every client's OCC token. The constant now() default fills
--   existing rows without a rewrite (now() is STABLE), and the client's first
--   pass with the delta adapter is a full sync anyway, so the backfill value
--   does not matter.
-- * The trigger follows the convention every other replicated table uses:
--   update_<table>_updated_at running public.update_updated_at_column().
-- * No index. The table holds about 66 rows (about 1,330 under the load
--   fixture), and timestamptz comparison is leakproof, so the planner can apply
--   it before the RLS subplans. Verify with EXPLAIN after the push.
-- * Grants: armbands carries table-level grants only (no column ACLs), so the
--   new column inherits them. Not in the supabase_realtime publication.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS update_armbands_updated_at ON public.armbands;
--   ALTER TABLE public.armbands DROP COLUMN IF EXISTS updated_at;
-- (Only after the client delta change is reverted, or every armband sync fails
-- on the missing column.)

SET lock_timeout = '5s';

ALTER TABLE public.armbands
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS update_armbands_updated_at ON public.armbands;
CREATE TRIGGER update_armbands_updated_at
  BEFORE UPDATE ON public.armbands
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
