-- MYK9-126: apply the set-based class result visibility to the public results
-- view as well.
--
-- 20260910224500 replaced the per-row
-- `CROSS JOIN LATERAL public.resolve_class_result_visibility(e.class_id)` in
-- view_authenticated_entry_results with a join to
-- private.class_result_visibility, which resolves the cascade once per class
-- instead of once per entry. view_public_entry_results carried the identical
-- defect and is the anon-facing results path -- useShowResults,
-- useClassReleasedResults and useClassEntriesRaw all read it, and a public
-- results page spans a whole show or class, which is exactly the row count
-- where per-row resolution hurts.
--
-- Same shape as 20260910224500: the SELECT list, the WHERE clause, the GRANTs
-- and every `vis.*` reference are byte-identical to 20260905151500, the latest
-- migration defining this view. Only the join is swapped. The no-FROM LATERAL
-- keeps the `vis` column names and COALESCEs a missing row to false.
--
-- WHY COALESCE IS LOAD-BEARING HERE: this view nulls scored columns with
-- `CASE WHEN vis.placement_visible THEN e.final_placement END`. A bare LEFT
-- JOIN would yield NULL for an unresolvable class, and `CASE WHEN NULL` takes
-- no branch -- which happens to null the column, so it would LOOK safe. It is
-- safe by accident, not by construction. COALESCE to false makes the
-- fail-closed behaviour explicit and matches the function's `IF NOT FOUND`.
--
-- The view stays owner-run: security_invoker = false is restated INLINE,
-- because CREATE OR REPLACE VIEW wipes reloptions and the flag would fall back
-- to invoker (20260817170000 -> 20260817190000, and the header of
-- 20260905151500 says the same). This view body is the ONLY guard -- RLS is
-- bypassed -- so losing the flag would change who can read scored columns.
--
-- view_own_entry_results is DELIBERATELY NOT CHANGED. It is the third and last
-- live caller of the per-row resolver, but it is security_invoker = TRUE, so it
-- runs as the caller; joining the owner-only private.class_result_visibility
-- would fail for `authenticated`. Fixing it would mean granting SELECT on that
-- view to authenticated, which would let any signed-in user enumerate every
-- class_id on the platform together with its visibility configuration -- a new
-- exposure. No application code queries view_own_entry_results (verified: only
-- generated database.types.ts and two migration-text contract tests reference
-- it), and its rows are RLS-scoped, so the per-row cost there is small. Not
-- worth a new grant.
--
-- Behavioural coverage: supabase/tests/myk9_126_class_result_visibility_parity_test.sql
-- pins private.class_result_visibility against the resolver, and now also pins
-- the unconfigured defaults absolutely (Codex review, 2026-09-11: the first
-- version of that matrix never ran with an absent show_visibility_settings row,
-- so a deliberately wrong default passed).

BEGIN;

CREATE OR REPLACE VIEW public.view_public_entry_results
WITH (security_invoker = false) AS
 SELECT e.id,
    e.class_id,
    c.trial_id,
    e.show_id,
    e.dog_id,
    e.armband,
    e.handler,
    e.run_order,
    e.is_in_ring,
    e.is_scored,
    e.check_in_status,
    e.entry_status,
    e.scoring_completed_at,
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
            WHEN vis.qualification_visible AND e.is_scored = true AND e.result_status = 'qualified'::text THEN 'Q'::text
            WHEN vis.qualification_visible AND e.is_scored = true AND e.result_status = 'nq'::text THEN 'NQ'::text
            WHEN vis.qualification_visible AND e.is_scored = true AND e.result_status = 'absent'::text THEN 'ABS'::text
            WHEN vis.qualification_visible AND e.is_scored = true AND e.result_status = 'excused'::text THEN 'EX'::text
            WHEN vis.qualification_visible AND e.is_scored = true AND e.result_status = 'withdrawn'::text THEN 'WD'::text
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
   FROM entries e
     JOIN classes c ON c.id = e.class_id
     JOIN shows sh ON sh.id = e.show_id
     LEFT JOIN trials t ON t.id = c.trial_id
     LEFT JOIN dogs d ON d.id = e.dog_id
     LEFT JOIN private.class_result_visibility cvr ON cvr.class_id = e.class_id
     -- MYK9-126: `vis` keeps its four column names so every CASE above is
     -- byte-identical to 20260905151500. COALESCE reproduces the function's
     -- fail-closed RETURN for a class with no resolvable trial, which a LEFT
     -- JOIN would otherwise surface as NULL -- and NULL in these CASEs would
     -- read as 'not hidden'.
     CROSS JOIN LATERAL (
       SELECT
         COALESCE(cvr.placement_visible, false)     AS placement_visible,
         COALESCE(cvr.qualification_visible, false) AS qualification_visible,
         COALESCE(cvr.time_visible, false)          AS time_visible,
         COALESCE(cvr.faults_visible, false)        AS faults_visible
     ) vis
  WHERE e.deleted_at IS NULL
    AND c.deleted_at IS NULL
    AND (t.id IS NULL OR t.deleted_at IS NULL)
    AND sh.deleted_at IS NULL
    AND (sh.status = ANY (ARRAY['published'::text, 'upcoming'::text, 'in_progress'::text, 'completed'::text]));

COMMENT ON VIEW public.view_public_entry_results IS
  'Anon-readable released results. Owner-run (security_invoker = false), so this '
  'view body is the ONLY guard — it must exclude soft-deleted entries, classes, '
  'trials and shows itself (MYK9-149, MYK9-404). Class result visibility resolves '
  'once per class via private.class_result_visibility (MYK9-126).';

COMMIT;
