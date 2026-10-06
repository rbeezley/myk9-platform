-- MYK9-1030: record the judge's end-of-day sign-off on the marked catalog.
--
-- The class wrap-up status read entries.judge_signature /
-- judge_signature_timestamp, but nothing in apps/, packages/ or the edge
-- functions writes either column (live 2026-10-06: 0 of 113 entries signed),
-- so every completed class read "Needs judge's initials" forever.
--
-- How it really happens (owner): a judge verifies and initials the result
-- catalog at the END OF THE DAY, for every class they judged that day. The
-- record is therefore stored PER CLASS (so a judge who leaves early, or a class
-- added late, still has somewhere to live and a class's status needs no join)
-- and written for a whole judge-day in one call.
--
-- What this creates
--   1. classes.judge_signed_off_at timestamptz and classes.judge_signed_off_by
--      uuid. _by follows the other *_by columns on classes (results_released_by,
--      deleted_by): the AUTH uid of the person who recorded it, stamped from
--      auth.uid() by the server, never a people.id (people.id never equals
--      auth.uid()). It names the secretary who recorded the sign-off; the judge
--      is the class's confirmed judge_assignments row.
--   2. public.mark_classes_judge_signed_off(class ids, signed-off-at): stamps
--      every listed class. All-or-nothing: it refuses the whole call when any
--      class is missing or soft-deleted (P0002), not manageable by the caller
--      (42501), or not complete (55000).
--   3. public.clear_class_judge_sign_off(class id): the per-class undo.
--
-- Authorization is can_manage_trial(trial_id), the SAME helper the classes
-- UPDATE policy (classes_update) uses for every other class write, checked live
-- 2026-10-06. Both functions are SECURITY DEFINER with search_path = '', so
-- they restate what RLS would have applied: the class row must exist and be
-- live (deleted_at IS NULL, which classes_select applies), and the caller must
-- manage its trial.
--
-- "Complete" is classes.status = 'completed': the server's derivation
-- (refresh_class_scoring_state) writes it once every expected entry is
-- accounted for, and a secretary's Mark Complete writes it by hand.
--
-- The offline queue sends ONE class per call (one queued mutation per class,
-- like Release), so a one-class call returns that class's new version and the
-- replica's OCC token stays fresh, as ringside_update_entry does. A multi-class
-- call returns NULL. A class already signed off keeps its first stamp, so an
-- offline replay or a second press is a no-op.
--
-- Also here (owner, 2026-10-06, one push): "results checked against the paper
-- score sheets".
--   4. classes.results_verified_at timestamptz / results_verified_by uuid, same
--      identity convention (auth uid of whoever recorded it, from auth.uid()).
--   5. public.set_class_results_verified(class id, verified, verified-at):
--      marks one class verified (refused unless complete, 55000) or clears it
--      (always allowed: a correction after checking means re-check). Same
--      can_manage_trial authz. Server-side release and the automatic release
--      presets are NOT gated on it. OPEN QUESTION (no trigger yet): should a
--      score change after verification clear it automatically?

-- Grants
--   * classes: authenticated holds a column-level SELECT allowlist
--     (20260731170000, restated by 20260912234500). A new column is NOT in it,
--     so without the grant below every replication read naming the columns
--     fails 42501. Restated in full, the same way 20260912234500 did, so the
--     latest GRANT in this directory is the whole list. anon gets nothing new:
--     a sign-off is staff paperwork, and no anon reader selects it.
--   * authenticated already holds table-level UPDATE on classes, which covers
--     new columns; the classes_update policy keeps direct writes to managers.
--     The app writes only through the RPCs.
--   * The functions: REVOKE from PUBLIC and anon, GRANT to authenticated.
--
-- Deploy order: this migration, then the site (the replication select names
-- the new columns). Types in packages/supabase are hand-written to match and
-- are owed a regeneration after the push.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS judge_signed_off_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS judge_signed_off_by uuid NULL
    REFERENCES auth.users (id) ON DELETE SET NULL;

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS results_verified_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS results_verified_by uuid NULL
    REFERENCES auth.users (id) ON DELETE SET NULL;

-- Foreign keys are indexed in this project (20260728140000).
CREATE INDEX IF NOT EXISTS idx_classes_judge_signed_off_by
  ON public.classes (judge_signed_off_by);
CREATE INDEX IF NOT EXISTS idx_classes_results_verified_by
  ON public.classes (results_verified_by);

COMMENT ON COLUMN public.classes.judge_signed_off_at IS
  'MYK9-1030: when the class''s judge initialed (AKC) or signed (UKC, ASCA) the marked catalog for this class. Recorded for a whole judge-day at once by mark_classes_judge_signed_off; NULL = not yet.';
COMMENT ON COLUMN public.classes.judge_signed_off_by IS
  'MYK9-1030: auth uid of the person who RECORDED the sign-off (a show manager), stamped server-side from auth.uid(). Not the judge: the judge is the class''s confirmed judge_assignments row.';

COMMENT ON COLUMN public.classes.results_verified_at IS
  'MYK9-1030: when a show manager checked this class''s results against the paper score sheets. NULL = not checked (or cleared for a re-check). Written by set_class_results_verified. Does not gate release.';
COMMENT ON COLUMN public.classes.results_verified_by IS
  'MYK9-1030: auth uid of the show manager who recorded the check, stamped server-side from auth.uid().';

-- ---------------------------------------------------------------------------
-- 2. Mark a set of classes signed off
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_classes_judge_signed_off(
  p_class_ids uuid[],
  p_signed_off_at timestamptz DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ids uuid[];
  v_at timestamptz;
  v_found integer;
  v_class record;
  v_version integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to record a judge''s sign-off.' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg(DISTINCT id), '{}')
    INTO v_ids
  FROM unnest(coalesce(p_class_ids, '{}'::uuid[])) AS id
  WHERE id IS NOT NULL;

  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'No classes were given to sign off.' USING ERRCODE = '22023';
  END IF;
  IF cardinality(v_ids) > 200 THEN
    RAISE EXCEPTION 'Too many classes in one sign-off (% given, 200 allowed).', cardinality(v_ids)
      USING ERRCODE = '22023';
  END IF;

  -- The moment the secretary pressed it (an offline press syncs later), but
  -- never in the future.
  v_at := least(coalesce(p_signed_off_at, now()), now());

  -- Lock in id order so two concurrent sign-offs over overlapping days cannot
  -- deadlock, and so the checks below read the rows the UPDATE will write.
  PERFORM 1 FROM public.classes c WHERE c.id = ANY (v_ids) ORDER BY c.id FOR UPDATE;

  SELECT count(*) INTO v_found
  FROM public.classes c
  WHERE c.id = ANY (v_ids) AND c.deleted_at IS NULL;
  IF v_found <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'One or more of these classes no longer exists.' USING ERRCODE = 'P0002';
  END IF;

  FOR v_class IN
    SELECT c.id, c.trial_id, c.name, c.status
    FROM public.classes c
    WHERE c.id = ANY (v_ids)
    ORDER BY c.id
  LOOP
    IF NOT coalesce((SELECT public.can_manage_trial(v_class.trial_id)), false) THEN
      RAISE EXCEPTION 'You do not manage the show this class belongs to.' USING ERRCODE = '42501';
    END IF;
    IF v_class.status IS DISTINCT FROM 'completed' THEN
      RAISE EXCEPTION '% is not complete yet, so its judge cannot sign it off.', v_class.name
        USING ERRCODE = '55000';
    END IF;
  END LOOP;

  UPDATE public.classes c
     SET judge_signed_off_at = v_at,
         judge_signed_off_by = v_uid
   WHERE c.id = ANY (v_ids)
     AND c.judge_signed_off_at IS NULL;

  IF cardinality(v_ids) = 1 THEN
    SELECT c.version INTO v_version FROM public.classes c WHERE c.id = v_ids[1];
    RETURN v_version;
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.mark_classes_judge_signed_off(uuid[], timestamptz) IS
  'MYK9-1030: record the judge''s end-of-day sign-off on every listed class. Show managers only (can_manage_trial); every class must be live and completed, or nothing is written. Keeps an existing stamp. Returns the class''s new version for a one-class call (the offline queue''s OCC token), NULL otherwise.';

REVOKE ALL ON FUNCTION public.mark_classes_judge_signed_off(uuid[], timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_classes_judge_signed_off(uuid[], timestamptz) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Clear one class (per-class undo)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clear_class_judge_sign_off(p_class_id uuid)
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
    RAISE EXCEPTION 'Sign in to change a judge''s sign-off.' USING ERRCODE = '42501';
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
     SET judge_signed_off_at = NULL,
         judge_signed_off_by = NULL
   WHERE c.id = p_class_id
     AND c.judge_signed_off_at IS NOT NULL;

  SELECT c.version INTO v_version FROM public.classes c WHERE c.id = p_class_id;
  RETURN v_version;
END;
$$;

COMMENT ON FUNCTION public.clear_class_judge_sign_off(uuid) IS
  'MYK9-1030: undo the judge''s sign-off on one class. Show managers only (can_manage_trial). Returns the class''s new version.';

REVOKE ALL ON FUNCTION public.clear_class_judge_sign_off(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_class_judge_sign_off(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3b. Results checked against the paper score sheets (one class)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_class_results_verified(
  p_class_id uuid,
  p_verified boolean,
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
  v_version integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to record a results check.' USING ERRCODE = '42501';
  END IF;
  IF p_verified IS NULL THEN
    RAISE EXCEPTION 'Say whether the results were checked.' USING ERRCODE = '22023';
  END IF;

  SELECT c.id, c.trial_id, c.name, c.status INTO v_class
  FROM public.classes c
  WHERE c.id = p_class_id AND c.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That class no longer exists.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT coalesce((SELECT public.can_manage_trial(v_class.trial_id)), false) THEN
    RAISE EXCEPTION 'You do not manage the show this class belongs to.' USING ERRCODE = '42501';
  END IF;

  IF p_verified THEN
    IF v_class.status IS DISTINCT FROM 'completed' THEN
      RAISE EXCEPTION '% is not complete yet, so its results cannot be checked.', v_class.name
        USING ERRCODE = '55000';
    END IF;
    -- Keeps the first stamp: an offline replay or a second press is a no-op.
    UPDATE public.classes c
       SET results_verified_at = least(coalesce(p_verified_at, now()), now()),
           results_verified_by = v_uid
     WHERE c.id = p_class_id
       AND c.results_verified_at IS NULL;
  ELSE
    UPDATE public.classes c
       SET results_verified_at = NULL,
           results_verified_by = NULL
     WHERE c.id = p_class_id
       AND c.results_verified_at IS NOT NULL;
  END IF;

  SELECT c.version INTO v_version FROM public.classes c WHERE c.id = p_class_id;
  RETURN v_version;
END;
$$;

COMMENT ON FUNCTION public.set_class_results_verified(uuid, boolean, timestamptz) IS
  'MYK9-1030: record (p_verified = true; class must be completed) or clear (false) that a class''s results were checked against the paper score sheets. Show managers only (can_manage_trial). Keeps an existing stamp. Returns the class''s new version. Does not gate release.';

REVOKE ALL ON FUNCTION public.set_class_results_verified(uuid, boolean, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_class_results_verified(uuid, boolean, timestamptz) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. authenticated may read the new columns (anon unchanged)
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

-- anon's decision, stated: the 20260912234500 allowlist, restated unchanged
-- and WITHOUT the new columns (a pure no-op on the ACL, as that
-- migration's own restatement was). anon holds no table-level privilege on
-- classes (live relacl 2026-10-06: postgres, authenticated=awd, service_role),
-- so the new columns stay unreadable to it. The allowlist contract tests read
-- the latest anon GRANT in this directory, so this is the current list.
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
