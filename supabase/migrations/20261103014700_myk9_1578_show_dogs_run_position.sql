-- MYK9-1578: exhibitors see the same run position the judge and steward see.
--
-- show_dogs_limited_view (MYK9-1517) dropped the place in line because it could not be
-- computed without cloning the ringside queue. The exhibitor's own dogs already get a
-- ringside-matched place from get_my_entry_queue_places (MYK9-995, parity-tested against
-- runQueue.ts by supabase/tests/myk9_995_my_entry_queue_places_test.sql and
-- serverQueuePlaceParity.test.ts). This migration lifts that computation into ONE
-- internal function and has BOTH callers read it, so there is a single server rule:
--
--   1. entry_queue_places_for_classes(uuid[]): the waiting-queue place per entry,
--      copied unchanged from get_my_entry_queue_places in the LATEST defining
--      migration (20261011003700_myk9_1011_disqualified_result.sql, incl. the DQ
--      handling). Internal only: it returns ANY entry's id, so EXECUTE is revoked from
--      PUBLIC, anon and authenticated and it is reached only through the two
--      SECURITY DEFINER functions below.
--   2. get_my_entry_queue_places: same signature, output and ACL; now reads (1).
--   3. show_dogs_limited_view: gains run_position integer (NULL when the dog is not
--      waiting or its run order is unset). A RETURNS TABLE change needs DROP + CREATE,
--      so the COMMENT and every GRANT/REVOKE are restated from
--      20261031055300 / 20261101143737 (the latest definition: live-person predicate).
--
-- Combined Section A/B classes share ONE class_id (sections are an entries column),
-- and the ringside queue is per class, so partitioning by class_id matches the judge.

CREATE OR REPLACE FUNCTION public.entry_queue_places_for_classes(p_class_ids uuid[])
RETURNS TABLE (entry_id uuid, place integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT w.id AS entry_id, w.place
    FROM (
      SELECT q.id,
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
   -- a dog with no run order set has no place yet, though it holds a slot in the count
   WHERE coalesce(w.run_order, 0) <> 0;
$$;

COMMENT ON FUNCTION public.entry_queue_places_for_classes(uuid[]) IS
  'MYK9-1578: internal. 1-based place in the ringside waiting queue for every waiting entry of the given classes with a run order set. The one rule behind get_my_entry_queue_places and show_dogs_limited_view.run_position. Not callable from the API: it returns any entry''s id.';

REVOKE ALL ON FUNCTION public.entry_queue_places_for_classes(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.entry_queue_places_for_classes(uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.entry_queue_places_for_classes(uuid[]) FROM authenticated;

-- ---------------------------------------------------------------------------
-- get_my_entry_queue_places: same output, now reading the shared function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_entry_queue_places(p_entry_ids uuid[])
RETURNS TABLE (entry_id uuid, place integer)
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
    SELECT s.entry_id, s.place
      FROM public.entry_queue_places_for_classes(
        ARRAY(SELECT DISTINCT m.class_id FROM mine m WHERE m.class_id IS NOT NULL)
      ) s
  )
  SELECT m.id AS entry_id,
         w.place AS place
    FROM mine m
    LEFT JOIN waiting w ON w.entry_id = m.id;
$$;

COMMENT ON FUNCTION public.get_my_entry_queue_places(uuid[]) IS
  'MYK9-995: 1-based place in the ringside waiting queue for the caller''s own entries (handler or dog owner). Counts only; NULL when not waiting or run order unset.';

REVOKE ALL ON FUNCTION public.get_my_entry_queue_places(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_entry_queue_places(uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.get_my_entry_queue_places(uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_entry_queue_places(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_entry_queue_places(uuid[]) TO service_role;

-- ---------------------------------------------------------------------------
-- show_dogs_limited_view: + run_position
-- ---------------------------------------------------------------------------
DROP FUNCTION public.show_dogs_limited_view(uuid, integer, integer);

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
  run_position integer
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
    SELECT s.entry_id AS qp_entry_id, s.place AS qp_place
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
    q.qp_place
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
  'MYK9-1517. Owner-approved limited view of the show''s dogs for exhibitors and passcode sessions: armband, call name, breed, handler name, class, check-in status, run position (place in the ringside waiting queue, NULL when not waiting). No contact, fee, payment, registration or score data. Zero rows unless the caller has a live entry in the show or a current passcode claim for it. Paged, at most 1000 rows per call.';

-- anon and PUBLIC get EXECUTE by default; revoke both explicitly. A passcode
-- session is an authenticated (anonymous-sign-in) JWT, so authenticated covers it.
REVOKE ALL ON FUNCTION public.show_dogs_limited_view(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.show_dogs_limited_view(uuid, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.show_dogs_limited_view(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.show_dogs_limited_view(uuid, integer, integer) TO service_role;
