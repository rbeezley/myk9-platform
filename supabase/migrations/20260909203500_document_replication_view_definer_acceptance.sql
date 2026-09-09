-- =============================================================================
-- Record the SECURITY DEFINER acceptance rationale on
-- public.view_authenticated_entry_results_replication.
--
-- Supabase's `security_definer_view` linter reports this view as an ERROR, as it
-- does for view_public_entry_results and view_authenticated_entry_results. All
-- three are deliberately owner-run; the disposition is Verdict 1 of
-- docs/improve-audit-2026-07-11/009-advisor-disposition-sweep.md, which requires
-- each accepted view to carry the rationale as a COMMENT so the next advisor
-- reader finds it in the schema itself rather than re-litigating it.
--
-- The other two views got their comments when that sweep ran. This view was
-- added later by 20260901120000 (MYK9-291 deleted-show replication) with an
-- explicit `WITH (security_invoker = false)` and missed the convention. This is
-- documentation only: no reloptions, no ACL, no view body changes.
-- =============================================================================

COMMENT ON VIEW public.view_authenticated_entry_results_replication IS
  'Replication feed wrapping view_authenticated_entry_results, adding the shows join needed to replicate soft-deleted shows (MYK9-291). Owner-run (security_invoker = false) like the view it wraps; the score/payment gating is inherited from that inner view body, and the shows columns are reachable only for entries the inner view already admitted. Advisor security_definer_view ERROR accepted by design 2026-09-09 (docs/improve-audit-2026-07-11/009-advisor-disposition-sweep.md, Verdict 1). Any rebuild MUST carry WITH (security_invoker = false) inline -- CREATE OR REPLACE VIEW resets reloptions.';
