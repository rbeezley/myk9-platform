-- =============================================================================
-- MYK9-1969 (part 1 of MYK9-1943): the server decides when a place in line may be shown
-- =============================================================================
-- Owner design 2026-11-13. A place in line is the dogs ahead in the running order that
-- are not scored, not in the ring and not pulled. On a class judged on paper nobody
-- records progress as it runs, so the place goes stale and then jumps when a batch of
-- scores is keyed in. The server now says WHETHER the place may be shown as a live claim:
--
--   claim_state  live   the place is a live claim (phone-scored class, recent activity)
--                paper  the class is scored on paper: position in the running order
--                       only, never a countdown
--                stale  phone class, in progress, dogs still to run, and nothing scored
--                       or put in the ring for 10 minutes ("may be out of date")
--
-- DATA SHAPE
--   * Show switch (MYK9-1685): shows.uses_device_scoring, default true.
--   * New classes.scores_on_paper boolean, NULL = follow the default. A per-class flag,
--     not a judge column: judge_assignments is a column-granted table and a class can be
--     switched on the day. Whoever assigns a judge writes the judge's choice here.
--   * Paper for a class = scores_on_paper, else ring_phase = 'offline_scoring'
--     (MYK9-1513: the ringside already says "on paper"; no third way), else NOT
--     uses_device_scoring. ring_phase alone is not enough: it is one of three phases
--     (a Break would replace it) and the paper decision is needed before the class starts.
--   * private.class_ring_activity: when a score or in-ring mark last landed in a class,
--     kept by a trigger on entries. Not a classes column, so a mark never bumps
--     classes.version / updated_at or re-syncs every class.
--
-- REPLACED FROM THEIR LATEST DEFINITIONS (20261103014700_myk9_1578): the three functions
-- below. A RETURNS TABLE change needs DROP + CREATE, so every COMMENT, GRANT and REVOKE
-- is restated; who can call and read each is unchanged.
-- =============================================================================

BEGIN;

ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS scores_on_paper boolean;

COMMENT ON COLUMN public.classes.scores_on_paper IS
  'MYK9-1969: true = judged on paper, false = scored on devices, NULL = follow ring_phase offline_scoring, then NOT shows.uses_device_scoring.';

-- classes is read through a column allowlist: the latest authenticated list
-- (20261030174300) with scores_on_paper added. anon is unchanged (staff-facing).
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
  results_verified_by, ring_phase, ring_phase_time, scores_on_paper
) ON public.classes TO authenticated;

-- anon's decision, stated: the 20261030174300 anon allowlist restated unchanged and
-- WITHOUT scores_on_paper (staff-facing; anon holds no table-level privilege).
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

-- ---------------------------------------------------------------------------
-- The 10-minute limit, the one named constant.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.ring_claim_stale_after()
RETURNS interval
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT interval '10 minutes' $$;

REVOKE ALL ON FUNCTION private.ring_claim_stale_after() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Last score / in-ring activity per class
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS private.class_ring_activity (
  class_id uuid PRIMARY KEY REFERENCES public.classes (id) ON DELETE CASCADE,
  last_activity_at timestamptz NOT NULL
);

COMMENT ON TABLE private.class_ring_activity IS
  'MYK9-1969: when a score or in-ring mark last landed in each class. Written by trg_entries_record_ring_activity; read by entry_queue_places_for_classes.';

ALTER TABLE private.class_ring_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.class_ring_activity FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.entries_record_ring_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  INSERT INTO private.class_ring_activity (class_id, last_activity_at)
  VALUES (NEW.class_id, now())
  ON CONFLICT (class_id) DO UPDATE SET last_activity_at = EXCLUDED.last_activity_at;
  RETURN NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION private.entries_record_ring_activity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_entries_record_ring_activity ON public.entries;
DROP TRIGGER IF EXISTS trg_entries_record_ring_activity_ins ON public.entries;
-- WHEN cannot read TG_OP, so insert and update are two triggers.
CREATE TRIGGER trg_entries_record_ring_activity_ins
  AFTER INSERT ON public.entries
  FOR EACH ROW
  WHEN (NEW.class_id IS NOT NULL
        AND (COALESCE(NEW.is_scored, false)
             OR COALESCE(NEW.is_in_ring, false)
             OR NEW.check_in_status = 'in-ring'))
  EXECUTE FUNCTION private.entries_record_ring_activity();

