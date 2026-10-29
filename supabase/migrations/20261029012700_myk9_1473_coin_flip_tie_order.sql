-- MYK9-1473: exact ties are decided by a recorded coin flip.
--
-- Owner decision (2026-10-08, confirmed for launch 2026-10-28): an exact tie
-- (same faults and time; nationals: same points and time) is decided by a
-- physical coin flip, so entry id must not decide it. Ported from the
-- unmerged MYK9-1045 follow-up commits 6cbd46088 and 1390285e6 (archive branch
-- archive/myk9-ties-wip-coin-flip-tiebreak), which edited the applied
-- 20261008014300 migration in place. Every function below is copied from its
-- LATEST definition on main (recalculate_class_placements and
-- entries_clear_stale_results_verified: 20261008014300) and the coin flip is
-- applied on top; nothing from the archive's older copies is reused.
--
-- Contents
--   1. entries.placement_tiebreak (smallint, recorded order within a tie) and
--      entries.placement_tie ('unresolved' | 'shared', derived by the
--      recalculator and stored so the replica reads it offline).
--   2. recalculate_class_placements honours the flip (ranking key after the
--      rule's keys; entry id stays last only so an unresolved tie writes the
--      same rows on every recompute).
--   3. set_class_tie_order(class, entry ids): manager-only, MK016 unless the
--      ids are exactly one tie group, MK017 for a tie below 4th. A reorder
--      changes final_placement, so it clears "results verified" through the
--      fingerprint.
--   4. entries_clear_stale_results_verified also drops a class's recorded
--      flips when a placement-eligible entry's ranking inputs change;
--      set_class_tie_order takes entry rows NOWAIT (55P03) so it never waits
--      for an entry while holding the class row.
--   5. Direct anon/authenticated writes to both columns are refused.
--
-- Grants: authenticated entries column SELECT gains both columns (56 -> 58);
-- anon stays 0 (explicit REVOKE; stated, not inherited).
--
--   6. mark_class_results_verified refuses (MK018) while a ribbon tie in the
--      class is still unresolved, and get_class_ties(class) lets a manager read
--      those groups so the Results tab can offer "Record coin flip" (online
--      only, like set_class_tie_order). The entries replication views are not
--      widened.
--   7. Backfill: completed classes are re-derived through
--      refresh_class_scoring_state, the entry point the app uses.
--
-- Deploy: migration only.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
-- The coin flip. placement_tiebreak: the secretary-recorded order within an
-- exact tie (1 = won), smallint because it is a small rank within one group and
-- NULL = not recorded; named for what it feeds (the placement order), not for
-- the coin, since a registry could decide a tie some other way. The tie marker is
-- derived by the recalculator (section 3) and stored so the replica holds it.
ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS placement_tiebreak smallint NULL
    CONSTRAINT entries_placement_tiebreak_positive CHECK (placement_tiebreak >= 1),
  ADD COLUMN IF NOT EXISTS placement_tie text NULL
    CONSTRAINT entries_placement_tie_values CHECK (placement_tie IN ('unresolved', 'shared'));

COMMENT ON COLUMN public.entries.placement_tiebreak IS
  'MYK9-1473: order within an exact tie on the ranking keys, as decided at the show (coin flip): 1 places first. NULL = not recorded. Written only by set_class_tie_order; read by recalculate_class_placements after the rule''s keys. Cleared for the whole class whenever a placement-eligible entry''s ranking inputs there change (entries_clear_stale_results_verified), so it never outlives the tie it was recorded for.';
COMMENT ON COLUMN public.entries.placement_tie IS
  'MYK9-1473: this placed entry is in an exact tie. ''unresolved'' = a tie within 1st-4th whose coin flip has not been recorded (set_class_tie_order); ''shared'' = a tie below 4th, where the dogs share the competition rank. NULL = no tie, or the flip is recorded. Derived and written only by recalculate_class_placements; NULL whenever the entry is unplaced.';


