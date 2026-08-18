-- =============================================================================
-- Restore security_invoker on the three views rebuilt by 20260817170000.
--
-- REGRESSION FIX. CREATE OR REPLACE VIEW does not preserve a view's reloptions:
-- with no WITH clause it RESETS them, and security_invoker then falls back to
-- its default of false. 20260817170000 rebuilt view_entry_with_results,
-- view_myk9q_entries and view_stats_summary without a WITH clause, so all three
-- silently went from security_invoker = true (set by 20260613100000) to
-- owner-run.
--
-- Impact while that held: these views are owned by postgres, which has
-- BYPASSRLS, and `authenticated` holds arwd on all three from ALTER DEFAULT
-- PRIVILEGES. Owner-run means the caller's policies are never consulted AND no
-- base-column privileges are required, so any authenticated user could read
-- every entry platform-wide -- judge_notes, total_score, payment_status,
-- entry_fee, final_placement -- across all shows. Under security_invoker the
-- entries column allowlist and the entries_select policy both applied.
--
-- The tell that isolates the mechanism: view_authenticated_entry_results was
-- rebuilt in the same push and KEPT its setting, because 20260817180000 carries
-- an explicit `WITH (security_invoker = false)`. Only the views whose
-- CREATE OR REPLACE omitted a WITH clause lost their option.
--
-- ALTER VIEW ... SET, not another CREATE OR REPLACE: it changes only the option
-- and cannot disturb the column list or the soft-delete predicate that
-- 20260817170000 added.
--
-- Any future rebuild of these three MUST carry `WITH (security_invoker = true)`
-- inline.
-- =============================================================================

ALTER VIEW public.view_entry_with_results SET (security_invoker = true);
ALTER VIEW public.view_myk9q_entries      SET (security_invoker = true);
ALTER VIEW public.view_stats_summary      SET (security_invoker = true);

NOTIFY pgrst, 'reload schema';
