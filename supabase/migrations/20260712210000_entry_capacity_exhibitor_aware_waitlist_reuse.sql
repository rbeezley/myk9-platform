-- Fixes a Codex second-opinion finding on PR #1298
-- (20260712200000_entry_capacity_enforcement.sql): the waitlist-reuse
-- lookup inside public.evaluate_entry_capacity() matched any ACTIVE
-- waitlist_entries row by class_id + dog_id alone, without checking
-- exhibitor_id. A co-owner or a different exhibitor submitting the same
-- dog for the same class would silently be reported "waitlisted" while
-- the existing offer/notifications stayed attached to the original
-- exhibitor's row — the requester never actually joined the wait list.
--
-- waitlist_entries_active_class_dog_key (see
-- 20260629015413_harden_waitlist_idempotency_capacity_helper.sql /
-- 20260628202146_create_online_paid_entry_capacity_gate.sql) already
-- enforces "one active wait-list slot per class+dog" at the DB level, so
-- a second exhibitor can never legitimately hold their own active row for
-- the same dog+class. The correct behavior is therefore:
--   * an active row owned by the REQUESTING exhibitor -> reuse it
--     (idempotent retry, unchanged from before)
--   * an active row owned by a DIFFERENT exhibitor -> deny the request
--     with a clear reason, instead of misreporting "waitlisted"
--
-- This migration REPLACEs public.evaluate_entry_capacity() (same
-- signature) to add the exhibitor check and a new denial_reason output
-- column. The new column is additive: existing callers
-- (create_online_paid_entry, submit_show_entries in
-- 20260712200100_entry_capacity_write_boundaries.sql) read the result
-- into a plain `record` variable and never enumerate columns
-- positionally, so they remain source-compatible without changes.
--
-- Rollback (run in a single transaction):
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.evaluate_entry_capacity(uuid, uuid, uuid, uuid, text, boolean);
--   -- re-apply 20260712200000_entry_capacity_enforcement.sql's
--   -- CREATE OR REPLACE FUNCTION public.evaluate_entry_capacity block
--   -- (the pre-fix body without denial_reason), then its
--   -- REVOKE ALL ... FROM PUBLIC, anon, authenticated; and
--   -- GRANT EXECUTE ... TO service_role; statements.
--   COMMIT;

