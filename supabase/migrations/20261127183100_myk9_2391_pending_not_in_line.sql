-- =============================================================================
-- MYK9-2391: a Pending (not yet approved) entry has no place in line
-- =============================================================================
-- Owner decision (MYK9-2376): an entry awaiting approval does not run. Show Desk follows
-- it (MYK9-2388); Ringside's run queue and Show Desk now do too, through
-- isAwaitingApproval (apps/myk9show/src/features/_shared/entryAccounting.ts). The placement
-- model is unchanged: a Pending dog keeps its run number. This restates
-- the server's one place-in-line rule with the same exclusion, so an exhibitor's "Nth up"
-- and Ringside's list count the same waiting set.
--
-- Pending is exactly isPendingEntryStatus: entry_status in submitted, pending, draft, no-status, pending-payment, plus
-- paid and promotion-expired, which the owner keeps pending (mapEntryStatus override).
-- entries_entry_status_check admits only canonical lowercase values, so the btrim and lower
-- below are defensive, not a rule the data needs. A NULL entry_status is not pending and
-- stays runnable, as on the client.
--
-- CREATE OR REPLACE of the 20261114205300 definition: same signature, return type,
-- SECURITY DEFINER, search_path and ACL (no API role can execute it). Only the one
-- exclusion below is new. get_my_entry_queue_places and show_dogs_limited_view call it
-- and need no change.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.entry_queue_places_for_classes(p_class_ids uuid[])
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
           -- a break or briefing is routine: the place is not moving, the class has not gone quiet
           WHEN cs.status = 'in_progress'
                AND cs.ring_phase IS DISTINCT FROM 'break'
                AND cs.ring_phase IS DISTINCT FROM 'briefing'
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
             -- not awaiting approval (isAwaitingApproval): the client's isPendingEntryStatus, i.e.
             -- getEntryStatusKind 'pending' plus the owner's override that paid and
             -- promotion-expired stay pending (mapEntryStatus). MYK9-2391.
             AND lower(btrim(coalesce(e.entry_status, ''))) NOT IN
                 ('submitted', 'pending', 'draft', 'no-status', 'pending-payment',
                  'paid', 'promotion-expired')
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
             c.ring_phase,
             coalesce(c.scores_on_paper, NOT s.uses_device_scoring, false) AS on_paper,
             -- The quiet clock starts at the later of the last score / in-ring mark / phase
             -- change and the class's actual start. Never classes.updated_at: check-in and
             -- counter rollups bump it. NULL (neither exists) = not demonstrably quiet = live.
             greatest(ra.last_activity_at, c.actual_start_time) AS last_activity
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
  'MYK9-1578 / MYK9-1969 / MYK9-2391: internal. 1-based place in the ringside waiting queue for every waiting entry of the given classes with a run order set, plus claim_state (live | paper | stale). An entry awaiting approval is not in the queue. The one rule behind get_my_entry_queue_places and show_dogs_limited_view. Not callable from the API: it returns any entry''s id.';

-- ACL restated, unchanged: internal only.
REVOKE ALL ON FUNCTION public.entry_queue_places_for_classes(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.entry_queue_places_for_classes(uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.entry_queue_places_for_classes(uuid[]) FROM authenticated;

COMMIT;
