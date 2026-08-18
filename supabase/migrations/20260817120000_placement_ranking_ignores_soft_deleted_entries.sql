-- Placement ranking must ignore soft-deleted entries.
--
-- 20260713101000_class_status_soft_delete_derivation.sql taught
-- refresh_class_scoring_state to skip entries.deleted_at rows, and extended the
-- entries trigger to fire on deleted_at. It did not follow the PERFORM into
-- recalculate_class_placements, which has been unchanged since
-- 20260525170000_server_side_scoring_completion.sql (the only prior definition;
-- 20260526200000 / 20260615160000 / 20260727235900 redefine the CALLER only).
--
-- Both ranking branches select `WHERE e2.class_id = ... AND e2.is_scored AND
-- e2.result_status = 'qualified'` with no deleted_at predicate, so a scored,
-- qualified entry that was later soft-deleted still consumed a ROW_NUMBER()
-- slot. Every live entry ranked below it received a placement one worse than it
-- earned: three qualifiers placed 1/2/3, soft-delete the 2nd, and the survivors
-- are left at 1 and 3.
--
-- Latent, not active: as of 2026-08-17 there were zero tombstoned entries
-- platform-wide, so no released result was affected.
--
-- The stale-clearing UPDATE deliberately still touches soft-deleted rows and is
-- NOT given the same filter. Its job is to null every placement in the class
-- before re-ranking, so clearing the tombstone is what leaves it unplaced; if it
-- skipped tombstones the deleted entry would keep placement 2 while the live
-- entry below it is reassigned 2, and view_entry_with_results,
-- view_myk9q_entries and view_stats_summary do not filter deleted_at. The
-- deleted_at filter that 20260713101000 / 20260727235900 added to the caller's
-- clearing UPDATEs is safe there precisely because nothing re-assigns after
-- those clears.
--
-- SA-027: converted to `SET search_path = ''` per the "convert when next
-- edited" disposition in docs/security/sa-027-search-path-accepted-risk.md.
-- Every reference in the body is already schema-qualified (public.entries);
-- row_number() and the comparison operators resolve from pg_catalog, which is
-- always implicitly searched.

BEGIN;

CREATE OR REPLACE FUNCTION public.recalculate_class_placements(
  p_class_ids uuid[],
  p_is_nationals boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_class_id uuid;
BEGIN
  FOREACH v_class_id IN ARRAY p_class_ids
  LOOP
    -- Clear stale placements first so changed / reset scores cannot leave
    -- old placement values behind. Intentionally unfiltered by deleted_at:
    -- this is what leaves a soft-deleted entry unplaced once the re-ranking
    -- below stops selecting it.
    UPDATE public.entries
    SET final_placement = NULL
    WHERE class_id = v_class_id;

    IF p_is_nationals THEN
      UPDATE public.entries e
      SET final_placement = ranked.placement
      FROM (
        SELECT
          e2.id,
          ROW_NUMBER() OVER (
            ORDER BY
              e2.points_earned DESC NULLS LAST,
              e2.search_time_seconds ASC NULLS LAST
          ) AS placement
        FROM public.entries e2
        WHERE e2.class_id = v_class_id
          AND e2.is_scored = true
          AND e2.result_status = 'qualified'
          AND e2.deleted_at IS NULL
      ) ranked
      WHERE e.id = ranked.id;
    ELSE
      UPDATE public.entries e
      SET final_placement = ranked.placement
      FROM (
        SELECT
          e2.id,
          ROW_NUMBER() OVER (
            ORDER BY
              e2.total_faults ASC NULLS LAST,
              e2.search_time_seconds ASC NULLS LAST
          ) AS placement
        FROM public.entries e2
        WHERE e2.class_id = v_class_id
          AND e2.is_scored = true
          AND e2.result_status = 'qualified'
          AND e2.deleted_at IS NULL
      ) ranked
      WHERE e.id = ranked.id;
    END IF;
  END LOOP;
END;
$$;

-- Restate the execute decision from 20260703120000_revoke_scoring_fns_from_public.sql.
-- CREATE OR REPLACE preserves the existing ACL, so this is a no-op against the
-- applied database (live is postgres=X, service_role=X); it is here so the
-- migration carries its own disposition for a migrations-only ACL rebuild and
-- for the explicit-decision contract. Callers reach this function through the
-- entries trigger under definer rights, never by direct client EXECUTE.
REVOKE ALL ON FUNCTION public.recalculate_class_placements(uuid[], boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_class_placements(uuid[], boolean) TO service_role;

COMMENT ON FUNCTION public.recalculate_class_placements(uuid[], boolean) IS
  'Recalculates final placements for scored, qualified, non-deleted entries in '
  'each supplied class. Soft-deleted entries are excluded from the ranking and '
  'left unplaced, so a deleted entry cannot push live entries down a rank.';

COMMIT;

NOTIFY pgrst, 'reload schema';
