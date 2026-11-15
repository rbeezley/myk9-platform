-- MYK9-1988: an offer that has run out is "waiting for the secretary" until its
-- spot is offered to another dog. The server records which offer refilled which.
--
-- Why server data (split from MYK9-1949 phase 1, #3910): a client count over the
-- waitlist rows could not tell whether an expired offer's spot had been offered
-- again. A replacement that was accepted stopped hiding it, one later open offer
-- hid every expired offer in the class, and offers in one class can have
-- different payment windows, so comparing deadlines misordered them.
--
-- 1. waitlist_entries.replaces_offer_id: on an offer, the expired offer whose spot
--    it refills (NULL when it refills none). One row is one offer: promote only
--    offers a 'waiting' row, and an expired row is terminal (the dog rejoins on a
--    new row), so the link names an offer, never a dog. A partial unique index
--    makes one expired offer refillable once. ON DELETE SET NULL: a removed row
--    leaves no dangling link.
--
-- 2. waitlist_offer_to_refill(class, offered_at): the expired offer in the class
--    that an offer made at that time refills: the EARLIEST MADE (offered_at, then
--    id) of the class's expired offers that no offer refills yet, that were made
--    before it and had run out by then (offer_expires_at at or before it). Ordered
--    by when the offer was made, never by its deadline. service_role only.
--
-- 3. promote_waitlist_entry_internal sets replaces_offer_id from (2) in the same
--    UPDATE that makes the offer. It already holds the class's advisory lock
--    (every offer path takes it: manual, automatic and mail-in), so two offers in
--    one class cannot pick the same expired offer. Copied from the LATEST
--    definition, 20261114201700 (MYK9-1929); only the DECLARE line, the lookup and
--    the one SET line are new. CREATE OR REPLACE keeps its owner, comment and
--    grants (re-stated at the end anyway).
--
-- 4. Backfill: the existing offers of each class, in the order they were made,
--    each take the expired offer (2) would have given them at that time. The
--    UPDATE bumps updated_at (waitlist_entries_updated_at), so devices' incremental
--    replica sync picks the links up.
--
-- The client's rule (features/waiting-for-you/runOutOffers.ts) is then: an offer
-- with status 'expired' that no row's replaces_offer_id names. The secretary's
-- Waitlist tab and its count read that one function.
--
-- No new table, so no new GRANT: table grants on waitlist_entries cover the new
-- column (no column-level ACLs on this table, migrations 009 onward).

BEGIN;

ALTER TABLE public.waitlist_entries
  ADD COLUMN IF NOT EXISTS replaces_offer_id uuid
    REFERENCES public.waitlist_entries(id) ON DELETE SET NULL;

ALTER TABLE public.waitlist_entries
  DROP CONSTRAINT IF EXISTS waitlist_entries_replaces_other_offer;
ALTER TABLE public.waitlist_entries
  ADD CONSTRAINT waitlist_entries_replaces_other_offer
    CHECK (replaces_offer_id IS NULL OR replaces_offer_id <> id);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_entries_replaces_offer_id_key
  ON public.waitlist_entries (replaces_offer_id)
  WHERE replaces_offer_id IS NOT NULL;

COMMENT ON COLUMN public.waitlist_entries.replaces_offer_id IS
  'MYK9-1988: the expired offer whose spot this offer refills (set by promote_waitlist_entry_internal). An expired offer no row names here has not been offered again.';


CREATE OR REPLACE FUNCTION public.waitlist_offer_to_refill(
  p_class_id uuid,
  p_offered_at timestamptz
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT e.id
  FROM public.waitlist_entries e
  WHERE e.class_id = p_class_id
    AND e.status = 'expired'
    AND e.offered_at IS NOT NULL
    AND e.offered_at < p_offered_at
    AND coalesce(e.offer_expires_at, e.offered_at) <= p_offered_at
    AND NOT EXISTS (
      SELECT 1 FROM public.waitlist_entries r WHERE r.replaces_offer_id = e.id
    )
  ORDER BY e.offered_at, e.id
  LIMIT 1
$$;

COMMENT ON FUNCTION public.waitlist_offer_to_refill(uuid, timestamptz) IS
  'MYK9-1988: the earliest-made expired offer in the class, run out by p_offered_at, that no offer refills yet.';


CREATE OR REPLACE FUNCTION public.promote_waitlist_entry_internal(
  p_waitlist_entry_id uuid,
  p_deadline_hours integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wl waitlist_entries%ROWTYPE;
  v_new_entry_id uuid;
  v_deadline_hours integer;
  v_class_limit integer;
  v_class_entry_count integer;
  v_show_id uuid;
  v_trial_id uuid;
  v_trial_date date;
  v_judge_id uuid;
  v_judge_capacity record;
  v_refills uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_waitlist_entry_id::text));

  SELECT *
  INTO v_wl
  FROM waitlist_entries
  WHERE id = p_waitlist_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Waitlist entry not found';
  END IF;

  IF v_wl.status != 'waiting' THEN
    RAISE EXCEPTION 'Waitlist entry is not available for promotion';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_wl.class_id::text));

  SELECT c.max_entries, c.trial_id, t.show_id, t.date
  INTO v_class_limit, v_trial_id, v_show_id, v_trial_date
  FROM classes c
  JOIN trials t ON t.id = c.trial_id
  WHERE c.id = v_wl.class_id
  LIMIT 1;

  IF v_show_id IS NULL OR v_trial_id IS NULL THEN
    RAISE EXCEPTION 'Class/show not found for waitlist entry';
  END IF;

  IF COALESCE(v_class_limit, 0) > 0 THEN
    SELECT COUNT(*)
    INTO v_class_entry_count
    FROM entries e
    WHERE e.class_id = v_wl.class_id
      AND e.entry_status IN ('submitted', 'paid', 'confirmed', 'checked-in', 'competing', 'in-ring', 'pending-payment', 'move-up-requested')
      AND e.deleted_at IS NULL;

    -- MYK9-1012: a spot a cart holds at Pay is taken until the hold ends.
    v_class_entry_count := v_class_entry_count + public.held_spot_count(ARRAY[v_wl.class_id]);

    IF v_class_entry_count >= v_class_limit THEN
      RAISE EXCEPTION 'Class is full';
    END IF;
  END IF;

  FOR v_judge_id IN
    SELECT DISTINCT ja.person_id
    FROM judge_assignments ja
    WHERE ja.class_id = v_wl.class_id
      AND ja.status = 'confirmed'
      AND ja.person_id IS NOT NULL
    ORDER BY ja.person_id
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtext('judgeday:' || v_judge_id::text || ':' || v_trial_date::text)
    );

    SELECT *
    INTO v_judge_capacity
    FROM public.get_judge_day_capacity(v_judge_id, v_show_id, v_trial_date)
    LIMIT 1;

    IF COALESCE(v_judge_capacity.available_spots, 0) <= 0 THEN
      RAISE EXCEPTION 'Judge-day capacity is full';
    END IF;
  END LOOP;

  SELECT GREATEST(
    1,
    COALESCE(p_deadline_hours, s.waitlist_payment_deadline_hours, 48)
  )
  INTO v_deadline_hours
  FROM classes c
  JOIN trials t ON t.id = c.trial_id
  JOIN shows s ON s.id = t.show_id
  WHERE c.id = v_wl.class_id;

  IF v_deadline_hours IS NULL THEN
    RAISE EXCEPTION 'Class/show not found for waitlist entry';
  END IF;

  INSERT INTO entries (dog_id, class_id, show_id, trial_id, entry_status, handler_id)
  VALUES (v_wl.dog_id, v_wl.class_id, v_show_id, v_trial_id, 'pending-payment', v_wl.handler_id)
  RETURNING id INTO v_new_entry_id;

  -- MYK9-1988: the expired offer whose spot this one refills, under the class lock.
  v_refills := public.waitlist_offer_to_refill(v_wl.class_id, now());

  UPDATE waitlist_entries
  SET status = 'offered',
      promoted_entry_id = v_new_entry_id,
      replaces_offer_id = v_refills,
      offered_at = now(),
      offer_expires_at = now() + (v_deadline_hours || ' hours')::interval,
      updated_at = now()
  WHERE id = p_waitlist_entry_id;

  RETURN v_new_entry_id;
END;
$$;


-- Backfill, class by class in the order the offers were made.
DO $$
DECLARE
  v_offer record;
  v_refills uuid;
BEGIN
  FOR v_offer IN
    SELECT w.id, w.class_id, w.offered_at
    FROM public.waitlist_entries w
    WHERE w.offered_at IS NOT NULL
      AND w.replaces_offer_id IS NULL
    ORDER BY w.class_id, w.offered_at, w.id
  LOOP
    v_refills := public.waitlist_offer_to_refill(v_offer.class_id, v_offer.offered_at);
    IF v_refills IS NOT NULL THEN
      UPDATE public.waitlist_entries
         SET replaces_offer_id = v_refills
       WHERE id = v_offer.id;
    END IF;
  END LOOP;
END;
$$;


REVOKE ALL ON FUNCTION public.waitlist_offer_to_refill(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.waitlist_offer_to_refill(uuid, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.promote_waitlist_entry_internal(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_waitlist_entry_internal(uuid, integer) TO service_role;

COMMIT;
