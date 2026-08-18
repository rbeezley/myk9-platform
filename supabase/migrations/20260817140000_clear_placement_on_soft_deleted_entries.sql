-- A soft-deleted entry must never keep a final_placement, including when the
-- deletion empties the class.
--
-- 20260817120000_placement_ranking_ignores_soft_deleted_entries.sql closed the
-- ranking half: recalculate_class_placements now clears every placement in the
-- class unfiltered, then re-ranks only `deleted_at IS NULL` rows, so a tombstone
-- is left unplaced. That holds whenever the ranking function actually runs.
--
-- It does not run when the deletion removes the LAST live entry.
-- refresh_class_scoring_state tests `v_expected_count = 0` BEFORE the
-- fully-accounted branch, and v_expected_count counts only `deleted_at IS NULL`
-- rows. Soft-deleting the only entry of a completed class therefore takes the
-- terminal `upcoming` branch, never calls recalculate_class_placements, and
-- clears placements with `AND deleted_at IS NULL` -- which excludes the one row
-- that still holds one. Reproduced against the applied database on 2026-08-17,
-- with 20260817120000 already in schema_migrations:
--
--   SETUP             -> class status=completed  placement=1
--   AFTER SOFT-DELETE -> class status=upcoming   tombstone placement=1
--
-- The stale placement is reachable: view_entry_with_results, view_myk9q_entries
-- and view_stats_summary do not filter deleted_at. Latent, not active -- there
-- were zero tombstoned entries platform-wide as of 2026-08-17.
--
-- The fix is to drop `AND deleted_at IS NULL` from all three terminal clearing
-- UPDATEs. Their job is terminal: when the class is not in a fully-ranked state,
-- nothing in it should hold a placement, tombstoned or not. The filter was
-- inherited from the counting query in
-- 20260713101000_class_status_soft_delete_derivation.sql, where excluding
-- deleted rows is correct; carrying it into the clears was not a separate
-- decision.
--
-- WHY THIS IS NOT THE STALL 20260727235900 REMOVED
--
-- 20260727235900_avoid_null_placement_noop_updates.sql fixed a show-desk
-- check-in that hung inside ringside_update_entry. Its guard is
-- `AND final_placement IS NOT NULL`, and that guard is what this migration
-- preserves. The cost it removed was a class-WIDE write: with no such guard the
-- clear matched every live entry in the class on every refresh, and each matched
-- row pays for the all-column triggers on public.entries --
-- increment_replication_version, update_updated_at_column, and
-- broadcast_entries_showday_change, which calls realtime.send() per row. A
-- check-in on an unscored 60-dog class did 60 rows of that for nothing, and held
-- a row lock on all 60 for the rest of the transaction, so concurrent ringside
-- writes in the same class serialized behind it.
--
-- Removing the deleted_at predicate does not restore any of that. The row count
-- is still bounded by `final_placement IS NOT NULL`: on an unscored class the
-- clear still matches zero rows, and in the empty-class case it matches exactly
-- the tombstones that were placed. There is also no recursion risk --
-- entries_refresh_class_scoring_state is
-- `AFTER INSERT OR DELETE OR UPDATE OF class_id, entry_status, check_in_status,
-- deleted_at, is_scored, result_status, search_time_seconds, total_faults,
-- points_earned`, and final_placement is not in that column list, so a
-- placement write never re-enters handle_entry_scoring_state_change.
-- supabase/tests/placement_soft_delete_ranking_test.sql section 4 asserts the
-- zero-row property through a real ringside_update_entry check-in.
--
-- Rejected alternatives:
--   * Null final_placement at the soft-delete site. There is no single site --
--     ringside_update_entry, the admin soft-delete RPCs and direct PostgREST
--     writes all set deleted_at -- so the invariant would have to be restated in
--     each, and any future writer would silently omit it. The trigger is the
--     one place that already owns derived placement state.
--   * Call recalculate_class_placements unconditionally. Its own stale-clear is
--     `UPDATE public.entries SET final_placement = NULL WHERE class_id = ...`
--     with NO final_placement guard, deliberately, because it re-ranks straight
--     after. Running that on every refresh is precisely the class-wide no-op
--     write 20260727235900 removed, so this would reintroduce the ringside stall
--     to fix a latent display bug.
--
-- SA-027: converted to `SET search_path = ''` per the "convert when next edited"
-- disposition in docs/security/sa-027-search-path-accepted-risk.md. Every
-- reference in the body is schema-qualified (public.entries, public.classes,
-- public.trials, public.shows, public.recalculate_class_placements); COALESCE,
-- ARRAY[] and the comparison operators resolve from pg_catalog, which is always
-- implicitly searched.

BEGIN;

