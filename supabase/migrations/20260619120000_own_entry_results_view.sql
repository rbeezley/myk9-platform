-- =============================================================================
-- Migration 20260619120000: view_own_entry_results
--
-- Authenticated exhibitors can read their own entry row in full (including
-- final_placement / result_status / search_time_seconds / total_faults) via a
-- direct PostgREST query against `entries`, bypassing the per-field visibility
-- cascade that governs when those columns are publicly visible.
--
-- Fix: route own-entry reads through a cascade-aware view (same pattern as
-- view_public_entry_results for anon, but security_invoker = true so the
-- caller's entries_select RLS policy still restricts rows to own entries —
-- the view only adds cascade-gating on top of that row filter).
--
-- resolve_class_result_visibility is SECURITY DEFINER, so it can read the
-- visibility tables even though exhibitors cannot.
-- =============================================================================

DROP VIEW IF EXISTS public.view_own_entry_results;

CREATE VIEW public.view_own_entry_results
  WITH (security_invoker = true)
AS
SELECT
  -- Identity / scheduling columns (pass through unchanged)
  e.id,
  e.dog_id,
  e.show_id,
  e.class_id,
  e.trial_id,
  e.handler,
  e.handler_id,
  e.payment_status,
  e.entry_status,
  e.check_in_status,
  e.entry_fee,
  e.armband,
  e.run_order,
  e.jump_height,
  e.special_requests,
  e.registration_id,
  e.is_scored,
  e.is_in_ring,
  e.submitted_at,
  e.created_at,
  e.updated_at,
  e.scoring_completed_at,
  -- Scored columns: NULL when the per-field visibility cascade hides them
  CASE WHEN vis.placement_visible     THEN e.final_placement      END AS final_placement,
  CASE WHEN vis.qualification_visible THEN e.result_status        END AS result_status,
  CASE WHEN vis.time_visible          THEN e.search_time_seconds  END AS search_time_seconds,
  CASE WHEN vis.time_visible          THEN e.total_score          END AS total_score,
  CASE WHEN vis.faults_visible        THEN e.total_faults         END AS total_faults,
  CASE
    WHEN vis.qualification_visible AND e.is_scored AND e.result_status = 'qualified'  THEN 'Q'
    WHEN vis.qualification_visible AND e.is_scored AND e.result_status = 'nq'         THEN 'NQ'
    WHEN vis.qualification_visible AND e.is_scored AND e.result_status = 'absent'     THEN 'ABS'
    WHEN vis.qualification_visible AND e.is_scored AND e.result_status = 'excused'    THEN 'EX'
    WHEN vis.qualification_visible AND e.is_scored AND e.result_status = 'withdrawn'  THEN 'WD'
    ELSE NULL
  END AS result_text
FROM public.entries e
CROSS JOIN LATERAL public.resolve_class_result_visibility(e.class_id) AS vis
WHERE e.deleted_at IS NULL;

-- Only authenticated users (own-entry filter enforced by entries_select RLS)
GRANT SELECT ON public.view_own_entry_results TO authenticated;

NOTIFY pgrst, 'reload schema';
