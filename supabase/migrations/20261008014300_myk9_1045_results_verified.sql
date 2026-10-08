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
--           placements that actually change (and breaks exact ties on the entry
--           id, so the same results always rank the same way);
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
--   3. public.recalculate_class_placements, rewritten to diff-write (1a).
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
--      sidestepped by a direct or replayed row write.
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
-- 3. recalculate_class_placements writes only placements that change
--
-- Copied from the latest definition (20260817120000) and changed in two ways:
--   * One UPDATE instead of clear-then-rank. Every entry of the class gets its
--     computed placement (NULL when it is not a live, scored, qualified entry,
--     which is what the old clear left on soft-deleted rows too), and a row is
--     written only when that differs from what it holds. A recompute over
--     unchanged results writes nothing: no version bump, no broadcast, no
--     results-check clear.
--   * e2.id breaks exact ties last. ROW_NUMBER() over tied keys was free to
--     order them differently on every run (a pulled dog's row moving in the
--     heap was enough), so the same results could swap two placements.
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
    UPDATE public.entries e
    SET final_placement = ranked.placement
    FROM (
      SELECT
        e2.id,
        CASE WHEN ranked_in.eligible THEN
          ROW_NUMBER() OVER (
            PARTITION BY ranked_in.eligible
            ORDER BY
              -- Nationals: most points first. Otherwise (NULL included, as the
              -- old IF/ELSE did): fewest faults first. The other key is NULL
              -- for every row, so it never reorders anything.
              CASE WHEN p_is_nationals THEN e2.points_earned END DESC NULLS LAST,
              CASE WHEN p_is_nationals IS NOT TRUE THEN e2.total_faults END ASC NULLS LAST,
              e2.search_time_seconds ASC NULLS LAST,
              e2.id ASC
          )
        END AS placement
      FROM public.entries e2
      CROSS JOIN LATERAL (
        SELECT coalesce(
          e2.is_scored = true
            AND e2.result_status = 'qualified'
            AND e2.deleted_at IS NULL,
          false
        ) AS eligible
      ) ranked_in
      WHERE e2.class_id = v_class_id
    ) ranked
    WHERE e.id = ranked.id
      AND e.final_placement IS DISTINCT FROM ranked.placement;
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
  'each supplied class, ties broken by entry id. Writes only placements that '
  'change (MYK9-1045), so a recompute over unchanged results writes nothing. '
  'Soft-deleted entries are excluded from the ranking and left unplaced.';

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