CREATE TRIGGER trg_entries_record_ring_activity
  AFTER UPDATE OF is_scored, is_in_ring, check_in_status ON public.entries
  FOR EACH ROW
  WHEN (NEW.class_id IS NOT NULL
        AND (COALESCE(NEW.is_scored, false)
             OR COALESCE(NEW.is_in_ring, false)
             OR NEW.check_in_status = 'in-ring')
        AND (COALESCE(NEW.is_scored, false) IS DISTINCT FROM COALESCE(OLD.is_scored, false)
             OR COALESCE(NEW.is_in_ring, false) IS DISTINCT FROM COALESCE(OLD.is_in_ring, false)
             OR NEW.check_in_status IS DISTINCT FROM OLD.check_in_status))
  EXECUTE FUNCTION private.entries_record_ring_activity();

-- ---------------------------------------------------------------------------
-- entry_queue_places_for_classes: + claim_state (internal; ACL unchanged)
-- Body copied from 20261103014700; only the class join and claim_state are new.
-- A row exists only for a waiting dog, so "dogs still to run" holds for every row.
-- ---------------------------------------------------------------------------
DROP FUNCTION public.get_my_entry_queue_places(uuid[]);
DROP FUNCTION public.show_dogs_limited_view(uuid, integer, integer);
DROP FUNCTION public.entry_queue_places_for_classes(uuid[]);

