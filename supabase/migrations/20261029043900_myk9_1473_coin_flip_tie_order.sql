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
-- Grants: the authenticated entries column SELECT stays at 56 columns. Both
-- columns are revoked from anon and authenticated on the base table (section
-- 6b); the replica reads them only through the owner-run results views.
--
--   6. mark_class_results_verified refuses (MK018) while a ribbon tie in the
--      class is still unresolved. Both entries results views carry
--      placement_tie and placement_tiebreak (masked like final_placement), so
--      the Results tab derives the tie groups from the replicated entries and
--      offers "Record coin flip" (saving is online only, like
--      set_class_tie_order). There is no tie-reader RPC.
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

-- Column privileges, stated rather than inherited: NEITHER API role reads these
-- on the base table. They are result data, and an exhibitor can select their own
-- entries rows under RLS, so a column grant would show an unresolved tie or the
-- recorded flip order before results are released. The replica reads them only
-- through the results views (section 7b), which are owner-run and mask both
-- exactly like final_placement. The entries allowlist stays at 56 columns.
REVOKE ALL (placement_tiebreak, placement_tie) ON public.entries FROM anon, authenticated;

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
            HINT = 'Call set_class_tie_order for each tie in the class.';
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

-- ---------------------------------------------------------------------------
-- 7b. Replicate the tie state
--
-- The Results tab derives its ties from the replicated entries, so both views
-- gain placement_tie and placement_tiebreak, masked EXACTLY like final_placement
-- (a caller who cannot see the placement cannot see why it is shared). There is
-- no tie-reader RPC: a score correction re-ranks the class, moves the entry
-- rows' updated_at, and the replica picks the new marker up on its next pull.
--
-- The inner view is rebuilt from its LATEST definition (20261029023100,
-- MYK9-1369, the is_show_exhibitor hoist, which this must not revert); the
-- replication wrapper from 20261022131700 (MYK9-1326; 20261028213700 only reads them) with the two columns appended at
-- the end of each explicit select list. security_invoker = false is carried
-- inline because CREATE OR REPLACE VIEW resets reloptions. Grants are restated
-- exactly as that file leaves them: authenticated SELECT, service_role ALL,
-- nothing for anon or PUBLIC.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.view_authenticated_entry_results
  WITH (security_invoker = false)
