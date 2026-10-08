-- MYK9-1045: a class's results checked against the paper score sheets.
--
-- Owner decisions: the check is stored PER CLASS (classes.results_verified_at /
-- results_verified_by), the rebuilt Results tab's Release will unlock on it
-- (that UI ships later), and a change to a scoring result clears it.
--
-- A first design (PR #2790 at ee39b058b) cleared the check from a per-row
-- entries trigger. Codex found two defects, and this migration is built around
-- both:
--
--   1. recalculate_class_placements nulled every placement in the class and
--      then wrote them back, so ANY recompute (a pull or other lifecycle-only
--      entry change in a completed class re-ranks it) wrote final_placement
--      twice per placed dog and a row-write trigger cleared the check although
--      no result had changed.
--      Fixed twice over:
--        a. recalculate_class_placements now writes, in ONE statement, only the
--           placements that actually change, so the same inputs always write
--           the same rows;
--        b. the clear does not react to row writes at all. It compares the
--           class's results FINGERPRINT now with the fingerprint stored when
--           the class was verified, and clears only when they differ.
--
--   2. Offline replay: verify succeeds, the response is lost, a correction
--      clears the check, then the queued verify replays and re-stamps results
--      nobody checked. Fixed by making the verify call carry the fingerprint
--      of the results the secretary was looking at; the RPC refuses (MK015)
--      when the class's results no longer hash to it.
--
-- The results fingerprint (private.class_results_fingerprint)
--   sha256 hex of 'myk9-class-results-v1' || E'\n' || one line per entry,
--   lines joined by E'\n' in entry-id order. An entry contributes a line only
--   when it is live (deleted_at IS NULL) AND has a result: is_scored, or a
--   result_status other than 'pending' (NULL reads as 'pending'), or a
--   placement other than 0/NULL. Withdrawn, scratched, waitlisted and pulled
--   entries without a result therefore never move it.
--   A line is these fields joined by '|' (private.entry_results_line):
--     id, is_scored ('1'/'0', NULL = '0'), result_status, search_time_seconds,
--     area1_time_seconds, area2_time_seconds, area3_time_seconds,
--     area4_time_seconds, total_correct_finds, total_incorrect_finds,
--     total_faults, no_finish_count, total_score, points_earned,
--     final_placement (0 reads as NULL: the column defaults to 0 and the
--     ranker writes NULL for "unplaced"), disqualification_reason.
--   NULL is written '\N'. Numbers are trim_scale(value)::text ('45.20' ->
--   '45.2'), which is what JavaScript's String(Number) prints for the values
--   PostgREST hands the client. Text escapes '\' as '\\', '|' as '\|' and a
--   newline as '\n', so no two different result sets share a line string.
--   Not included, deliberately: run order, check-in, ring times, judge notes,
--   video review, scoring_started/completed_at (not results); points_possible
--   (a class setting copied onto the row); and the per-area correct/incorrect/
--   fault counts, bonus/penalty points, time_over_limit and
--   time_limit_exceeded_seconds, which the client replica does not hold (so
--   the client could not fingerprint them) and which roll up into the totals,
--   time and result status that ARE included.
--   The client computes the same value from its replica:
--   apps/myk9show/src/features/show-map/classResultsFingerprint.ts. Both sides
--   are pinned to one fixture hash (that file's test and
--   supabase/tests/myk9_1045_results_verified_test.sql). Change one, change
--   both, and bump the 'v1' tag.
--
-- What this creates
--   1. classes.results_verified_at timestamptz, results_verified_by uuid
--      (auth uid of the manager who recorded it, from auth.uid(), like
--      judge_signed_off_by), results_verified_fingerprint text (internal; not
--      granted to any API role).
--   2. private.results_fp_text / private.results_fp_num /
--      private.entry_results_line / private.class_results_fingerprint.
--   3. public.recalculate_class_placements, rewritten to diff-write (1a) and
--      to honour the coin flip that decides an exact tie (owner, 2026-10-08):
--      entries.placement_tiebreak (secretary-recorded order within a tie) and
--      entries.placement_tie_unresolved (derived flag the replica can read),
--      plus public.set_class_tie_order(class, entry ids) to record a flip
--      (MK016 when the ids are not exactly one tie group). Section 3.
--   4. public.mark_class_results_verified(class, fingerprint, verified-at) and
--      public.clear_class_results_verified(class): manager-only SECURITY
--      DEFINER RPCs mirroring mark_classes_judge_signed_off /
--      clear_class_judge_sign_off (20261006154700): can_manage_trial, live
--      class (P0002), complete class for mark (55000), stale fingerprint
--      refused (MK015), first stamp kept on replay, returns the class version.
--   5. private.entries_clear_stale_results_verified + three statement-level
--      AFTER triggers on public.entries (INSERT / UPDATE / DELETE, with
--      transition tables).
--   6. private.classes_block_direct_results_verified_write: anon and
--      authenticated cannot write the three columns directly (authenticated
--      holds table-level UPDATE on classes), so the fingerprint check cannot be
--      sidestepped by a direct or replayed row write. The same guard, and a
--      flag reset, on the two entries tie columns (section 6b).
--
-- Why statement-level triggers. A per-row trigger computing a class fingerprint
-- would hash the whole class once per written row: a 100-entry bulk write would
-- read 10,000 rows. The statement trigger collects the distinct classes whose
-- result lines changed (a check-in or run-order write changes none and stops
-- there), and only for a VERIFIED class among them hashes the class once.
--
-- Concurrency. The verify RPC locks the class row FOR UPDATE and only then
-- reads the fingerprint. The entries trigger takes FOR KEY SHARE on every class
-- whose results the statement changed before it reads results_verified_at.
-- So a verify cannot commit over an uncommitted result change: either the
-- writer locked first (the verify waits for its commit and then hashes the new
-- results) or the verify locked first (the writer waits, then sees the stamp
-- and clears it if its own change moved the fingerprint). KEY SHARE conflicts
-- with nothing an ordinary class UPDATE takes, so score writers do not queue
-- behind each other on it.
--
-- Grants
--   * classes: authenticated holds a column-level SELECT allowlist (restated in
--     full below, 55 -> 57 columns: results_verified_at, results_verified_by).
--     The fingerprint column is not granted. anon's allowlist is restated
--     unchanged (51) and gets none of the three.
--   * entries: authenticated's column SELECT gains placement_tiebreak and
--     placement_tie_unresolved (57 -> 59); anon's entries allowlist stays empty.
--   * The RPCs: REVOKE from PUBLIC and anon, GRANT to authenticated.
--   * private.* functions: REVOKE from PUBLIC, anon, authenticated.
--   * recalculate_class_placements: its 20260817120000 disposition restated.
--
-- Deploy: migration only. No client reads or calls any of this yet; the
-- Results tab rebuild adds the replication select (results_verified_at/_by)
-- and the verify / clear calls. Types are owed a regeneration after the push.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS results_verified_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS results_verified_by uuid NULL
    REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS results_verified_fingerprint text NULL;

-- Foreign keys are indexed in this project (20260728140000).
CREATE INDEX IF NOT EXISTS idx_classes_results_verified_by
  ON public.classes (results_verified_by);

COMMENT ON COLUMN public.classes.results_verified_at IS
  'MYK9-1045: when a show manager checked this class''s results against the paper score sheets. NULL = not checked, or cleared because a result changed since. Written only by mark_class_results_verified / clear_class_results_verified and the entries results trigger.';
COMMENT ON COLUMN public.classes.results_verified_by IS
  'MYK9-1045: auth uid of the show manager who recorded the check, stamped server-side from auth.uid().';
-- The coin flip. placement_tiebreak: the secretary-recorded order within an
-- exact tie (1 = won), smallint because it is a small rank within one group and
-- NULL = not recorded; named for what it feeds (the placement order), not for
-- the coin, since a registry could decide a tie some other way. The tie flag is
-- derived by the recalculator (section 3) and stored so the replica holds it.
ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS placement_tiebreak smallint NULL
    CONSTRAINT entries_placement_tiebreak_positive CHECK (placement_tiebreak >= 1),
  ADD COLUMN IF NOT EXISTS placement_tie_unresolved boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.entries.placement_tiebreak IS
  'MYK9-1045: order within an exact tie on the ranking keys, as decided at the show (coin flip): 1 places first. NULL = not recorded. Written only by set_class_tie_order; read by recalculate_class_placements after the rule''s keys.';
COMMENT ON COLUMN public.entries.placement_tie_unresolved IS
  'MYK9-1045: this placed entry is in an exact tie within 1st-4th whose order has not been recorded (set_class_tie_order). Derived and written by recalculate_class_placements; false whenever the entry is unplaced.';

COMMENT ON COLUMN public.classes.results_verified_fingerprint IS
  'MYK9-1045: private.class_results_fingerprint(id) at the moment of the check. The entries trigger clears the check when the live fingerprint stops matching it. Not readable by API roles.';

-- ---------------------------------------------------------------------------
-- 2. The results fingerprint
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.results_fp_text(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(
    replace(replace(replace(p_value, '\', '\\'), '|', '\|'), E'\n', '\n'),
    '\N'
  );
$$;

CREATE OR REPLACE FUNCTION private.results_fp_num(p_value numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(trim_scale(p_value)::text, '\N');
$$;

CREATE OR REPLACE FUNCTION private.entry_results_line(e public.entries)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN e.deleted_at IS NOT NULL THEN NULL
    WHEN NOT (
      coalesce(e.is_scored, false)
      OR coalesce(e.result_status, 'pending') <> 'pending'
      OR coalesce(e.final_placement, 0) <> 0
    ) THEN NULL
    ELSE concat_ws('|',
      e.id::text,
      CASE WHEN coalesce(e.is_scored, false) THEN '1' ELSE '0' END,
      private.results_fp_text(e.result_status),
      private.results_fp_num(e.search_time_seconds),
      private.results_fp_num(e.area1_time_seconds),
      private.results_fp_num(e.area2_time_seconds),
      private.results_fp_num(e.area3_time_seconds),
      private.results_fp_num(e.area4_time_seconds),
      private.results_fp_num(e.total_correct_finds),
      private.results_fp_num(e.total_incorrect_finds),
      private.results_fp_num(e.total_faults),
      private.results_fp_num(e.no_finish_count),
      private.results_fp_num(e.total_score),
      private.results_fp_num(e.points_earned),
      private.results_fp_num(nullif(e.final_placement, 0)),
      private.results_fp_text(e.disqualification_reason)
    )
  END;
$$;

COMMENT ON FUNCTION private.entry_results_line(public.entries) IS
  'MYK9-1045: one entry''s scoring results as the canonical line the class results fingerprint hashes; NULL when the entry is soft-deleted or has no result. Mirrored by apps/myk9show/src/features/show-map/classResultsFingerprint.ts.';

CREATE OR REPLACE FUNCTION private.class_results_fingerprint(p_class_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT encode(
    sha256(convert_to(
      'myk9-class-results-v1' || E'\n' || coalesce(string_agg(r.line, E'\n' ORDER BY r.id), ''),
      'UTF8'
    )),
    'hex'
  )
  FROM (
    SELECT e.id, private.entry_results_line(e) AS line
    FROM public.entries e
    WHERE e.class_id = p_class_id
  ) r
  WHERE r.line IS NOT NULL;
$$;

COMMENT ON FUNCTION private.class_results_fingerprint(uuid) IS
  'MYK9-1045: sha256 hex over the class''s live, resulted entries (private.entry_results_line, entry-id order). Equal fingerprints = the same results.';

REVOKE ALL ON FUNCTION private.results_fp_text(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.results_fp_num(numeric) FROM PUBLIC, anon, authenticated;
-- Named without its argument list (the name is unique): the anon grant
-- contract (anonEntriesGrantContract.test.ts) reads any REVOKE whose text names
-- public.entries as a table revoke.
REVOKE ALL ON FUNCTION private.entry_results_line FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.class_results_fingerprint(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Placements: diff-written, with the secretary's recorded tie order
--
-- recalculate_class_placements is copied from the latest definition
-- (20260817120000) and changed in three ways:
--   * One UPDATE instead of clear-then-rank. Every entry of the class gets its
--     computed placement (NULL unless it is a live, scored, qualified entry,
--     which is what the old clear left on soft-deleted rows too), and a row is
--     written only when its placement or tie flag differs from what it holds.
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
-- How an UNRESOLVED tie is placed: as before, the tied dogs get consecutive,
-- distinct placements (ROW_NUMBER, not RANK). Before this change their order
-- was whatever the scan returned; it is now stable, and every member of the
-- group carries placement_tie_unresolved = true so the secretary is told to
-- record the flip. A group is unresolved when it has two or more placed
-- entries tied on all ranking keys, at least one member has no tiebreak (or
-- two share one), and its best placement is within the awarded placements
-- (1st-4th, the range the catalog prints: catalogFields.ts). A tie for 5th
-- and below decides nothing and is not flagged.
--
-- The flag is a stored column so the client replica can read it offline with
-- the rest of the entry row (a STABLE function would be online-only). The
-- recalculator is its only writer; a trigger (section 6b) drops it whenever
-- anything else unplaces the row (refresh_class_scoring_state's in-progress,
-- upcoming and tombstone clears), so a flag never outlives its placement.
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
        END AS placement,
        count(*) OVER tie_group AS tie_size,
        count(k.placement_tiebreak) OVER tie_group AS tiebreaks_set,
        count(*) OVER (
          PARTITION BY k.eligible, k.points_key, k.faults_key, k.time_key, k.placement_tiebreak
        ) AS same_tiebreak
      FROM keyed k
      WINDOW tie_group AS (PARTITION BY k.eligible, k.points_key, k.faults_key, k.time_key)
    ),
    flagged AS (
      SELECT
        r.id,
        r.placement,
        coalesce(
          r.eligible
            AND r.tie_size > 1
            AND (
              r.tiebreaks_set < r.tie_size
              OR bool_or(r.placement_tiebreak IS NOT NULL AND r.same_tiebreak > 1)
                   OVER (PARTITION BY r.eligible, r.points_key, r.faults_key, r.time_key)
            )
            AND min(r.placement)
                  OVER (PARTITION BY r.eligible, r.points_key, r.faults_key, r.time_key) <= 4,
          false
        ) AS tie_unresolved
      FROM ranked r
    )
    UPDATE public.entries e
       SET final_placement = f.placement,
           placement_tie_unresolved = f.tie_unresolved
      FROM flagged f
     WHERE e.id = f.id
       AND (e.final_placement IS DISTINCT FROM f.placement
            OR e.placement_tie_unresolved IS DISTINCT FROM f.tie_unresolved);
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
  'order (placement_tiebreak), then entry id only for a stable write. Flags an '
  'unresolved exact tie within 1st-4th (placement_tie_unresolved). Writes only '
  'rows that change (MYK9-1045). Soft-deleted entries are left unplaced.';

-- ---------------------------------------------------------------------------
-- 3b. Record a coin flip: set_class_tie_order(class, entry ids in order)
--
-- The ids must be exactly one tie group: every live, scored, qualified entry
-- of the class with the same ranking keys, all of them and nothing else (an
-- order over part of a group, or over dogs that are not tied, is refused with
-- MK016). They get placement_tiebreak 1..n in the order given, then the class
-- is re-derived through refresh_class_scoring_state, which re-ranks a derived,
-- complete class. A manually completed class keeps its pinned placements (the
-- rollup never re-ranks those); the order is stored and applies if the class
-- is derived again. A changed placement clears a results check through the
-- fingerprint like any other result change.
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

  PERFORM 1 FROM public.entries e
  WHERE e.class_id = p_class_id
  ORDER BY e.id
  FOR UPDATE;

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
  'MYK9-1045: record the coin flip that decides an exact tie. p_entry_ids must be the whole tie group (every placed-eligible entry of the class with the same ranking keys), in finishing order; refused with MK016 otherwise. Show managers only (can_manage_trial). Re-derives the class. Returns the class version.';

REVOKE ALL ON FUNCTION public.set_class_tie_order(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_class_tie_order(uuid, uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4a. Mark one class verified
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
  'MYK9-1045: record that a completed class''s results were checked against the paper. Show managers only (can_manage_trial). p_results_fingerprint is the fingerprint of the results the manager looked at (classResultsFingerprint.ts); refused with MK015 when the class''s results no longer match it. Keeps an existing stamp. Returns the class''s new version.';

REVOKE ALL ON FUNCTION public.mark_class_results_verified(uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_class_results_verified(uuid, text, timestamptz) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4b. Clear one class
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clear_class_results_verified(p_class_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_trial_id uuid;
  v_version integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to change whether results were checked.' USING ERRCODE = '42501';
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

  UPDATE public.classes c
     SET results_verified_at = NULL,
         results_verified_by = NULL,
         results_verified_fingerprint = NULL
   WHERE c.id = p_class_id
     AND (c.results_verified_at IS NOT NULL
          OR c.results_verified_by IS NOT NULL
          OR c.results_verified_fingerprint IS NOT NULL);

  SELECT c.version INTO v_version FROM public.classes c WHERE c.id = p_class_id;
  RETURN v_version;
END;
$$;

COMMENT ON FUNCTION public.clear_class_results_verified(uuid) IS
  'MYK9-1045: undo the results check on one class. Show managers only (can_manage_trial). Returns the class''s new version.';

REVOKE ALL ON FUNCTION public.clear_class_results_verified(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_class_results_verified(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. A changed result clears the check
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.entries_clear_stale_results_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_class_ids uuid[];
BEGIN
  -- The classes whose result lines this statement changed. A class move or a
  -- soft-delete/restore of a resulted entry changes two classes' line sets.
  IF TG_OP = 'INSERT' THEN
    SELECT array_agg(DISTINCT n.class_id)
      INTO v_class_ids
    FROM new_rows n
    WHERE n.class_id IS NOT NULL
      AND private.entry_results_line(n) IS NOT NULL;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT array_agg(DISTINCT o.class_id)
      INTO v_class_ids
    FROM old_rows o
    WHERE o.class_id IS NOT NULL
      AND private.entry_results_line(o) IS NOT NULL;
  ELSE
    SELECT array_agg(DISTINCT v.class_id)
      INTO v_class_ids
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
  'MYK9-1045: statement-level entries trigger. Clears a verified class''s results check when its results fingerprint no longer matches the one stored at the check. Hashes only verified classes whose result lines the statement changed.';

REVOKE ALL ON FUNCTION private.entries_clear_stale_results_verified() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS entries_clear_stale_results_verified_insert ON public.entries;
CREATE TRIGGER entries_clear_stale_results_verified_insert
  AFTER INSERT ON public.entries
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION private.entries_clear_stale_results_verified();

DROP TRIGGER IF EXISTS entries_clear_stale_results_verified_update ON public.entries;
CREATE TRIGGER entries_clear_stale_results_verified_update
  AFTER UPDATE ON public.entries
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION private.entries_clear_stale_results_verified();

DROP TRIGGER IF EXISTS entries_clear_stale_results_verified_delete ON public.entries;
CREATE TRIGGER entries_clear_stale_results_verified_delete
  AFTER DELETE ON public.entries
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION private.entries_clear_stale_results_verified();

-- ---------------------------------------------------------------------------
-- 6. No direct writes to the three columns from API roles
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.classes_block_direct_results_verified_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Whether results were checked can only be changed by mark_class_results_verified and clear_class_results_verified.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.classes_block_direct_results_verified_write() IS
  'MYK9-1045: refuses anon/authenticated writes to classes.results_verified_*; the SECURITY DEFINER RPCs and the entries trigger run as their owner and pass.';

REVOKE ALL ON FUNCTION private.classes_block_direct_results_verified_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_00_block_direct_results_verified_write ON public.classes;
CREATE TRIGGER trg_00_block_direct_results_verified_write
  BEFORE UPDATE OF results_verified_at, results_verified_by, results_verified_fingerprint
  ON public.classes
  FOR EACH ROW
  WHEN (OLD.results_verified_at IS DISTINCT FROM NEW.results_verified_at
        OR OLD.results_verified_by IS DISTINCT FROM NEW.results_verified_by
        OR OLD.results_verified_fingerprint IS DISTINCT FROM NEW.results_verified_fingerprint)
  EXECUTE FUNCTION private.classes_block_direct_results_verified_write();

DROP TRIGGER IF EXISTS trg_00_block_direct_results_verified_insert ON public.classes;
CREATE TRIGGER trg_00_block_direct_results_verified_insert
  BEFORE INSERT ON public.classes
  FOR EACH ROW
  WHEN (NEW.results_verified_at IS NOT NULL
        OR NEW.results_verified_by IS NOT NULL
        OR NEW.results_verified_fingerprint IS NOT NULL)
  EXECUTE FUNCTION private.classes_block_direct_results_verified_write();

-- ---------------------------------------------------------------------------
-- 6b. entries: the tie columns are server-written, and the flag never
--     outlives its placement
--
-- authenticated holds table-level INSERT/UPDATE on entries, so without the
-- guard a direct or replayed row write could set a tiebreak that skipped
-- set_class_tie_order's whole-group check, or a stale flag. The guard sorts
-- before the flag reset (trg_00_ < trg_zz_), so it judges the caller's own
-- NEW row, and the reset's own change to the flag is never mistaken for one.
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
  'MYK9-1045: refuses anon/authenticated writes to entries.placement_tiebreak / placement_tie_unresolved; set_class_tie_order and the recalculator run as their owner and pass.';

REVOKE ALL ON FUNCTION private.entries_block_direct_tie_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_00_block_direct_placement_tie_write ON public.entries;
CREATE TRIGGER trg_00_block_direct_placement_tie_write
  BEFORE UPDATE ON public.entries
  FOR EACH ROW
  WHEN (OLD.placement_tiebreak IS DISTINCT FROM NEW.placement_tiebreak
        OR OLD.placement_tie_unresolved IS DISTINCT FROM NEW.placement_tie_unresolved)
  EXECUTE FUNCTION private.entries_block_direct_tie_write();

DROP TRIGGER IF EXISTS trg_00_block_direct_placement_tie_insert ON public.entries;
CREATE TRIGGER trg_00_block_direct_placement_tie_insert
  BEFORE INSERT ON public.entries
  FOR EACH ROW
  WHEN (NEW.placement_tiebreak IS NOT NULL OR NEW.placement_tie_unresolved)
  EXECUTE FUNCTION private.entries_block_direct_tie_write();

CREATE OR REPLACE FUNCTION private.entries_unplaced_clears_tie_flag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.placement_tie_unresolved := false;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.entries_unplaced_clears_tie_flag() IS
  'MYK9-1045: an entry that loses its placement (refresh_class_scoring_state''s clears, a manual edit) is no longer in an unresolved tie.';

REVOKE ALL ON FUNCTION private.entries_unplaced_clears_tie_flag() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_zz_entries_unplaced_clears_tie_flag ON public.entries;
CREATE TRIGGER trg_zz_entries_unplaced_clears_tie_flag
  BEFORE UPDATE ON public.entries
  FOR EACH ROW
  WHEN (NEW.final_placement IS NULL AND NEW.placement_tie_unresolved)
  EXECUTE FUNCTION private.entries_unplaced_clears_tie_flag();

-- Column grants, stated rather than inherited (as 20261001034700 did):
-- authenticated reads both (the replica needs the flag offline, and the order
-- the secretary recorded); anon reads no entries column (allowlist empty).
GRANT SELECT (placement_tiebreak, placement_tie_unresolved) ON public.entries TO authenticated;
REVOKE ALL (placement_tiebreak, placement_tie_unresolved) ON public.entries FROM anon;

-- ---------------------------------------------------------------------------
-- 7. authenticated may read results_verified_at / _by (anon unchanged)
-- ---------------------------------------------------------------------------
GRANT SELECT (
  id, trial_id, name, description, level, element, section, competition_type,
  entry_fee, max_entries, allow_waitlist, max_dogs_per_handler,
  breed_restrictions, jump_heights, age_min, age_max, height_min, height_max,
  handler_age_min, handler_age_max, start_time, estimated_duration,
  actual_start_time, actual_end_time, status, time_limit_seconds, num_areas,
  has_blank, max_faults, qualifying_threshold, is_scoring_finalized,
  results_released_at, dogs_ahead_notification_count, total_entries_count,
  checked_in_count, scored_count, created_at, updated_at, deleted_at,
  deleted_by, class_number, timer_mode, hides_known, distraction_count,
  is_results_reviewed, time_limit_area2_seconds,
  time_limit_area3_seconds, display_order, results_released_by, version,
  status_source, reopened_after_closeout_at, revised_expected_start,
  judge_signed_off_at, judge_signed_off_by, results_verified_at,
  results_verified_by
) ON public.classes TO authenticated;

-- anon's decision, stated: the 20261006154700 allowlist, restated unchanged and
-- WITHOUT any results_verified_* column. anon holds no table-level privilege on
-- classes, so the new columns stay unreadable to it.
GRANT SELECT (
  id, trial_id, name, description, level, element, section, competition_type,
  entry_fee, max_entries, allow_waitlist, max_dogs_per_handler,
  breed_restrictions, jump_heights, age_min, age_max, height_min, height_max,
  handler_age_min, handler_age_max, start_time, estimated_duration,
  actual_start_time, actual_end_time, status, time_limit_seconds, num_areas,
  max_faults, qualifying_threshold, is_scoring_finalized, results_released_at,
  dogs_ahead_notification_count, total_entries_count, checked_in_count,
  scored_count, created_at, updated_at, deleted_at, deleted_by, class_number,
  timer_mode, distraction_count, is_results_reviewed,
  time_limit_area2_seconds, time_limit_area3_seconds, display_order,
  results_released_by, version, status_source, reopened_after_closeout_at,
  revised_expected_start
) ON public.classes TO anon;

COMMIT;

NOTIFY pgrst, 'reload schema';
