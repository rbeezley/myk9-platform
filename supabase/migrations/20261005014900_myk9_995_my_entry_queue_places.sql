-- MYK9-995: an exhibitor's place in line, counted on the server.
--
-- Exhibitor surfaces cannot count a place in line themselves: `entries_select`
-- lets an exhibitor read only rows they handle or whose dog they own, and the
-- account routes never seed the per-show replica. So MYK9-992 (#2727) left the
-- class page and My Shows "Where to be" showing only a state ("Waiting").
--
-- get_my_entry_queue_places(p_entry_ids) returns, for each of the CALLER'S OWN
-- entries among p_entry_ids, its 1-based place in its class's waiting queue.
-- It returns a number per own entry and nothing else: no other entry's id,
-- armband, dog or handler ever leaves the function. Ids the caller does not
-- own are silently omitted (no row, so no existence oracle either).
--
-- Ownership is the exhibitor half of `entries_select`, restated: the caller's
-- person is the entry's handler, or owns the entry's dog. The manager branch
-- (entry_enrollment_select_show_ids) is deliberately NOT restated: a secretary
-- reads the whole class from the replica and needs no server count. The caller
-- is resolved through people.auth_user_id = auth.uid(); people.id is never
-- auth.uid().
--
-- `place` is NULL when the entry is not waiting (scored, pulled, in the ring,
-- withdrawn, ...) or when its own run_order is unset (NULL or 0): before the
-- secretary sets an order, the client says nothing at all, and a place counted
-- from armbands alone would be a guess.
--
-- THE WAITING QUEUE IS THE RINGSIDE ONE. It mirrors, on an `entries` row, the
-- chain the at-show run queue applies to a replicated row:
--   rowToEntry -> toRunQueueEntry (apps/myk9show/src/features/at-show/
--   replicatedRunQueue.ts) -> pendingByRunOrder (packages/ringside/src/pages/
--   EntryList/runQueue.ts), with membership from isRunnableEntry
--   (apps/myk9show/src/features/_shared/entryAccounting.ts):
--     runnable  = deleted_at IS NULL
--                 AND entry_status NOT IN (withdrawn, scratched, absent, moved,
--                                          not_accepted)
--                 AND check_in_status <> 'pulled'
--                 AND NOT is_scored
--                 AND result_status NOT IN (absent, excused)
--     waiting   = runnable
--                 AND coalesce(check_in_status, 'no-status') IN the check-in
--                     half of WAITING_STATUSES (the replica mapper always fills
--                     check_in_status, so the lifecycle half never decides)
--                 AND NOT in the ring (is_in_ring OR check_in_status = 'in-ring')
--     order key = run_order || armband || 0 (compareByRunOrder: a NULL or 0
--                 run_order falls back to the armband, parsed like parseInt)
-- Ties on the key break by armband, then id; the client's stable sort keeps
-- replica order there, which is not a rule at all.
--
-- Parity is pinned by a SHARED FIXTURE, not by comparing source text: the
-- fixture block in supabase/tests/myk9_995_my_entry_queue_places_test.sql is
-- evaluated by this function there, and by the TypeScript chain above in
-- apps/myk9show/src/features/at-show/serverQueuePlaceParity.test.ts.
--
-- Online-only by nature; the client degrades to the state label offline.

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
    SELECT q.id,
           row_number() OVER (
             PARTITION BY q.class_id
             ORDER BY q.sort_key, q.armband_key, q.id
           )::integer AS place
      FROM (
        SELECT e.id,
               e.class_id,
               a.armband_key,
               coalesce(nullif(e.run_order, 0)::numeric, a.armband_key) AS sort_key
          FROM public.entries e
          -- parseInt semantics: leading whitespace, optional sign, digits; else 0
          CROSS JOIN LATERAL (
            SELECT coalesce(substring(e.armband FROM '^\s*([+-]?[0-9]+)')::numeric, 0) AS armband_key
          ) a
         WHERE e.class_id IN (SELECT m.class_id FROM mine m WHERE m.class_id IS NOT NULL)
           -- runnable (isRunnableEntry)
           AND e.deleted_at IS NULL
           AND lower(btrim(coalesce(e.entry_status, ''))) NOT IN
               ('withdrawn', 'scratched', 'absent', 'moved', 'not_accepted')
           AND lower(btrim(coalesce(e.check_in_status, ''))) <> 'pulled'
           AND NOT coalesce(e.is_scored, false)
           AND lower(btrim(coalesce(e.result_status, ''))) NOT IN ('absent', 'excused')
           -- still to run (isInQueue's allowlist, check-in axis)
           AND coalesce(e.check_in_status, 'no-status') IN
               ('no-status', 'checked-in', 'at-gate', 'come-to-gate', 'conflict', 'in-ring')
           -- the in-ring dog is not in the waiting queue (runQueue INTENT)
           AND NOT coalesce(e.is_in_ring, false)
           AND coalesce(e.check_in_status, '') <> 'in-ring'
      ) q
  )
  SELECT m.id AS entry_id,
         CASE WHEN coalesce(m.run_order, 0) <> 0 THEN w.place END AS place
    FROM mine m
    LEFT JOIN waiting w ON w.id = m.id;
$$;

COMMENT ON FUNCTION public.get_my_entry_queue_places(uuid[]) IS
  'MYK9-995: 1-based place in the ringside waiting queue for the caller''s own entries (handler or dog owner). Counts only; NULL when not waiting or run order unset.';

REVOKE ALL ON FUNCTION public.get_my_entry_queue_places(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_entry_queue_places(uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.get_my_entry_queue_places(uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_entry_queue_places(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_entry_queue_places(uuid[]) TO service_role;