AS
WITH caller_context AS MATERIALIZED (
  SELECT * FROM private.entry_results_caller_context()
),
-- MYK9-1369: the shows where the caller has a live, non-withdrawn entry as
-- handler, dog owner or dog co-owner. Depends on caller_context only, and
-- MATERIALIZED guarantees one evaluation per query. Three UNION ALL arms, one
-- per role, so each is an index lookup on the caller's own rows
-- (entries_active_handler_id_idx; dogs_owner_id_idx / dogs_co_owner_id_idx ->
-- entries_active_dog_id_idx) rather than an OR across the join, which would
-- scan every live entry on the platform. The union is the same set the old
-- `handler OR own_dog.owner OR own_dog.co_owner` over entries LEFT JOIN dogs
-- admitted: an entry with no dog row can match only through its handler arm.
exhibitor_shows AS MATERIALIZED (
  SELECT COALESCE(
    (
      SELECT array_agg(DISTINCT own.show_id)
      FROM (
        SELECT own_e.show_id
        FROM public.entries own_e
        WHERE own_e.handler_id = ctx0.person_id
          AND own_e.deleted_at IS NULL
          AND own_e.entry_status NOT IN ('withdrawn', 'scratched')
        UNION ALL
        SELECT own_e.show_id
        FROM public.dogs own_dog
        JOIN public.entries own_e ON own_e.dog_id = own_dog.id
        WHERE own_dog.owner_id = ctx0.person_id
          AND own_e.deleted_at IS NULL
          AND own_e.entry_status NOT IN ('withdrawn', 'scratched')
        UNION ALL
        SELECT own_e.show_id
        FROM public.dogs own_dog
        JOIN public.entries own_e ON own_e.dog_id = own_dog.id
        WHERE own_dog.co_owner_id = ctx0.person_id
          AND own_e.deleted_at IS NULL
          AND own_e.entry_status NOT IN ('withdrawn', 'scratched')
      ) own
    ),
    ARRAY[]::uuid[]
  ) AS show_ids
  FROM caller_context ctx0
)
SELECT
  e.id,
  e.dog_id,
  e.class_id,
  e.show_id,
  e.trial_id,
  e.handler_id,
  e.entry_status,
  CASE WHEN access.can_view_admin THEN e.payment_status END AS payment_status,
  e.handler,
  (CASE WHEN access.can_view_admin THEN e.entry_fee END)::numeric(10,2) AS entry_fee,
  e.submitted_at,
  CASE WHEN access.can_view_admin THEN e.special_requests END AS special_requests,
  e.armband,
  e.run_order,
  e.jump_height,
  e.preferred_judge,
  e.move_up_requested,
  e.is_scored,
  e.is_in_ring,
  CASE WHEN access.can_view_scores OR vis.qualification_visible THEN e.result_status END AS result_status,
  e.ring_entry_time,
  e.ring_exit_time,
  e.scoring_started_at,
  e.scoring_completed_at,
  CASE WHEN access.can_view_scores OR vis.time_visible THEN e.search_time_seconds END AS search_time_seconds,
  CASE WHEN access.can_view_scores THEN e.area1_time_seconds END AS area1_time_seconds,
  CASE WHEN access.can_view_scores THEN e.area2_time_seconds END AS area2_time_seconds,
  CASE WHEN access.can_view_scores THEN e.area3_time_seconds END AS area3_time_seconds,
  CASE WHEN access.can_view_scores THEN e.area4_time_seconds END AS area4_time_seconds,
  CASE WHEN access.can_view_scores THEN e.total_correct_finds END AS total_correct_finds,
  CASE WHEN access.can_view_scores THEN e.total_incorrect_finds END AS total_incorrect_finds,
  CASE WHEN access.can_view_scores OR vis.faults_visible THEN e.total_faults END AS total_faults,
  CASE WHEN access.can_view_scores THEN e.no_finish_count END AS no_finish_count,
  CASE WHEN access.can_view_scores THEN e.area1_correct END AS area1_correct,
  CASE WHEN access.can_view_scores THEN e.area1_incorrect END AS area1_incorrect,
  CASE WHEN access.can_view_scores THEN e.area1_faults END AS area1_faults,
  CASE WHEN access.can_view_scores THEN e.area2_correct END AS area2_correct,
  CASE WHEN access.can_view_scores THEN e.area2_incorrect END AS area2_incorrect,
  CASE WHEN access.can_view_scores THEN e.area2_faults END AS area2_faults,
  CASE WHEN access.can_view_scores THEN e.area3_correct END AS area3_correct,
  CASE WHEN access.can_view_scores THEN e.area3_incorrect END AS area3_incorrect,
  CASE WHEN access.can_view_scores THEN e.area3_faults END AS area3_faults,
  CASE WHEN access.can_view_scores OR vis.time_visible THEN e.total_score END AS total_score,
  CASE WHEN access.can_view_scores THEN e.points_earned END AS points_earned,
  CASE WHEN access.can_view_scores THEN e.points_possible END AS points_possible,
  CASE WHEN access.can_view_scores THEN e.bonus_points END AS bonus_points,
  CASE WHEN access.can_view_scores THEN e.penalty_points END AS penalty_points,
  CASE WHEN access.can_view_scores THEN e.time_over_limit END AS time_over_limit,
  CASE WHEN access.can_view_scores THEN e.time_limit_exceeded_seconds END AS time_limit_exceeded_seconds,
  CASE WHEN access.can_view_scores OR vis.placement_visible THEN e.final_placement END AS final_placement,
  CASE WHEN access.can_view_scores THEN e.judge_notes END AS judge_notes,
  CASE WHEN access.can_view_scores THEN e.judge_signature END AS judge_signature,
  CASE WHEN access.can_view_scores THEN e.judge_signature_timestamp END AS judge_signature_timestamp,
  CASE WHEN access.can_view_scores THEN e.disqualification_reason END AS disqualification_reason,
  CASE WHEN access.can_view_scores THEN e.has_video_review END AS has_video_review,
  CASE WHEN access.can_view_scores THEN e.video_review_notes END AS video_review_notes,
  e.license_key,
  e.local_id,
  e.sync_version,
  e.last_synced_at,
  e.created_at,
  GREATEST(
    e.updated_at,
    c.updated_at,
    sh.updated_at,
    show_vis.updated_at,
    trial_vis.updated_at,
    class_vis.updated_at,
    -- MYK9-969: every input to the privacy mask moves the row (see the
    -- header's input table): tied people's profiles and people rows, the
    -- dog's ownership, and the one-time epoch of this migration.
    consent.profiles_updated_at,
    d.updated_at,
    (SELECT max(epoch.updated_at) FROM private.results_privacy_epoch epoch),
    -- MYK9-1162: changing the trial's registry flips awaiting_registration_number
    -- for every entry in it, so the trial moves the row for the replication
    -- cursor (updated_at, id). Registration changes do not appear here: a
    -- DELETE cannot be seen by a max(updated_at), so
    -- trg_dog_registrations_touch_entries bumps the dog's entries instead.
    held_trial.updated_at
  ) AS updated_at,
  e.deleted_at,
  CASE WHEN access.can_view_admin THEN e.deleted_by END AS deleted_by,
  e.check_in_status,
  CASE WHEN access.can_view_admin THEN e.payment_method END AS payment_method,
  e.entry_source,
  e.is_day_of_show,
  e.registration_id,
  CASE WHEN access.can_view_admin THEN e.withdrawal_reason END AS withdrawal_reason,
  (CASE WHEN access.can_view_admin THEN e.refund_amount END)::numeric(10,2) AS refund_amount,
  CASE WHEN access.can_view_admin THEN e.refund_notes END AS refund_notes,
  CASE WHEN access.can_view_admin THEN e.refunded_at END AS refunded_at,
  CASE WHEN access.can_view_admin THEN e.stripe_payment_intent_id END AS stripe_payment_intent_id,
  CASE WHEN access.can_view_admin THEN e.comped END AS comped,
  CASE WHEN access.can_view_admin THEN e.comped_reason END AS comped_reason,
  (CASE WHEN access.can_view_admin THEN e.discount_amount END)::numeric(10,2) AS discount_amount,
  CASE WHEN access.can_view_admin THEN e.confirmation_email_sent_at END AS confirmation_email_sent_at,
  CASE WHEN access.can_view_admin THEN e.confirmation_email_message_id END AS confirmation_email_message_id,
  CASE WHEN access.can_view_admin THEN e.confirmation_email_status END AS confirmation_email_status,
  e.version,
  CASE
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'qualified'  THEN 'Q'
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'nq'         THEN 'NQ'
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'absent'     THEN 'ABS'
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'excused'    THEN 'EX'
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'disqualified' THEN 'DQ'
    WHEN (access.can_view_scores OR vis.qualification_visible) AND e.is_scored = true AND e.result_status = 'withdrawn'  THEN 'WD'
    ELSE NULL
  END AS result_text,
  d.name AS dog_name,
  d.call_name AS dog_call_name,
  d.breed AS dog_breed,
  d.image_url AS dog_image_url,
  c.name AS class_name,
  c.level AS class_level,
  c.element AS class_element,
  c.results_released_at AS class_results_released_at,
  sh.name AS show_name,
  sh.start_date AS show_start_date,
  sh.organization AS show_organization,
  access.is_own_entry AS is_own_entry,
  -- Secretary payment bookkeeping. Masked by `can_view_admin` exactly like the
  -- other payment columns above; appended at the END of the select list because
  -- CREATE OR REPLACE VIEW may only add columns there.
  CASE WHEN access.can_view_admin THEN e.payment_reference END AS payment_reference,
  CASE WHEN access.can_view_admin THEN e.payment_received_on END AS payment_received_on,
  CASE WHEN access.can_view_admin THEN e.payment_notes END AS payment_notes,
  -- MYK9-632: the ENUMERATED withdrawal reason, beside the free-text
  -- `withdrawal_reason` above and masked by the same `can_view_admin` (a show
  -- manager, or the entry's own exhibitor). Appended at the END of the select
  -- list because CREATE OR REPLACE VIEW may only add columns there.
  CASE WHEN access.can_view_admin THEN e.withdrawal_reason_code END AS withdrawal_reason_code,
  -- MYK9-639: the supersession link. Structural, not financial, so it is NOT
  -- masked by can_view_admin -- it is the same kind of fact as e.class_id, and
  -- anyone this view already admits to the row may know which entry this one
  -- replaced. Appended at the END of the select list because CREATE OR REPLACE
  -- VIEW may only add columns there.
  e.moved_from_entry_id,
  -- MYK9-659: the ORDER's human reference. `enrollments.confirmation_number`
  -- is NOT NULL and defaulted from generate_confirmation_number(), and
  -- submit_show_entries always writes entries.registration_id, so every
  -- order the app creates has one. It reached the client only through the
  -- PostgREST `registration:registration_id(...)` embed, which the offline
  -- replica path cannot make -- so the same order printed `Confirmation #:
  -- MK9-000146` online and a raw enrollment UUID offline.
  --
  -- NOT the sibling of `payment_reference` above. That is an `entries` column,
  -- also reachable under `entries` RLS; this is a CROSS-TABLE column from
  -- `public.enrollments`, reached by an owner-run LEFT JOIN that evaluates no
  -- `enrollments` policy, so `access.can_view_admin` is its ONLY guard -- and
  -- a different predicate from `enrollments_select`, which matches the
  -- enrollment's own handler_id. Deliberate: the order reference belongs to
  -- whoever the ENTRY belongs to, so the entry's handler or the dog's owner
  -- sees the reference of the order their entry is on, even when another
  -- person placed it. Both client read paths apply that one rule.
  --
  -- Appended at the END of the select list because CREATE OR REPLACE VIEW may
  -- only add columns there.
  CASE WHEN access.can_view_admin THEN en.confirmation_number END AS registration_confirmation_number,
  -- MYK9-969: TRUE when this row's results are private and the caller is
  -- neither show staff nor a person tied to the entry, so every result column
  -- above arrived NULL for that reason (not because results are unreleased).
  -- Appended at the END: CREATE OR REPLACE VIEW may only add columns there.
  privacy.masked AS results_private,
  -- MYK9-1162: TRUE when this live entry's dog has no registration number for
  -- the trial's registry (a held entry). Computed here, server-side, by the one
  -- predicate public.entry_awaiting_registration_number() so a ringside device
  -- that cannot read dog_registrations (RLS, passcode sessions) still knows.
  -- Not masked: it names no registration data. Appended at the END because
  -- CREATE OR REPLACE VIEW may only add columns there.
  public.entry_awaiting_registration_number(e.dog_id, e.class_id, e.entry_status, e.deleted_at) AS awaiting_registration_number,
  -- MYK9-1473: the tie marker and the secretary's recorded order, masked
  -- EXACTLY like final_placement (the ranking they explain): visible to the
  -- people who can see scores, and to everyone else only when the placement is
  -- visible to them. Appended at the END because CREATE OR REPLACE VIEW may
  -- only add columns there.
  CASE WHEN access.can_view_scores OR vis.placement_visible THEN e.placement_tie END AS placement_tie,
  CASE WHEN access.can_view_scores OR vis.placement_visible THEN e.placement_tiebreak END AS placement_tiebreak
FROM public.entries e
LEFT JOIN public.enrollments en ON en.id = e.registration_id
LEFT JOIN public.dogs d ON d.id = e.dog_id
LEFT JOIN public.classes c ON c.id = e.class_id
LEFT JOIN public.trials held_trial ON held_trial.id = c.trial_id
LEFT JOIN public.shows sh ON sh.id = e.show_id
LEFT JOIN public.show_visibility_settings show_vis ON show_vis.show_id = e.show_id
LEFT JOIN public.trial_visibility_overrides trial_vis ON trial_vis.trial_id = c.trial_id
LEFT JOIN public.class_visibility_overrides class_vis ON class_vis.class_id = e.class_id
CROSS JOIN caller_context ctx
CROSS JOIN exhibitor_shows
LEFT JOIN private.class_result_visibility cvr ON cvr.class_id = e.class_id
-- MYK9-126: `vis` keeps its four column names, so every downstream reference
-- above is byte-identical to 20260902130000. The COALESCE reproduces the
-- function's fail-closed RETURN for an unknown or trial-less class, which a
-- LEFT JOIN would otherwise surface as NULL.
CROSS JOIN LATERAL (
  SELECT
    COALESCE(cvr.placement_visible, false)     AS placement_visible,
    COALESCE(cvr.qualification_visible, false) AS qualification_visible,
    COALESCE(cvr.time_visible, false)          AS time_visible,
    COALESCE(cvr.faults_visible, false)        AS faults_visible
) AS cascade_vis
CROSS JOIN LATERAL (
  SELECT
    (
      sh.id IS NOT NULL
      AND (
        -- MYK9-329: a club-less show is site-admin only. The former arm that
        -- admitted any holder of a manager role when the show had no club handed every
        -- club admin and secretary on the platform can_manage (and therefore
        -- can_view_admin: payment_status, entry_fee, judge_notes, ...) on any
        -- show with no club. MYK9-258 (20260828230000) removed that semantics
        -- from can_manage_show / manageable_show_ids / get_entries_for_export;
        -- this view was re-emitted with the old arm and left behind. Parity
        -- with can_manage_show() is restored here.
        ctx.is_site_admin
        OR sh.club_id = ANY(ctx.managed_club_ids)
        OR e.show_id = ANY(ctx.managed_show_ids)
      )
    ) AS can_manage,
    e.class_id = ANY(ctx.assigned_class_ids) AS is_assigned_judge,
    (
      e.show_id = ANY(ctx.steward_show_ids)
      OR sh.club_id = ANY(ctx.steward_club_ids)
    ) AS is_show_steward,
    (
      ctx.person_id = e.handler_id
      OR EXISTS (
        SELECT 1
        FROM public.dogs owned_dog
        WHERE owned_dog.id = e.dog_id
          AND owned_dog.owner_id = ctx.person_id
      )
    ) AS is_own_entry,
    COALESCE(e.show_id = ANY(exhibitor_shows.show_ids), false) AS is_show_exhibitor,
    (
      ctx.claim_kind = 'ringside_passcode'
      AND ctx.claim_show_id = e.show_id::text
      AND ctx.claim_generation_current
    ) AS claim_show_match,
    ctx.claim_role
) AS flags
CROSS JOIN LATERAL (
  SELECT
    flags.can_manage,
    flags.is_assigned_judge,
    flags.is_show_steward,
    flags.is_own_entry,
    flags.is_show_exhibitor,
    (flags.claim_show_match AND flags.claim_role IN ('judge', 'steward', 'admin')) AS is_ringside_claim,
    (
      flags.can_manage
      OR flags.is_assigned_judge
      OR (flags.claim_show_match AND flags.claim_role IN ('judge', 'admin'))
    ) AS can_view_scores,
    (flags.can_manage OR flags.is_own_entry) AS can_view_admin
) AS access
-- MYK9-969: results privacy. An entry's results are PUBLIC only when the show
-- is not private AND every person tied to the entry (the dog's owner and
-- co-owner, the entry's handler) has opted in on their own account. Most
-- private wins; an entry with no tied person, or a tied person with no
-- account, stays private (nobody opted in).
--
-- The opt-in is read through the person's OWN account: people.auth_user_id ->
-- exhibitor_profiles.auth_user_id (unique on both sides). It is never read via
-- exhibitor_profiles.person_id, which the row's own user may rewrite under the
-- self-only UPDATE policy -- keying on it would let anyone opt a stranger in.
CROSS JOIN LATERAL (
  SELECT
    bool_and(COALESCE(tep.results_public, false)) AS all_opted_in,
    -- people.updated_at too: relinking an account changes WHICH profile
    -- counts, and a deleted profile touches its person (trigger above).
    max(GREATEST(tep.updated_at, tp.updated_at)) AS profiles_updated_at
  FROM unnest(ARRAY[d.owner_id, d.co_owner_id, e.handler_id]) AS tied(person_id)
  LEFT JOIN public.people tp ON tp.id = tied.person_id
  LEFT JOIN public.exhibitor_profiles tep ON tep.auth_user_id = tp.auth_user_id
  WHERE tied.person_id IS NOT NULL
) AS consent
CROSS JOIN LATERAL (
  SELECT
    (
      (COALESCE(show_vis.results_private, false) OR consent.all_opted_in IS NOT TRUE)
      -- COALESCE: the claim arms are NULL (not false) for a caller with no
      -- ringside claim, and a NULL here would leave results_private NULL.
      AND NOT COALESCE(
        -- Show staff see every result: manager, the class's judge, a steward,
        -- and a current ringside judge/steward/admin passcode session.
        access.can_view_scores
        OR access.is_show_steward
        OR access.is_ringside_claim
        -- The people tied to the entry see their own results.
        OR access.is_own_entry
        OR (ctx.person_id IS NOT NULL AND ctx.person_id = d.co_owner_id),
        false
      )
    ) AS masked
) AS privacy
-- The cascade-visible flags, with privacy applied on top. Every result column
-- above reads `vis`, so masking here leaves their expressions byte-identical.
-- can_view_scores already short-circuits those columns for staff.
CROSS JOIN LATERAL (
  SELECT
    cascade_vis.placement_visible     AND NOT privacy.masked AS placement_visible,
    cascade_vis.qualification_visible AND NOT privacy.masked AS qualification_visible,
    cascade_vis.time_visible          AND NOT privacy.masked AS time_visible,
    cascade_vis.faults_visible        AND NOT privacy.masked AS faults_visible
) AS vis
WHERE (e.deleted_at IS NULL OR access.is_own_entry)
  AND (
    access.can_manage
    OR access.is_assigned_judge
    OR access.is_show_steward
    OR access.is_own_entry
    OR access.is_show_exhibitor
    OR access.is_ringside_claim
  );

REVOKE ALL ON public.view_authenticated_entry_results FROM PUBLIC;
REVOKE ALL ON public.view_authenticated_entry_results FROM anon;
REVOKE ALL ON public.view_authenticated_entry_results FROM authenticated;
REVOKE ALL ON public.view_authenticated_entry_results FROM service_role;
GRANT SELECT ON public.view_authenticated_entry_results TO authenticated;
GRANT ALL ON public.view_authenticated_entry_results TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.view_authenticated_entry_results FROM authenticated;

COMMENT ON VIEW public.view_authenticated_entry_results IS
  'Authenticated entry results. Scored columns stay gated by can_view_scores and '
  'payment columns by can_view_admin, which now also masks the enumerated '
  'withdrawal_reason_code beside the free-text withdrawal_reason (MYK9-632). A '
  'club-less show is manageable by site admins only (MYK9-258 / MYK9-329). Class '
  'result visibility resolves once per class via private.class_result_visibility '
  '(MYK9-126). moved_from_entry_id (MYK9-639) is unmasked: it is structural provenance, like class_id. registration_confirmation_number (MYK9-659) is appended after it and is NOT a sibling of payment_reference: it is a cross-table column from public.enrollments, reached by an owner-run LEFT JOIN that evaluates no enrollments policy, so can_view_admin is its ONLY guard -- a different predicate from enrollments_select, which matches the enrollment''s own handler_id. That is deliberate: the order reference belongs to whoever the ENTRY belongs to, so the entry''s handler or the dog''s owner sees the reference of the order their entry is on, even when another person placed it, and both client read paths apply that one rule. MYK9-969 results privacy: an entry''s results are public only when the show is not private (show_visibility_settings.results_private) and every tied person (dog owner, co-owner, handler) has exhibitor_profiles.results_public; otherwise every result column is NULL for a caller who is neither show staff nor a tied person, and results_private says so. Staff paths (can_view_scores, stewards, ringside staff claims) are unaffected. The view remains security_invoker = false. awaiting_registration_number (MYK9-1162) is appended last: TRUE for a live entry whose dog has no registration number for the trial''s registry, from public.entry_awaiting_registration_number(), and unmasked because it carries no registration data. is_show_exhibitor (MYK9-1369) is computed once per query from a materialized set of the caller''s exhibitor show ids, not once per entry; the access rule is unchanged. placement_tie and placement_tiebreak (MYK9-1473) are appended after it and masked exactly like final_placement (can_view_scores OR placement_visible), so the replica holds the coin-flip state wherever it holds the placement.';

CREATE OR REPLACE VIEW public.view_authenticated_entry_results_replication
  WITH (security_invoker = false)
AS
SELECT
  entries.id,
  entries.dog_id,
  entries.class_id,
  entries.show_id,
  entries.trial_id,
  entries.handler_id,
  entries.entry_status,
  entries.payment_status,
  entries.handler,
  entries.entry_fee,
  entries.submitted_at,
  entries.special_requests,
  entries.armband,
  entries.run_order,
  entries.jump_height,
  entries.preferred_judge,
  entries.move_up_requested,
  entries.is_scored,
  entries.is_in_ring,
  entries.result_status,
  entries.ring_entry_time,
  entries.ring_exit_time,
  entries.scoring_started_at,
  entries.scoring_completed_at,
  entries.search_time_seconds,
  entries.area1_time_seconds,
  entries.area2_time_seconds,
  entries.area3_time_seconds,
  entries.area4_time_seconds,
  entries.total_correct_finds,
  entries.total_incorrect_finds,
  entries.total_faults,
  entries.no_finish_count,
  entries.area1_correct,
  entries.area1_incorrect,
  entries.area1_faults,
  entries.area2_correct,
  entries.area2_incorrect,
  entries.area2_faults,
  entries.area3_correct,
  entries.area3_incorrect,
  entries.area3_faults,
  entries.total_score,
  entries.points_earned,
  entries.points_possible,
  entries.bonus_points,
  entries.penalty_points,
  entries.time_over_limit,
  entries.time_limit_exceeded_seconds,
  entries.final_placement,
  entries.judge_notes,
  entries.judge_signature,
  entries.judge_signature_timestamp,
  entries.disqualification_reason,
  entries.has_video_review,
  entries.video_review_notes,
  entries.license_key,
  entries.local_id,
  entries.sync_version,
  entries.last_synced_at,
  entries.created_at,
  entries.updated_at,
  entries.deleted_at,
  entries.deleted_by,
  entries.check_in_status,
  entries.payment_method,
  entries.entry_source,
  entries.is_day_of_show,
  entries.registration_id,
  entries.withdrawal_reason,
  entries.refund_amount,
  entries.refund_notes,
  entries.refunded_at,
  entries.stripe_payment_intent_id,
  entries.comped,
  entries.comped_reason,
  entries.discount_amount,
  entries.confirmation_email_sent_at,
  entries.confirmation_email_message_id,
  entries.confirmation_email_status,
  entries.version,
  entries.result_text,
  entries.dog_name,
  entries.dog_call_name,
  entries.dog_breed,
  entries.dog_image_url,
  entries.class_name,
  entries.class_level,
  entries.class_element,
  entries.class_results_released_at,
  entries.show_name,
  entries.show_start_date,
  entries.show_organization,
  entries.is_own_entry,
  entries.payment_reference,
  entries.payment_received_on,
  entries.payment_notes,
  shows.deleted_at AS show_deleted_at,
  shows.name AS source_show_name,
  shows.start_date AS source_show_start_date,
  shows.end_date AS source_show_end_date,
  -- Appended last: CREATE OR REPLACE VIEW may only add columns at the end, and
  -- the four `shows` columns above already hold ordinals 99-102.
  entries.withdrawal_reason_code,
  -- MYK9-639, appended last for the same CREATE OR REPLACE reason.
  entries.moved_from_entry_id,
  -- MYK9-659, appended last for the same CREATE OR REPLACE reason. Already
  -- masked by the inner view; the wrapper only carries it.
  entries.registration_confirmation_number,
  -- MYK9-969, appended last for the same CREATE OR REPLACE reason. Computed by
  -- the inner view; the wrapper only carries it.
  entries.results_private,
  -- MYK9-1162, appended last for the same CREATE OR REPLACE reason. Computed by
  -- the inner view; the wrapper only carries it.
  entries.awaiting_registration_number,
  -- MYK9-1473, appended last for the same CREATE OR REPLACE reason. Already
  -- masked like final_placement by the inner view; the wrapper only carries it.
  entries.placement_tie,
  entries.placement_tiebreak
FROM public.view_authenticated_entry_results AS entries
LEFT JOIN public.shows AS shows ON shows.id = entries.show_id;

REVOKE ALL ON public.view_authenticated_entry_results_replication FROM PUBLIC;
REVOKE ALL ON public.view_authenticated_entry_results_replication FROM anon;
REVOKE ALL ON public.view_authenticated_entry_results_replication FROM authenticated;
REVOKE ALL ON public.view_authenticated_entry_results_replication FROM service_role;
GRANT SELECT ON public.view_authenticated_entry_results_replication TO authenticated;
GRANT ALL ON public.view_authenticated_entry_results_replication TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.view_authenticated_entry_results_replication FROM authenticated;

COMMENT ON VIEW public.view_authenticated_entry_results_replication IS
  'Replication feed wrapping view_authenticated_entry_results, adding the shows join needed to replicate soft-deleted shows (MYK9-291). Owner-run (security_invoker = false) like the view it wraps; the score/payment gating is inherited from that inner view body, and the shows columns are reachable only for entries the inner view already admitted. Advisor security_definer_view ERROR accepted by design 2026-09-09 (docs/improve-audit-2026-07-11/009-advisor-disposition-sweep.md, Verdict 1). Any rebuild MUST carry WITH (security_invoker = false) inline -- CREATE OR REPLACE VIEW resets reloptions. The select list is explicit (MYK9-632): `entries.*` re-expanded on every rebuild and would have reordered the columns the moment the inner view gained one. moved_from_entry_id (MYK9-639) is appended after it. registration_confirmation_number (MYK9-659) is appended after that, so the offline receipt prints the same order reference as the online one -- guarded by the inner view''s can_view_admin alone (see that view''s comment), which is the entry''s access, not the enrollment''s. results_private (MYK9-969) is appended last and carried from the inner view, whose privacy mask already NULLed the result columns, so a replica on another exhibitor''s device never holds a private result. awaiting_registration_number (MYK9-1162) is appended after it, carried from the inner view, so a ringside device knows a held entry without reading dog_registrations. placement_tie and placement_tiebreak (MYK9-1473) are appended last, carried from the inner view where they are masked like final_placement.';

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

-- A check made before the flip existed attested to arbitrary placements for any
-- ribbon tie still unresolved. placement_tie is not part of the results
-- fingerprint, so the loop above cannot clear it when only the marker changed:
-- clear those checks here, and the Results tab asks for the coin flip first.
UPDATE public.classes c
   SET results_verified_at = NULL,
       results_verified_by = NULL,
       results_verified_fingerprint = NULL
 WHERE c.results_verified_at IS NOT NULL
   AND EXISTS (
     SELECT 1
     FROM public.entries e
     WHERE e.class_id = c.id
       AND e.deleted_at IS NULL
       AND e.placement_tie = 'unresolved');

ALTER TABLE public.classes ENABLE TRIGGER trg_notify_class_status_push;

COMMIT;

NOTIFY pgrst, 'reload schema';