CREATE FUNCTION public.entry_queue_places_for_classes(p_class_ids uuid[])
RETURNS TABLE (entry_id uuid, place integer, claim_state text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT w.id AS entry_id,
         w.place,
         CASE
           WHEN cs.on_paper THEN 'paper'
           WHEN cs.status = 'in_progress'
                AND cs.last_activity < now() - private.ring_claim_stale_after() THEN 'stale'
           ELSE 'live'
         END AS claim_state
    FROM (
      SELECT q.id,
             q.class_id,
             q.run_order,
             row_number() OVER (
               PARTITION BY q.class_id
               ORDER BY q.sort_key, q.armband_key, q.id
             )::integer AS place
        FROM (
          SELECT e.id,
                 e.class_id,
                 e.run_order,
                 a.armband_key,
                 coalesce(nullif(e.run_order, 0)::numeric, a.armband_key) AS sort_key
            FROM public.entries e
            -- parseInt semantics: leading whitespace, optional sign, digits; else 0
            CROSS JOIN LATERAL (
              SELECT coalesce(substring(e.armband FROM '^\s*([+-]?[0-9]+)')::numeric, 0) AS armband_key
            ) a
           WHERE e.class_id = ANY (p_class_ids)
             -- runnable (isRunnableEntry)
             AND e.deleted_at IS NULL
             AND lower(btrim(coalesce(e.entry_status, ''))) NOT IN
                 ('withdrawn', 'scratched', 'absent', 'moved', 'not_accepted')
             AND lower(btrim(coalesce(e.check_in_status, ''))) <> 'pulled'
             AND NOT coalesce(e.is_scored, false)
             AND lower(btrim(coalesce(e.result_status, ''))) NOT IN ('absent', 'excused', 'disqualified')
             -- still to run (isInQueue's allowlist, check-in axis)
             AND coalesce(e.check_in_status, 'no-status') IN
                 ('no-status', 'checked-in', 'at-gate', 'come-to-gate', 'conflict', 'in-ring')
             -- the in-ring dog is not in the waiting queue (runQueue INTENT)
             AND NOT coalesce(e.is_in_ring, false)
             AND coalesce(e.check_in_status, '') <> 'in-ring'
        ) q
    ) w
    JOIN LATERAL (
      SELECT c.status,
             coalesce(
               c.scores_on_paper,
               CASE WHEN c.ring_phase = 'offline_scoring' THEN true END,
               NOT s.uses_device_scoring,
               false
             ) AS on_paper,
             -- no activity yet: the class's own last change (it went in progress)
             coalesce(ra.last_activity_at, c.updated_at) AS last_activity
        FROM public.classes c
        LEFT JOIN public.trials t ON t.id = c.trial_id
        LEFT JOIN public.shows s ON s.id = t.show_id
        LEFT JOIN private.class_ring_activity ra ON ra.class_id = c.id
       WHERE c.id = w.class_id
    ) cs ON true
   -- a dog with no run order set has no place yet, though it holds a slot in the count
   WHERE coalesce(w.run_order, 0) <> 0;
$$;

COMMENT ON FUNCTION public.entry_queue_places_for_classes(uuid[]) IS
  'MYK9-1578 / MYK9-1969: internal. 1-based place in the ringside waiting queue for every waiting entry of the given classes with a run order set, plus claim_state (live | paper | stale). The one rule behind get_my_entry_queue_places and show_dogs_limited_view. Not callable from the API: it returns any entry''s id.';

REVOKE ALL ON FUNCTION public.entry_queue_places_for_classes(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.entry_queue_places_for_classes(uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.entry_queue_places_for_classes(uuid[]) FROM authenticated;

-- ---------------------------------------------------------------------------
-- get_my_entry_queue_places: + claim_state (ACL restated, unchanged)
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.get_my_entry_queue_places(p_entry_ids uuid[])
RETURNS TABLE (entry_id uuid, place integer, claim_state text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH me AS (
    SELECT p.id AS person_id
      FROM public.people p
     WHERE p.auth_user_id = (SELECT auth.uid())
  ),
  -- The caller's own entries among the request, capped so one call cannot
  -- fan out over a whole show's classes.
  mine AS (
    SELECT e.id, e.class_id, e.run_order
      FROM public.entries e
     WHERE e.id = ANY (p_entry_ids[1:200])
       AND e.deleted_at IS NULL
       AND (
         EXISTS (SELECT 1 FROM me WHERE me.person_id = e.handler_id)
         OR EXISTS (
           SELECT 1
             FROM public.dogs d
             JOIN me ON me.person_id = d.owner_id
            WHERE d.id = e.dog_id
         )
       )
  ),
  waiting AS (
    SELECT s.entry_id, s.place, s.claim_state
      FROM public.entry_queue_places_for_classes(
        ARRAY(SELECT DISTINCT m.class_id FROM mine m WHERE m.class_id IS NOT NULL)
      ) s
  )
  SELECT m.id AS entry_id,
         w.place AS place,
         w.claim_state AS claim_state
    FROM mine m
    LEFT JOIN waiting w ON w.entry_id = m.id;
$$;

COMMENT ON FUNCTION public.get_my_entry_queue_places(uuid[]) IS
  'MYK9-995 / MYK9-1969: 1-based place in the ringside waiting queue for the caller''s own entries (handler or dog owner) and whether it may be shown as live, paper (position only) or stale. Counts only; place and claim_state are NULL when not waiting or run order unset.';

REVOKE ALL ON FUNCTION public.get_my_entry_queue_places(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_entry_queue_places(uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.get_my_entry_queue_places(uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_entry_queue_places(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_entry_queue_places(uuid[]) TO service_role;

-- ---------------------------------------------------------------------------
-- show_dogs_limited_view: + run_claim_state (body copied from 20261103014700)
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.show_dogs_limited_view(
  p_show_id uuid,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 1000
)
RETURNS TABLE (
  armband integer,
  call_name text,
  breed text,
  handler_name text,
  class_id uuid,
  class_name text,
  trial_name text,
  trial_date date,
  check_in_status text,
  run_position integer,
  run_claim_state text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_person_id uuid;
  v_passcode boolean := false;
  -- Entries in these states are not running; a NULL status counts as live.
  v_excluded constant text[] :=
    ARRAY['withdrawn', 'scratched', 'absent', 'moved', 'not_accepted'];
BEGIN
  IF p_show_id IS NULL OR auth.uid() IS NULL THEN
    RETURN;
  END IF;

  -- A soft-deleted (or unknown) show has no roster, for anyone.
  IF NOT EXISTS (
    SELECT 1 FROM public.shows s WHERE s.id = p_show_id AND s.deleted_at IS NULL
  ) THEN
    RETURN;
  END IF;

  -- Passcode session: the claim must name this show and be the current generation.
  v_passcode :=
    (auth.jwt() -> 'app_metadata' ->> 'kind') = 'ringside_passcode'
    AND nullif(auth.jwt() -> 'app_metadata' ->> 'show_id', '') = p_show_id::text
    AND public.ringside_claim_generation_current() IS TRUE;

  SELECT p.id INTO v_person_id
  FROM public.people p
  WHERE p.auth_user_id = auth.uid()
    AND p.deleted_at IS NULL
    AND p.status = 'active'
  LIMIT 1;

  -- "Live entry" is defined ONCE, in `live`, and both the access decision and the
  -- listing read it, so the caller can never be admitted by an entry the listing
  -- would not show: not deleted, not in a non-running state, and its dog, class and
  -- trial all live.
  RETURN QUERY
  WITH live AS MATERIALIZED (
    SELECT
      e.id AS entry_id,
      e.armband AS entry_armband,
      e.handler AS entry_handler,
      e.handler_id,
      e.class_id AS entry_class_id,
      e.check_in_status AS entry_check_in,
      d.call_name AS dog_call_name,
      d.name AS dog_name,
      d.breed AS dog_breed,
      d.owner_id,
      d.co_owner_id,
      c.name AS cls_name,
      t.name AS trial_name,
      t.date AS trial_date
    FROM public.entries e
    JOIN public.dogs d ON d.id = e.dog_id AND d.deleted_at IS NULL
    LEFT JOIN public.classes c ON c.id = e.class_id AND c.deleted_at IS NULL
    LEFT JOIN public.trials t ON t.id = c.trial_id AND t.deleted_at IS NULL
    WHERE e.show_id = p_show_id
      AND e.deleted_at IS NULL
      AND (e.class_id IS NULL OR (c.id IS NOT NULL AND t.id IS NOT NULL))
      AND coalesce(e.entry_status, '') <> ALL (v_excluded)
  ),
  -- Place in line per entry, from the one function get_my_entry_queue_places also
  -- uses. Only computed for a caller the listing admits; otherwise no classes.
  qp AS MATERIALIZED (
    SELECT s.entry_id AS qp_entry_id, s.place AS qp_place, s.claim_state AS qp_claim
    FROM public.entry_queue_places_for_classes(
      CASE
        WHEN v_passcode OR v_person_id IS NOT NULL
          THEN ARRAY(SELECT DISTINCT l.entry_class_id FROM live l WHERE l.entry_class_id IS NOT NULL)
        ELSE ARRAY[]::uuid[]
      END
    ) s
  )
  SELECT
    r.entry_armband::integer,
    coalesce(nullif(btrim(r.dog_call_name), ''), r.dog_name)::text,
    r.dog_breed::text,
    r.entry_handler::text,
    r.entry_class_id,
    r.cls_name::text,
    r.trial_name::text,
    r.trial_date,
    coalesce(r.entry_check_in, 'no-status')::text,
    q.qp_place,
    q.qp_claim::text
  FROM live r
  LEFT JOIN qp q ON q.qp_entry_id = r.entry_id
  WHERE (
      v_passcode
      OR (
        v_person_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM live l
          WHERE l.handler_id = v_person_id
             OR l.owner_id = v_person_id
             OR l.co_owner_id = v_person_id
        )
      )
    )
    -- CASE, not AND: Postgres does not promise to test the pattern before the
    -- cast, and armband is free text, so one '12A' would fail the whole call.
    AND CASE WHEN r.entry_armband ~ '^[0-9]{1,9}$' THEN r.entry_armband::integer > 0 ELSE false END
  ORDER BY r.entry_armband::integer, r.trial_date, r.cls_name, r.entry_class_id, r.entry_id
  OFFSET greatest(coalesce(p_offset, 0), 0)
  LIMIT least(greatest(coalesce(p_limit, 1000), 1), 1000);
END;
$$;

COMMENT ON FUNCTION public.show_dogs_limited_view(uuid, integer, integer) IS
  'MYK9-1517. Owner-approved limited view of the show''s dogs for exhibitors and passcode sessions: armband, call name, breed, handler name, class, check-in status, run position (place in the ringside waiting queue, NULL when not waiting) and run_claim_state (live | paper | stale, MYK9-1969). No contact, fee, payment, registration or score data. Zero rows unless the caller has a live entry in the show or a current passcode claim for it. Paged, at most 1000 rows per call.';

-- anon and PUBLIC get EXECUTE by default; revoke both explicitly. A passcode
-- session is an authenticated (anonymous-sign-in) JWT, so authenticated covers it.
REVOKE ALL ON FUNCTION public.show_dogs_limited_view(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.show_dogs_limited_view(uuid, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.show_dogs_limited_view(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.show_dogs_limited_view(uuid, integer, integer) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
