-- MYK9-466: keep unreleased entry identity and operational metadata private.
-- The public results view is also reachable directly through PostgREST, so
-- withholding only scored fields is not enough for an unreleased class.

BEGIN;

CREATE OR REPLACE VIEW public.view_public_entry_results
WITH (security_invoker = false) AS
 SELECT e.id,
    e.class_id,
    c.trial_id,
    e.show_id,
    CASE WHEN c.results_released_at IS NOT NULL THEN e.dog_id END AS dog_id,
    CASE WHEN c.results_released_at IS NOT NULL THEN e.armband END AS armband,
    CASE WHEN c.results_released_at IS NOT NULL THEN e.handler END AS handler,
    CASE WHEN c.results_released_at IS NOT NULL THEN e.run_order END AS run_order,
    CASE WHEN c.results_released_at IS NOT NULL THEN e.is_in_ring END AS is_in_ring,
    CASE WHEN c.results_released_at IS NOT NULL THEN e.is_scored END AS is_scored,
    CASE WHEN c.results_released_at IS NOT NULL THEN e.check_in_status END AS check_in_status,
    CASE WHEN c.results_released_at IS NOT NULL THEN e.entry_status END AS entry_status,
    CASE WHEN c.results_released_at IS NOT NULL THEN e.scoring_completed_at END AS scoring_completed_at,
    e.created_at,
    CASE
      WHEN vis.placement_visible AND c.results_released_at IS NOT NULL THEN e.final_placement
      ELSE NULL::integer
    END AS final_placement,
    CASE
      WHEN vis.qualification_visible AND c.results_released_at IS NOT NULL THEN e.result_status
      ELSE NULL::text
    END AS result_status,
    CASE
      WHEN vis.time_visible AND c.results_released_at IS NOT NULL THEN e.search_time_seconds
      ELSE NULL::numeric
    END AS search_time_seconds,
    CASE
      WHEN vis.time_visible AND c.results_released_at IS NOT NULL THEN e.total_score
      ELSE NULL::numeric
    END AS total_score,
    CASE
      WHEN vis.faults_visible AND c.results_released_at IS NOT NULL THEN e.total_faults
      ELSE NULL::integer
    END AS total_faults,
    CASE
      WHEN vis.qualification_visible AND c.results_released_at IS NOT NULL
        AND e.is_scored = true AND e.result_status = 'qualified'::text THEN 'Q'::text
      WHEN vis.qualification_visible AND c.results_released_at IS NOT NULL
        AND e.is_scored = true AND e.result_status = 'nq'::text THEN 'NQ'::text
      WHEN vis.qualification_visible AND c.results_released_at IS NOT NULL
        AND e.is_scored = true AND e.result_status = 'absent'::text THEN 'ABS'::text
      WHEN vis.qualification_visible AND c.results_released_at IS NOT NULL
        AND e.is_scored = true AND e.result_status = 'excused'::text THEN 'EX'::text
      WHEN vis.qualification_visible AND c.results_released_at IS NOT NULL
        AND e.is_scored = true AND e.result_status = 'withdrawn'::text THEN 'WD'::text
      ELSE 'pending'::text
    END AS result_text,
    CASE WHEN c.results_released_at IS NOT NULL THEN d.name END AS dog_name,
    CASE WHEN c.results_released_at IS NOT NULL THEN d.call_name END AS dog_call_name,
    CASE WHEN c.results_released_at IS NOT NULL THEN d.breed END AS dog_breed,
    CASE WHEN c.results_released_at IS NOT NULL THEN d.image_url END AS dog_image_url,
    c.name AS class_name,
    c.level AS class_level,
    c.element AS class_element,
    c.results_released_at AS class_results_released_at
   FROM public.entries e
     JOIN public.classes c ON c.id = e.class_id
     JOIN public.shows sh ON sh.id = e.show_id
     LEFT JOIN public.trials t ON t.id = c.trial_id
     LEFT JOIN public.dogs d ON d.id = e.dog_id
     LEFT JOIN private.class_result_visibility cvr ON cvr.class_id = e.class_id
     CROSS JOIN LATERAL (
       SELECT
         COALESCE(cvr.placement_visible, false) AS placement_visible,
         COALESCE(cvr.qualification_visible, false) AS qualification_visible,
         COALESCE(cvr.time_visible, false) AS time_visible,
         COALESCE(cvr.faults_visible, false) AS faults_visible
     ) vis
  WHERE e.deleted_at IS NULL
    AND c.deleted_at IS NULL
    AND c.results_released_at IS NOT NULL
    AND (t.id IS NULL OR t.deleted_at IS NULL)
    AND sh.deleted_at IS NULL
    AND sh.status = ANY (ARRAY['published'::text, 'upcoming'::text, 'in_progress'::text, 'completed'::text]);

COMMENT ON VIEW public.view_public_entry_results IS
  'Anon-readable released results. Unreleased classes expose only stable class/show '
  'identifiers and class metadata; entry identity and operational fields remain NULL '
  'until results_released_at is set (MYK9-466).';

CREATE OR REPLACE FUNCTION public.tv_class_entry_counts(
  p_show_id uuid,
  p_class_ids uuid[]
)
RETURNS TABLE (class_id uuid, entry_count bigint, scored_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    requested.class_id,
    count(e.id)::bigint,
    count(e.id) FILTER (WHERE e.is_scored IS TRUE)::bigint
  FROM unnest(p_class_ids) AS requested(class_id)
  LEFT JOIN public.entries AS e
    ON e.class_id = requested.class_id
   AND e.show_id = p_show_id
   AND e.deleted_at IS NULL
   AND lower(coalesce(e.entry_status, '')) NOT IN (
     'scratched', 'withdrawn', 'moved', 'not_accepted', 'absent'
   )
   AND lower(coalesce(e.check_in_status, '')) IS DISTINCT FROM 'pulled'
  WHERE EXISTS (
    SELECT 1
    FROM public.shows AS s
    WHERE s.id = p_show_id
      AND s.status IN ('published', 'upcoming', 'in_progress', 'completed')
      AND s.deleted_at IS NULL
  )
    AND EXISTS (
      SELECT 1
      FROM public.classes AS c
      JOIN public.trials AS t ON t.id = c.trial_id
      WHERE c.id = requested.class_id
        AND t.show_id = p_show_id
        AND c.deleted_at IS NULL
        AND t.deleted_at IS NULL
    )
  GROUP BY requested.class_id;
$$;

REVOKE ALL ON FUNCTION public.tv_class_entry_counts(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tv_class_entry_counts(uuid, uuid[]) TO anon, authenticated;

COMMIT;