-- ---------------------------------------------------------------------------
-- 3. Placements: diff-written, with the secretary's recorded tie order
--
-- recalculate_class_placements is copied from the latest definition
-- (20261008014300, MYK9-1045) and changed in three ways:
--   * One UPDATE instead of clear-then-rank. Every entry of the class gets its
--     computed placement (NULL unless it is a live, scored, qualified entry,
--     which is what the old clear left on soft-deleted rows too), and a row is
--     written only when its placement or tie marker differs from what it holds.
--     A recompute over unchanged inputs writes nothing: no version bump, no
--     broadcast, no results-check clear.
--   * An exact tie on the ranking keys (fewest faults, then fastest time;
--     nationals: most points, then fastest time) is decided at the show by a
--     coin flip, and the secretary records the outcome with
--     set_class_tie_order. entries.placement_tiebreak (1 = won the flip) is
--     the next ORDER BY key, ascending, NULLs last.
--   * entry id is the very last key. It decides NOTHING the rules care about:
--     it only stops ROW_NUMBER() from ordering a still-unresolved tie
--     differently on every run (a pulled dog's row moving in the heap was
--     enough to swap two placements before), so the same inputs always write
--     the same rows.
--
-- Exact ties (owner, 2026-10-08). Every qualified dog is ranked. What a tie
-- does depends on its competition rank (the rank the group would share,
-- RANK() over the rule's keys):
--   * 1st-4th, including a group that straddles 4th (three dogs tied for 3rd):
--     a ribbon tie. A coin flip decides it, so the dogs get consecutive,
--     distinct placements (ROW_NUMBER) in the recorded flip order. Until the
--     flip is recorded (a member has no tiebreak, or two share one) every
--     member carries placement_tie = 'unresolved'; their order meanwhile is
--     stable (entry id), as the unresolved order was arbitrary before.
--   * 5th and below: no flip. The dogs share the competition rank (two dogs
--     tied for 5th are both 5th, the next dog is 7th) and carry
--     placement_tie = 'shared', so the UI can say "5th (tie)". Before this
--     change they got consecutive placements in scan order.
--   * Otherwise placement_tie is NULL (no tie, or a flip already recorded).
-- One column, not two booleans: the two states cannot both hold for one dog
-- (a ribbon tie is never shared, a shared tie never needs a flip), so a
-- single nullable column cannot represent an impossible pair, and it needs
-- one guard, one reset and one grant.
--
-- placement_tie is a stored column so the client replica can read it offline
-- with the rest of the entry row (a STABLE function would be online-only). The
-- recalculator is its only writer; a trigger (section 6b) drops it whenever
-- anything else unplaces the row (refresh_class_scoring_state's in-progress,
-- upcoming and tombstone clears), so a marker never outlives its placement.
-- ---------------------------------------------------------------------------
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
    WITH keyed AS (
      SELECT
        e2.id,
        e2.placement_tiebreak,
        coalesce(
          e2.is_scored = true
            AND e2.result_status = 'qualified'
            AND e2.deleted_at IS NULL,
          false
        ) AS eligible,
        -- Nationals: most points first. Otherwise (NULL included, as the old
        -- IF/ELSE did): fewest faults first. The other key is NULL for every
        -- row, so it never reorders anything.
        CASE WHEN p_is_nationals THEN e2.points_earned END AS points_key,
        CASE WHEN p_is_nationals IS NOT TRUE THEN e2.total_faults END AS faults_key,
        e2.search_time_seconds AS time_key
      FROM public.entries e2
      WHERE e2.class_id = v_class_id
    ),
    ranked AS (
      SELECT
        k.*,
        CASE WHEN k.eligible THEN
          ROW_NUMBER() OVER (
            PARTITION BY k.eligible
            ORDER BY
              k.points_key DESC NULLS LAST,
              k.faults_key ASC NULLS LAST,
              k.time_key ASC NULLS LAST,
              k.placement_tiebreak ASC NULLS LAST,
              k.id ASC
          )
        END AS row_place,
        CASE WHEN k.eligible THEN
          RANK() OVER (
            PARTITION BY k.eligible
            ORDER BY
              k.points_key DESC NULLS LAST,
              k.faults_key ASC NULLS LAST,
              k.time_key ASC NULLS LAST
          )
        END AS competition_rank,
        count(*) OVER tie_group AS tie_size,
        count(k.placement_tiebreak) OVER tie_group AS tiebreaks_set,
        count(*) OVER (
          PARTITION BY k.eligible, k.points_key, k.faults_key, k.time_key, k.placement_tiebreak
        ) AS same_tiebreak
      FROM keyed k
      WINDOW tie_group AS (PARTITION BY k.eligible, k.points_key, k.faults_key, k.time_key)
    ),
    placed AS (
      SELECT
        r.id,
        -- Ribbon range: the recorded flip order. Below it: the shared rank.
        CASE WHEN r.competition_rank <= 4 THEN r.row_place ELSE r.competition_rank END AS placement,
        CASE
          WHEN NOT r.eligible OR r.tie_size < 2 THEN NULL
          WHEN r.competition_rank > 4 THEN 'shared'
          WHEN r.tiebreaks_set < r.tie_size
               OR bool_or(r.placement_tiebreak IS NOT NULL AND r.same_tiebreak > 1)
                    OVER (PARTITION BY r.eligible, r.points_key, r.faults_key, r.time_key)
            THEN 'unresolved'
        END AS tie
      FROM ranked r
    )
    UPDATE public.entries e
       SET final_placement = p.placement,
           placement_tie = p.tie
      FROM placed p
     WHERE e.id = p.id
       AND (e.final_placement IS DISTINCT FROM p.placement
            OR e.placement_tie IS DISTINCT FROM p.tie);
  END LOOP;
END;
$$;

-- Restated from 20260817120000 (CREATE OR REPLACE keeps the ACL; stated so a
-- migrations-only rebuild carries it). Reached only through the entries
-- trigger under definer rights.
REVOKE ALL ON FUNCTION public.recalculate_class_placements(uuid[], boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_class_placements(uuid[], boolean) TO service_role;

COMMENT ON FUNCTION public.recalculate_class_placements(uuid[], boolean) IS
  'Recalculates final placements for scored, qualified, non-deleted entries in '
  'each supplied class: the rule''s keys, then the secretary-recorded coin-flip '
  'order (placement_tiebreak), then entry id only for a stable write. A tie '
  'within 1st-4th is placed consecutively and marked unresolved until its flip '
  'is recorded; a tie below 4th shares the competition rank and is marked '
  'shared (placement_tie). Writes only rows that change (MYK9-1473). '
  'Soft-deleted entries are left unplaced.';

-- ---------------------------------------------------------------------------
-- 3b. Record a coin flip: set_class_tie_order(class, entry ids in order)
--
-- The ids must be exactly one tie group: every live, scored, qualified entry
-- of the class with the same ranking keys, all of them and nothing else (an
-- order over part of a group, or over dogs that are not tied, is refused with
-- MK016), and the tie must reach the ribbons (competition rank 4th or better;
-- below that the dogs share the placement and no flip is needed: MK017). They
-- get placement_tiebreak 1..n in the order given, then the class is re-derived
-- through refresh_class_scoring_state, which re-ranks a complete class. A
-- manual class that is fully accounted for is ranked too (20261017014900,
-- MYK9-1230), so the order applies there as well. A changed placement clears
-- a results check through the fingerprint like any other result change. A later change to any
-- placement-eligible entry's ranking inputs in the class clears every
-- recorded flip there (section 5a), and the secretary records it again.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_class_tie_order(
  p_class_id uuid,
  p_entry_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_trial_id uuid;
  v_is_nationals boolean;
  v_given integer;
  v_keys integer;
  v_group integer;
  v_version integer;
  v_rank bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to record a tie.' USING ERRCODE = '42501';
  END IF;

  v_given := cardinality(coalesce(p_entry_ids, '{}'::uuid[]));
  IF v_given < 2
     OR v_given <> (SELECT count(DISTINCT id) FROM unnest(p_entry_ids) AS id WHERE id IS NOT NULL) THEN
    RAISE EXCEPTION 'Give each tied entry once, at least two of them.' USING ERRCODE = '22023';
  END IF;

  SELECT c.trial_id INTO v_trial_id
  FROM public.classes c
  WHERE c.id = p_class_id AND c.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That class no longer exists.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT coalesce((SELECT public.can_manage_trial(v_trial_id)), false) THEN
    RAISE EXCEPTION 'You do not manage the show this class belongs to.' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(s.is_nationals, false) INTO v_is_nationals
  FROM public.trials t JOIN public.shows s ON s.id = t.show_id
  WHERE t.id = v_trial_id;

  -- Lock order (Codex review of 6cbd46088): a scoring write holds its entry
  -- row and then wants this class row, so waiting here for an entry row while
  -- holding the class row could deadlock. Entry rows are therefore taken
  -- NOWAIT: a score being saved in this class at this instant makes the call
  -- fail with 55P03 (retryable; the offline queue retries it) instead.
  BEGIN
    PERFORM 1 FROM public.entries e
    WHERE e.class_id = p_class_id
    ORDER BY e.id
    FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'A score in this class is being saved right now. Try again.'
      USING ERRCODE = '55P03';
  END;

  -- Every given id is a placed-eligible entry of this class, and they share
  -- one set of ranking keys...
  SELECT count(DISTINCT (
           CASE WHEN v_is_nationals THEN e.points_earned END,
           CASE WHEN NOT v_is_nationals THEN e.total_faults END,
           e.search_time_seconds))
    INTO v_keys
  FROM public.entries e
  WHERE e.id = ANY (p_entry_ids)
    AND e.class_id = p_class_id
    AND e.deleted_at IS NULL
    AND e.is_scored = true
    AND e.result_status = 'qualified'
  HAVING count(*) = v_given;

  -- ...and no other placed-eligible entry of the class shares them.
  IF v_keys = 1 THEN
    SELECT count(*) INTO v_group
    FROM public.entries e
    JOIN public.entries g ON g.id = p_entry_ids[1]
    WHERE e.class_id = p_class_id
      AND e.deleted_at IS NULL
      AND e.is_scored = true
      AND e.result_status = 'qualified'
      AND (CASE WHEN v_is_nationals THEN e.points_earned END)
            IS NOT DISTINCT FROM (CASE WHEN v_is_nationals THEN g.points_earned END)
      AND (CASE WHEN NOT v_is_nationals THEN e.total_faults END)
            IS NOT DISTINCT FROM (CASE WHEN NOT v_is_nationals THEN g.total_faults END)
      AND e.search_time_seconds IS NOT DISTINCT FROM g.search_time_seconds;
  END IF;

  IF v_keys IS DISTINCT FROM 1 OR v_group IS DISTINCT FROM v_given THEN
    RAISE EXCEPTION 'These entries are not one exact tie in this class.'
      USING ERRCODE = 'MK016',
            HINT = 'Give every placed entry with the same score and time, and only those.';
  END IF;

  -- Below the ribbons there is no flip: the dogs share the competition rank
  -- (recalculate_class_placements). A group that reaches 4th is a ribbon tie.
  SELECT r.competition_rank INTO v_rank
  FROM (
    SELECT e.id,
           RANK() OVER (
             ORDER BY
               CASE WHEN v_is_nationals THEN e.points_earned END DESC NULLS LAST,
               CASE WHEN NOT v_is_nationals THEN e.total_faults END ASC NULLS LAST,
               e.search_time_seconds ASC NULLS LAST
           ) AS competition_rank
    FROM public.entries e
    WHERE e.class_id = p_class_id
      AND e.deleted_at IS NULL
      AND e.is_scored = true
      AND e.result_status = 'qualified'
  ) r
  WHERE r.id = p_entry_ids[1];
  IF v_rank > 4 THEN
    RAISE EXCEPTION 'This tie is for place %, below the ribbons: the dogs share the placement and no coin flip is needed.', v_rank
      USING ERRCODE = 'MK017';
  END IF;

  UPDATE public.entries e
     SET placement_tiebreak = o.ord::smallint
    FROM unnest(p_entry_ids) WITH ORDINALITY AS o(id, ord)
   WHERE e.id = o.id
     AND e.placement_tiebreak IS DISTINCT FROM o.ord::smallint;

  PERFORM public.refresh_class_scoring_state(p_class_id);

  SELECT c.version INTO v_version FROM public.classes c WHERE c.id = p_class_id;
  RETURN v_version;
END;
$$;

COMMENT ON FUNCTION public.set_class_tie_order(uuid, uuid[]) IS
  'MYK9-1473: record the coin flip that decides an exact tie. p_entry_ids must be the whole tie group (every placed-eligible entry of the class with the same ranking keys), in finishing order; refused with MK016 otherwise, and with MK017 for a tie below 4th (no flip needed). Show managers only (can_manage_trial). Re-derives the class. Returns the class version.';

REVOKE ALL ON FUNCTION public.set_class_tie_order(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_class_tie_order(uuid, uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. After entries change: stale coin flips are dropped, and a changed result
--    clears the check
--
-- One statement-level function, two jobs, in this order:
--
--   a. Coin flips (Codex review of 6cbd46088). A recorded tie order is only
--      true for the tie it was recorded for. Rather than work out which
--      groups a change split or merged, the rule is the one that cannot be
--      wrong: when a statement changes the RANKING INPUTS of an entry that is
--      placement-eligible before or after it (eligibility, class, points,
--      faults, time; private.entry_rank_inputs), every placement_tiebreak in
--      that class is cleared and the class is re-derived, so any tie that
--      still exists reads unresolved and the secretary records the flip
--      again. Placement and tiebreak writes are not ranking inputs, so
--      set_class_tie_order and the recalculator never trigger it themselves.
--      Changes to entries that are never placed (an NQ's time, a scratched
--      dog) leave recorded flips alone.
--   b. Results check (as before): for a VERIFIED class whose result lines the
--      statement changed, clear the check when the live fingerprint differs
--      from the stored one.
--
-- Lock order. A scoring write locks its entry row before anything here runs,
-- and from here takes the class row (KEY SHARE, and the rollup's UPDATE) and
-- may then write other entries of the class (placements, cleared flips).
-- mark_class_results_verified only ever waits for the class row, and
-- set_class_tie_order waits for the class row but never waits for an entry
-- row while holding it (NOWAIT, section 3b), so neither can close a cycle
-- with this path.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.entry_rank_inputs(e public.entries)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN coalesce(e.is_scored = true AND e.result_status = 'qualified' AND e.deleted_at IS NULL, false)
    THEN concat_ws('|',
      e.class_id::text,
      private.results_fp_num(e.points_earned),
      private.results_fp_num(e.total_faults),
      private.results_fp_num(e.search_time_seconds))
  END;
$$;

COMMENT ON FUNCTION private.entry_rank_inputs(public.entries) IS
  'MYK9-1473: what recalculate_class_placements ranks an entry on (class, points, faults, time), or NULL when the entry is not placement-eligible. A change to it invalidates the class''s recorded coin flips.';

-- Named without its argument list for the same reason as entry_results_line.
REVOKE ALL ON FUNCTION private.entry_rank_inputs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.entries_clear_stale_results_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rank_class_ids uuid[];
  v_flip_class_ids uuid[];
  v_class_ids uuid[];
  v_class_id uuid;
BEGIN
  -- a. Classes whose placement-eligible ranking inputs this statement changed.
  IF TG_OP = 'INSERT' THEN
    SELECT array_agg(DISTINCT n.class_id) INTO v_rank_class_ids
    FROM new_rows n
    WHERE private.entry_rank_inputs(n) IS NOT NULL;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT array_agg(DISTINCT o.class_id) INTO v_rank_class_ids
    FROM old_rows o
    WHERE private.entry_rank_inputs(o) IS NOT NULL;
  ELSE
    SELECT array_agg(DISTINCT v.class_id) INTO v_rank_class_ids
    FROM old_rows o
    JOIN new_rows n ON n.id = o.id
    CROSS JOIN LATERAL (VALUES (o.class_id), (n.class_id)) AS v(class_id)
    WHERE v.class_id IS NOT NULL
      AND private.entry_rank_inputs(o) IS DISTINCT FROM private.entry_rank_inputs(n);
  END IF;

  IF v_rank_class_ids IS NOT NULL THEN
    WITH cleared AS (
      UPDATE public.entries e
         SET placement_tiebreak = NULL
       WHERE e.class_id = ANY (v_rank_class_ids)
         AND e.placement_tiebreak IS NOT NULL
      RETURNING e.class_id
    )
    SELECT array_agg(DISTINCT class_id) INTO v_flip_class_ids FROM cleared;

    -- The rollup already ranked these classes with the flips still set.
    FOREACH v_class_id IN ARRAY coalesce(v_flip_class_ids, '{}'::uuid[])
    LOOP
      PERFORM public.refresh_class_scoring_state(v_class_id);
    END LOOP;
  END IF;

  -- b. Classes whose result lines this statement changed. A class move or a
  --    soft-delete/restore of a resulted entry changes two classes' line sets.
  IF TG_OP = 'INSERT' THEN
    SELECT array_agg(DISTINCT n.class_id) INTO v_class_ids
    FROM new_rows n
    WHERE n.class_id IS NOT NULL
      AND private.entry_results_line(n) IS NOT NULL;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT array_agg(DISTINCT o.class_id) INTO v_class_ids
    FROM old_rows o
    WHERE o.class_id IS NOT NULL
      AND private.entry_results_line(o) IS NOT NULL;
  ELSE
    SELECT array_agg(DISTINCT v.class_id) INTO v_class_ids
    FROM old_rows o
    JOIN new_rows n ON n.id = o.id
    CROSS JOIN LATERAL (VALUES (o.class_id), (n.class_id)) AS v(class_id)
    WHERE v.class_id IS NOT NULL
      AND (
        private.entry_results_line(o) IS DISTINCT FROM private.entry_results_line(n)
        OR (o.class_id IS DISTINCT FROM n.class_id
            AND (private.entry_results_line(o) IS NOT NULL
                 OR private.entry_results_line(n) IS NOT NULL))
      );
  END IF;

  IF v_class_ids IS NULL THEN
    RETURN NULL;
  END IF;

  -- Serialize with mark_class_results_verified (which holds FOR UPDATE).
  PERFORM 1
  FROM public.classes c
  WHERE c.id = ANY (v_class_ids)
  ORDER BY c.id
  FOR KEY SHARE;

  UPDATE public.classes c
     SET results_verified_at = NULL,
         results_verified_by = NULL,
         results_verified_fingerprint = NULL
   WHERE c.id = ANY (v_class_ids)
     AND c.results_verified_at IS NOT NULL
     AND c.results_verified_fingerprint
         IS DISTINCT FROM private.class_results_fingerprint(c.id);

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION private.entries_clear_stale_results_verified() IS
  'MYK9-1473: statement-level entries trigger. (a) A change to a placement-eligible entry''s ranking inputs clears every recorded coin flip in its class and re-derives the class. (b) A verified class whose results fingerprint no longer matches the stored one loses its results check.';

REVOKE ALL ON FUNCTION private.entries_clear_stale_results_verified() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6b. entries: the tie columns are server-written, and the marker never
--     outlives its placement
--
-- authenticated holds table-level INSERT/UPDATE on entries, so without the
-- guard a direct or replayed row write could set a tiebreak that skipped
-- set_class_tie_order's whole-group check, or a stale marker. The guard sorts
-- before the marker reset (trg_00_ < trg_zz_), so it judges the caller's own
-- NEW row, and the reset's own change to the marker is never mistaken for one.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.entries_block_direct_tie_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'A tie''s order can only be recorded with set_class_tie_order.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.entries_block_direct_tie_write() IS
  'MYK9-1473: refuses anon/authenticated writes to entries.placement_tiebreak / placement_tie; set_class_tie_order and the recalculator run as their owner and pass.';

REVOKE ALL ON FUNCTION private.entries_block_direct_tie_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_00_block_direct_placement_tie_write ON public.entries;
CREATE TRIGGER trg_00_block_direct_placement_tie_write
  BEFORE UPDATE ON public.entries
  FOR EACH ROW
  WHEN (OLD.placement_tiebreak IS DISTINCT FROM NEW.placement_tiebreak
        OR OLD.placement_tie IS DISTINCT FROM NEW.placement_tie)
  EXECUTE FUNCTION private.entries_block_direct_tie_write();

DROP TRIGGER IF EXISTS trg_00_block_direct_placement_tie_insert ON public.entries;
CREATE TRIGGER trg_00_block_direct_placement_tie_insert
  BEFORE INSERT ON public.entries
  FOR EACH ROW
  WHEN (NEW.placement_tiebreak IS NOT NULL OR NEW.placement_tie IS NOT NULL)
  EXECUTE FUNCTION private.entries_block_direct_tie_write();

CREATE OR REPLACE FUNCTION private.entries_unplaced_clears_tie_marker()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.placement_tie := NULL;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.entries_unplaced_clears_tie_marker() IS
  'MYK9-1473: an entry that loses its placement (refresh_class_scoring_state''s clears, a manual edit) is no longer in an unresolved tie.';

REVOKE ALL ON FUNCTION private.entries_unplaced_clears_tie_marker() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_zz_entries_unplaced_clears_tie_marker ON public.entries;
CREATE TRIGGER trg_zz_entries_unplaced_clears_tie_marker
  BEFORE UPDATE ON public.entries
  FOR EACH ROW
  WHEN (NEW.final_placement IS NULL AND NEW.placement_tie IS NOT NULL)
  EXECUTE FUNCTION private.entries_unplaced_clears_tie_marker();

-- Column grants, stated rather than inherited (as 20261001034700 did):
-- authenticated reads both (the replica needs the marker offline, and the order
-- the secretary recorded); anon reads no entries column (allowlist empty).
GRANT SELECT (placement_tiebreak, placement_tie) ON public.entries TO authenticated;
REVOKE ALL (placement_tiebreak, placement_tie) ON public.entries FROM anon;

-- ---------------------------------------------------------------------------
-- 7. Verify guard and tie reader
--
-- mark_class_results_verified is copied from its latest definition
-- (20261008014300, MYK9-1045; nothing later replaces it) with one addition: a
-- class with an unresolved ribbon tie cannot be marked checked, because its
-- placements for that tie are arbitrary until the coin flip is recorded
-- (MK018). The tie check runs before the fingerprint comparison so the answer
-- does not depend on what the caller ticked.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_class_results_verified(
  p_class_id uuid,
  p_results_fingerprint text,
  p_verified_at timestamptz DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_class record;
  v_current text;
  v_version integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to record that results were checked.' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(coalesce(p_results_fingerprint, '')), '') IS NULL THEN
    RAISE EXCEPTION 'The results you checked were not sent with the request.' USING ERRCODE = '22023';
  END IF;

  -- Lock before reading the fingerprint: see "Concurrency" in the header.
  SELECT c.id, c.trial_id, c.name, c.status
    INTO v_class
  FROM public.classes c
  WHERE c.id = p_class_id AND c.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That class no longer exists.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT coalesce((SELECT public.can_manage_trial(v_class.trial_id)), false) THEN
    RAISE EXCEPTION 'You do not manage the show this class belongs to.' USING ERRCODE = '42501';
  END IF;
  IF v_class.status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION '% is not complete yet, so its results cannot be checked.', v_class.name
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.entries e
    WHERE e.class_id = p_class_id
      AND e.deleted_at IS NULL
      AND e.placement_tie = 'unresolved'
  ) THEN
    RAISE EXCEPTION '% has a tie for a ribbon that is not decided yet. Record the coin flip first.', v_class.name
      USING ERRCODE = 'MK018',
            HINT = 'Call set_class_tie_order for each tie in the class (get_class_ties lists them).';
  END IF;

  v_current := private.class_results_fingerprint(p_class_id);
  IF v_current IS DISTINCT FROM p_results_fingerprint THEN
    RAISE EXCEPTION '%''s results changed after you checked them. Check them again.', v_class.name
      USING ERRCODE = 'MK015',
            HINT = 'The results fingerprint sent does not match the class''s current results.';
  END IF;

  -- A replay of the same check keeps the first stamp. A verified class's
  -- stored fingerprint always equals the live one (the entries trigger clears
  -- it otherwise), so there is nothing to refresh.
  UPDATE public.classes c
     SET results_verified_at = least(coalesce(p_verified_at, now()), now()),
         results_verified_by = v_uid,
         results_verified_fingerprint = v_current
   WHERE c.id = p_class_id
     AND c.results_verified_at IS NULL;

  SELECT c.version INTO v_version FROM public.classes c WHERE c.id = p_class_id;
  RETURN v_version;
END;
$$;

COMMENT ON FUNCTION public.mark_class_results_verified(uuid, text, timestamptz) IS
  'MYK9-1045: record that a completed class''s results were checked against the paper. Show managers only (can_manage_trial). p_results_fingerprint is the fingerprint of the results the manager looked at (classResultsFingerprint.ts); refused with MK015 when the class''s results no longer match it, and with MK018 while a tie for a ribbon still needs its coin flip (MYK9-1473). Keeps an existing stamp. Returns the class''s new version.';

REVOKE ALL ON FUNCTION public.mark_class_results_verified(uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_class_results_verified(uuid, text, timestamptz) TO authenticated;

-- get_class_ties: one row per entry of every unresolved ribbon tie in the
-- class (placement_tie = 'unresolved'), grouped by the shared ranking keys.
-- group_rank is the competition rank the group shares (2 = tied for 2nd), so
-- the client can say "Tied for 2nd"; ranks_by_points says whether the shared
-- result is points and time (nationals) or faults and time. Same manager gate as set_class_tie_order.
-- Online-only like set_class_tie_order: the entries replication views are
-- deliberately not widened (MYK9-1369 reworks them).
CREATE OR REPLACE FUNCTION public.get_class_ties(p_class_id uuid)
RETURNS TABLE (
  group_rank integer,
  entry_id uuid,
  armband_number text,
  dog_call_name text,
  final_placement integer,
  total_faults integer,
  points_earned integer,
  search_time_seconds numeric,
  ranks_by_points boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trial_id uuid;
  v_is_nationals boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to see a class''s ties.' USING ERRCODE = '42501';
  END IF;

  SELECT c.trial_id INTO v_trial_id
  FROM public.classes c
  WHERE c.id = p_class_id AND c.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That class no longer exists.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT coalesce((SELECT public.can_manage_trial(v_trial_id)), false) THEN
    RAISE EXCEPTION 'You do not manage the show this class belongs to.' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(s.is_nationals, false) INTO v_is_nationals
  FROM public.trials t JOIN public.shows s ON s.id = t.show_id
  WHERE t.id = v_trial_id;

  RETURN QUERY
  SELECT
    (min(e.final_placement) OVER (
      -- The same keys recalculate_class_placements ties on: points at a
      -- nationals, faults otherwise, then time.
      PARTITION BY CASE WHEN v_is_nationals THEN e.points_earned END,
                   CASE WHEN NOT v_is_nationals THEN e.total_faults END,
                   e.search_time_seconds
    ))::integer AS group_rank,
    e.id,
    -- The authoritative armband is armbands.armband_number; entries.armband is
    -- the denormalised fallback. Text, because suffixed armbands ("12A") exist.
    NULLIF(btrim(COALESCE(NULLIF(btrim(ab.armband_number), ''), e.armband, '')), '')::text,
    d.call_name::text,
    e.final_placement::integer,
    e.total_faults::integer,
    e.points_earned::integer,
    e.search_time_seconds::numeric,
    v_is_nationals
  FROM public.entries e
  LEFT JOIN public.dogs d ON d.id = e.dog_id
  LEFT JOIN LATERAL (
    SELECT a2.armband_number
    FROM public.armbands a2
    WHERE a2.show_id = e.show_id
      AND a2.dog_id = e.dog_id
    ORDER BY a2.assigned_at DESC NULLS LAST
    LIMIT 1
  ) ab ON TRUE
  WHERE e.class_id = p_class_id
    AND e.deleted_at IS NULL
    AND e.placement_tie = 'unresolved'
  ORDER BY 1, e.final_placement, e.id;
END;
$$;

COMMENT ON FUNCTION public.get_class_ties(uuid) IS
  'MYK9-1473: the unresolved ribbon ties of a class, one row per tied entry (group_rank = the place the group shares), for the Results tab''s Record coin flip dialog. Show managers only (can_manage_trial). Empty when every tie is recorded.';

REVOKE ALL ON FUNCTION public.get_class_ties(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_class_ties(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Backfill: re-derive completed classes
--
-- Adding the columns and replacing the function does not run the recalculator,
-- so a class completed before this migration would keep consecutive placements
-- for a tie below 4th and no marker on a ribbon tie until an unrelated score
-- write refreshed it. Re-derive every completed, non-deleted class through
-- refresh_class_scoring_state, the entry point the app uses: a class whose
-- status was set by hand (status_source = 'manual', MYK9-1230) is re-ranked
-- only when every expected entry is accounted for and otherwise keeps its
-- placements, exactly as on a score write. Placements that do not change are
-- not written; a verified class whose placements change loses its results
-- check through the fingerprint, the intended signal to look at it again.
-- The class-status push webhook is suppressed for the duration (this corrects
-- stale state; same pattern as 20261017014900).
-- ---------------------------------------------------------------------------
ALTER TABLE public.classes DISABLE TRIGGER trg_notify_class_status_push;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.id
    FROM public.classes c
    WHERE c.status = 'completed'
      AND c.deleted_at IS NULL
    ORDER BY c.id
  LOOP
    PERFORM public.refresh_class_scoring_state(r.id);
  END LOOP;
END;
$$;

ALTER TABLE public.classes ENABLE TRIGGER trg_notify_class_status_push;

COMMIT;

NOTIFY pgrst, 'reload schema';
