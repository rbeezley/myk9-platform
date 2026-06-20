-- =============================================================================
-- Migration 20260620185208: fix own-entry results show status filter
--
-- view_own_entry_results backs My Entries. The prior view copied a stale show
-- status allow-list (`published`, `upcoming`, `in_progress`, `completed`) that
-- omitted valid DB states exhibitors commonly need: `accepting_entries` and
-- `closed`. Keep the same security model and row shape, but align the filter to
-- the shows.status CHECK constraint for non-draft, non-cancelled shows.
-- =============================================================================

CREATE OR REPLACE VIEW public.view_own_entry_results
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
    WHEN vis.qualification_visible AND e.is_scored = true AND e.result_status = 'qualified'  THEN 'Q'
    WHEN vis.qualification_visible AND e.is_scored = true AND e.result_status = 'nq'         THEN 'NQ'
    WHEN vis.qualification_visible AND e.is_scored = true AND e.result_status = 'absent'     THEN 'ABS'
    WHEN vis.qualification_visible AND e.is_scored = true AND e.result_status = 'excused'    THEN 'EX'
    WHEN vis.qualification_visible AND e.is_scored = true AND e.result_status = 'withdrawn'  THEN 'WD'
    ELSE NULL
  END AS result_text,
  c.results_released_at AS class_results_released_at,
  d.image_url AS dog_image_url
FROM public.entries e
JOIN public.shows sh ON sh.id = e.show_id
JOIN public.classes c ON c.id = e.class_id
LEFT JOIN public.dogs d ON d.id = e.dog_id
CROSS JOIN LATERAL public.resolve_class_result_visibility(e.class_id) AS vis
WHERE e.deleted_at IS NULL
  AND sh.deleted_at IS NULL
  AND sh.status IN ('published', 'accepting_entries', 'closed', 'in_progress', 'completed');

GRANT SELECT ON public.view_own_entry_results TO authenticated;
GRANT SELECT ON public.view_own_entry_results TO service_role;

NOTIFY pgrst, 'reload schema';