-- Adding the denial_reason OUT column changes the function's return type,
-- so CREATE OR REPLACE alone would fail ("cannot change return type of
-- existing function"). Drop + recreate inside one transaction so callers
-- (create_online_paid_entry / submit_show_entries, which resolve the
-- function at runtime) never observe it missing. No non-plpgsql objects
-- depend on it (verified: only the two write-boundary RPCs reference it
-- across supabase/migrations), so a plain DROP is safe.
BEGIN;

DROP FUNCTION IF EXISTS public.evaluate_entry_capacity(
  uuid, uuid, uuid, uuid, text, boolean
);

CREATE OR REPLACE FUNCTION public.evaluate_entry_capacity(
  p_class_id uuid,
  p_dog_id uuid,
  p_exhibitor_id uuid,
  p_handler_id uuid,
  p_submission_source text,
  p_allow_override boolean DEFAULT false
)
RETURNS TABLE (
  outcome text,
  waitlist_entry_id uuid,
  waitlist_position integer,
  resolved_show_id uuid,
  resolved_trial_id uuid,
  capacity_override boolean,
  denial_reason text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trial_date date;
  v_allow_waitlist boolean;
  v_class_limit integer;
  v_class_count integer;
  v_is_full boolean := false;
  v_judge_id uuid;
  v_judge_capacity record;
  v_available integer;
  v_joined_via text;
  v_existing_waitlist_exhibitor_id uuid;
BEGIN
  IF p_submission_source NOT IN ('self_service', 'organizer', 'show_desk') THEN
    RAISE EXCEPTION 'invalid submission source: %', p_submission_source
      USING ERRCODE = '22023';
  END IF;

  SELECT c.trial_id, t.show_id, t.date, COALESCE(c.allow_waitlist, false), c.max_entries
  INTO resolved_trial_id, resolved_show_id, v_trial_date, v_allow_waitlist, v_class_limit
  FROM public.classes c
  JOIN public.trials t ON t.id = c.trial_id
  WHERE c.id = p_class_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'class % not found', p_class_id
      USING ERRCODE = 'P0002';
  END IF;

  -- One common first lock prevents two submit_show_entries batches from taking
  -- different class/judge locks in opposite order. Existing single-entry and
  -- waitlist promotion paths still coordinate on the exact class/judge locks.
  PERFORM pg_advisory_xact_lock(
    hashtext('showcapacity:' || resolved_show_id::text)
  );
  PERFORM pg_advisory_xact_lock(hashtext(p_class_id::text));

  SELECT COUNT(*)::integer
  INTO v_class_count
  FROM public.entries e
  WHERE e.class_id = p_class_id
    AND e.entry_status IN (
      'submitted', 'paid', 'confirmed', 'checked-in', 'competing', 'in-ring', 'pending-payment'
    )
    AND e.deleted_at IS NULL;

  IF COALESCE(v_class_limit, 0) > 0 AND v_class_count >= v_class_limit THEN
    v_is_full := true;
  END IF;

  FOR v_judge_id IN
    SELECT DISTINCT ja.person_id
    FROM public.judge_assignments ja
    WHERE ja.class_id = p_class_id
      AND ja.show_id = resolved_show_id
      AND ja.status = 'confirmed'
      AND ja.person_id IS NOT NULL
    ORDER BY ja.person_id
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtext('judgeday:' || v_judge_id::text || ':' || v_trial_date::text)
    );

    SELECT *
    INTO v_judge_capacity
    FROM public.get_judge_day_capacity_live(v_judge_id, resolved_show_id, v_trial_date)
    LIMIT 1;

    IF p_submission_source = 'self_service' THEN
      v_available := COALESCE(v_judge_capacity.available_spots, 0);
    ELSE
      -- Organizer-entered rows consume the physical pool, including the
      -- portion reserved away from self-service online entry.
      v_available := GREATEST(
        0,
        COALESCE(v_judge_capacity.capacity, 0)
          - COALESCE(v_judge_capacity.confirmed_count, 0)
      );
    END IF;

    IF v_available <= 0 THEN
      v_is_full := true;
    END IF;
  END LOOP;

  IF NOT v_is_full THEN
    outcome := 'available';
    waitlist_entry_id := NULL;
    waitlist_position := NULL;
    capacity_override := false;
    denial_reason := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_submission_source = 'show_desk' AND p_allow_override THEN
    outcome := 'available';
    waitlist_entry_id := NULL;
    waitlist_position := NULL;
    capacity_override := true;
    denial_reason := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF NOT v_allow_waitlist OR p_exhibitor_id IS NULL THEN
    outcome := 'denied';
    waitlist_entry_id := NULL;
    waitlist_position := NULL;
    capacity_override := false;
    denial_reason := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Look up any ACTIVE wait-list row for this class+dog regardless of
  -- owner (the unique index waitlist_entries_active_class_dog_key allows
  -- at most one). Only reuse it when it belongs to the requesting
  -- exhibitor; a different exhibitor's active row must not be silently
  -- reported as "this requester is waitlisted" — that would misattribute
  -- offers/notifications that still target the original exhibitor.
  SELECT we.id, we.position, we.exhibitor_id
  INTO waitlist_entry_id, waitlist_position, v_existing_waitlist_exhibitor_id
  FROM public.waitlist_entries we
  WHERE we.class_id = p_class_id
    AND we.dog_id = p_dog_id
    AND we.status IN ('waiting', 'offered')
  ORDER BY we.position NULLS LAST, we.created_at
  LIMIT 1;

  IF FOUND THEN
    IF v_existing_waitlist_exhibitor_id IS NOT DISTINCT FROM p_exhibitor_id THEN
      outcome := 'waitlisted';
      capacity_override := false;
      denial_reason := NULL;
      RETURN NEXT;
      RETURN;
    ELSE
      outcome := 'denied';
      waitlist_entry_id := NULL;
      waitlist_position := NULL;
      capacity_override := false;
      denial_reason := 'dog already on this class wait list for a different exhibitor';
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  SELECT COALESCE(MAX(we.position), 0) + 1
  INTO waitlist_position
  FROM public.waitlist_entries we
  WHERE we.class_id = p_class_id
    AND we.status = 'waiting';

  v_joined_via := CASE
    WHEN p_submission_source = 'self_service' THEN 'online'
    ELSE 'mail_in'
  END;

  INSERT INTO public.waitlist_entries (
    class_id,
    exhibitor_id,
    dog_id,
    handler_id,
    position,
    joined_via
  )
  VALUES (
    p_class_id,
    p_exhibitor_id,
    p_dog_id,
    p_handler_id,
    waitlist_position,
    v_joined_via
  )
  ON CONFLICT (class_id, dog_id) WHERE status IN ('waiting', 'offered')
  DO NOTHING
  RETURNING id, position INTO waitlist_entry_id, waitlist_position;

  IF waitlist_entry_id IS NULL THEN
    -- Lost the race to a concurrent insert. Re-check ownership of the row
    -- that won, same exhibitor-aware logic as above.
    SELECT we.id, we.position, we.exhibitor_id
    INTO waitlist_entry_id, waitlist_position, v_existing_waitlist_exhibitor_id
    FROM public.waitlist_entries we
    WHERE we.class_id = p_class_id
      AND we.dog_id = p_dog_id
      AND we.status IN ('waiting', 'offered')
    ORDER BY we.position NULLS LAST, we.created_at
    LIMIT 1;

    IF FOUND AND v_existing_waitlist_exhibitor_id IS DISTINCT FROM p_exhibitor_id THEN
      outcome := 'denied';
      waitlist_entry_id := NULL;
      waitlist_position := NULL;
      capacity_override := false;
      denial_reason := 'dog already on this class wait list for a different exhibitor';
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  outcome := 'waitlisted';
  capacity_override := false;
  denial_reason := NULL;
  RETURN NEXT;
END;
$$;

-- Drop + recreate resets ACLs; restore exactly the grants issued by
-- 20260712200000_entry_capacity_enforcement.sql (service_role only —
-- the helper is never client-callable).
REVOKE ALL ON FUNCTION public.evaluate_entry_capacity(
  uuid, uuid, uuid, uuid, text, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_entry_capacity(
  uuid, uuid, uuid, uuid, text, boolean
) TO service_role;

COMMENT ON FUNCTION public.evaluate_entry_capacity(uuid, uuid, uuid, uuid, text, boolean) IS
  'Shared post-lock class/judge-day capacity decision for paid-cart and submit_show_entries. '
  'Self-service preserves mail-in reserve; organizer uses physical capacity; authorized show_desk '
  'may record an explicit override. Not client-callable. Waitlist reuse is exhibitor-aware: an '
  'active class+dog wait-list row owned by a different exhibitor is denied with denial_reason, '
  'not silently reused (fixed 20260712210000).';

COMMIT;
