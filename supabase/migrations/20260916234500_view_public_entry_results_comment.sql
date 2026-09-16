-- MYK9-552: make view_public_entry_results self-consistent.
--
-- 20260913131500 (MYK9-466) added `AND c.results_released_at IS NOT NULL` to the
-- top-level WHERE, so an unreleased class yields ZERO rows. Two things were left
-- contradicting that:
--   1. The COMMENT still described the pre-MYK9-466 behaviour ("rows present,
--      entry identity NULL until released").
--   2. Every per-column CASE arm testing results_released_at became
--      unreachable — each one always took its THEN branch.
--
-- This migration keeps the WHERE predicate exactly as deployed, drops the dead
-- CASE arms, and rewrites the COMMENT. The per-field `vis.*_visible` guards stay:
-- they are still reachable and still decide which scored columns are published.
--
-- This is an owner-run view (security_invoker = false), so its body is the only
-- guard anon meets. The inline WITH (security_invoker = false) is mandatory on
-- every CREATE OR REPLACE — a replace resets reloptions (see the 20260817170000 /
-- 20260817190000 pair). Grants are deliberately untouched, and the view is
-- replaced rather than dropped (a DROP resets the ACL).

BEGIN;

CREATE OR REPLACE VIEW public.view_public_entry_results
WITH (security_invoker = false) AS
 SELECT e.id AS id,
    e.class_id AS class_id,
    c.trial_id,
    e.show_id,
    e.dog_id AS dog_id,
    e.armband AS armband,
    e.handler AS handler,
    e.run_order AS run_order,
    e.is_in_ring AS is_in_ring,
    e.is_scored AS is_scored,
    e.check_in_status AS check_in_status,
    e.entry_status AS entry_status,
    e.scoring_completed_at AS scoring_completed_at,
    e.created_at,
    CASE
      WHEN vis.placement_visible THEN e.final_placement
      ELSE NULL::integer
    END AS final_placement,
    CASE
      WHEN vis.qualification_visible THEN e.result_status
      ELSE NULL::text
    END AS result_status,
    CASE
      WHEN vis.time_visible THEN e.search_time_seconds
      ELSE NULL::numeric
    END AS search_time_seconds,
    CASE
      WHEN vis.time_visible THEN e.total_score
      ELSE NULL::numeric
    END AS total_score,
    CASE
      WHEN vis.faults_visible THEN e.total_faults
      ELSE NULL::integer
    END AS total_faults,
    CASE
      WHEN vis.qualification_visible AND e.is_scored = true
        AND e.result_status = 'qualified'::text THEN 'Q'::text
      WHEN vis.qualification_visible AND e.is_scored = true
        AND e.result_status = 'nq'::text THEN 'NQ'::text
      WHEN vis.qualification_visible AND e.is_scored = true
        AND e.result_status = 'absent'::text THEN 'ABS'::text
      WHEN vis.qualification_visible AND e.is_scored = true
        AND e.result_status = 'excused'::text THEN 'EX'::text
      WHEN vis.qualification_visible AND e.is_scored = true
        AND e.result_status = 'withdrawn'::text THEN 'WD'::text
      ELSE 'pending'::text
    END AS result_text,
    d.name AS dog_name,
    d.call_name AS dog_call_name,
    d.breed AS dog_breed,
    d.image_url AS dog_image_url,
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
  'Anon-readable RELEASED results only. The WHERE clause requires '
  'classes.results_released_at IS NOT NULL, so a class whose results are not '
  'released yields NO ROWS at all - no entry identity, and no class or show '
  'identifiers either. Within a released class the vis.*_visible guards still '
  'decide which scored columns (placement, qualification, time, faults) are '
  'published. Owner-run (security_invoker = false): this body is the only guard '
  'anon meets, so do not remove the results_released_at predicate (MYK9-466, MYK9-552).';

COMMIT;