CREATE OR REPLACE FUNCTION public.refresh_class_scoring_state(p_class_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expected_count integer;
  v_accounted_count integer;
  v_scored_count integer;
  v_status_source text;
  v_is_nationals boolean;
BEGIN
  IF p_class_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*) FILTER (
      WHERE COALESCE(entry_status, '') NOT IN ('scratched', 'withdrawn', 'cancelled')
        AND check_in_status IS DISTINCT FROM 'pulled'
    )::integer,
    COUNT(*) FILTER (
      WHERE COALESCE(entry_status, '') NOT IN ('scratched', 'withdrawn', 'cancelled')
        AND check_in_status IS DISTINCT FROM 'pulled'
        AND (is_scored = true OR result_status IN ('absent', 'excused'))
    )::integer,
    COUNT(*) FILTER (WHERE is_scored = true)::integer
  INTO v_expected_count, v_accounted_count, v_scored_count
  FROM public.entries
  WHERE class_id = p_class_id
    AND deleted_at IS NULL;

  SELECT status_source
  INTO v_status_source
  FROM public.classes
  WHERE id = p_class_id;

  IF v_status_source = 'manual' THEN
    UPDATE public.classes
    SET scored_count = v_scored_count
    WHERE id = p_class_id;
    RETURN;
  END IF;

  IF v_expected_count = 0 THEN
    UPDATE public.classes
    SET
      status = 'upcoming',
      scored_count = v_scored_count,
      is_scoring_finalized = false
    WHERE id = p_class_id;

    -- Deliberately NOT filtered by deleted_at: this branch is where an
    -- emptied class lands, and the tombstone that emptied it is the only row
    -- left holding a placement. `final_placement IS NOT NULL` is the guard
    -- that keeps the write bounded (20260727235900).
    UPDATE public.entries
    SET final_placement = NULL
    WHERE class_id = p_class_id
      AND final_placement IS NOT NULL;
  ELSIF v_accounted_count = v_expected_count THEN
    SELECT s.is_nationals
    INTO v_is_nationals
    FROM public.classes c
    JOIN public.trials t ON t.id = c.trial_id
    JOIN public.shows s ON s.id = t.show_id
    WHERE c.id = p_class_id;

    UPDATE public.classes
    SET
      status = 'completed',
      scored_count = v_scored_count,
      is_scoring_finalized = true,
      reopened_after_closeout_at = NULL
    WHERE id = p_class_id;

    PERFORM public.recalculate_class_placements(ARRAY[p_class_id], COALESCE(v_is_nationals, false));
  ELSIF v_accounted_count > 0 THEN
    UPDATE public.classes
    SET
      status = 'in_progress',
      scored_count = v_scored_count,
      is_scoring_finalized = false
    WHERE id = p_class_id;

    -- Same reasoning: a partially-scored class is not ranked, so no row in it
    -- may hold a placement -- including one that was tombstoned while the
    -- class was still complete.
    UPDATE public.entries
    SET final_placement = NULL
    WHERE class_id = p_class_id
      AND final_placement IS NOT NULL;
  ELSE
    UPDATE public.classes
    SET
      status = 'upcoming',
      scored_count = v_scored_count,
      is_scoring_finalized = false
    WHERE id = p_class_id;

    UPDATE public.entries
    SET final_placement = NULL
    WHERE class_id = p_class_id
      AND final_placement IS NOT NULL;
  END IF;
END;
$$;

-- Restate the execute decision from 20260703120000_revoke_scoring_fns_from_public.sql.
-- CREATE OR REPLACE preserves the existing ACL, so this is a no-op against the
-- applied database (live is postgres=X, service_role=X); it is here so the
-- migration carries its own disposition for a migrations-only ACL rebuild.
-- Clients reach this only through the entries trigger or the authorized wrapper
-- refresh_class_scoring_state_authorized(uuid), never by direct EXECUTE.
REVOKE ALL ON FUNCTION public.refresh_class_scoring_state(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_class_scoring_state(uuid) TO service_role;

COMMENT ON FUNCTION public.refresh_class_scoring_state(uuid) IS
  'Derives classes.status from non-deleted entry scoring state using the '
  'expected/accounted-for completeness definition. Skips the status write '
  '(still refreshes scored_count) when status_source = ''manual''. Clears '
  'reopened_after_closeout_at on legitimate completion. Reads shows.is_nationals '
  'for the placement ranking. The terminal branches clear placements on '
  'soft-deleted rows too, so emptying a completed class cannot leave a '
  'tombstone holding a stale placement; the final_placement IS NOT NULL guard '
  'keeps those clears from rewriting a whole class of no-ops.';

COMMIT;

NOTIFY pgrst, 'reload schema';
