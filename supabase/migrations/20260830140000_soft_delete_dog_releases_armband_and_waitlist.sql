-- Finish the dog soft-delete: refuse it over money or results, and clean up the
-- two dog_id children 20260616130000 left behind.
--
-- 1. REFUSAL (new SQLSTATE MK002). soft_delete_dog used to soft-delete EVERY
--    live entry unconditionally, which walked straight past two things the rest
--    of the app treats as serious:
--      * a PAID entry vanished from the roster with no refund decision recorded,
--        while every other way to remove one goes through the refund flow;
--      * `entries_refresh_class_scoring_state` fires on deleted_at, so deleting a
--        dog after a show RECOMPUTED placements in every class it was scored in —
--        a second place silently became a first, with nothing linking the change
--        to a dog deletion.
--    Neither is a cascade decision to make on the user's behalf. The dog delete
--    now refuses and asks them to scratch or refund first. 'refunded' and
--    'waived' do not block: no money is being kept.
--
-- 2. CLEANUP. Neither child below is reached by any FK rule here — a soft delete
--    never deletes the dogs row, so nothing fires and the function is the only
--    thing that can clean up:
--      * armbands: the row stayed marked ASSIGNED and kept syncing to ringside
--        (the replication pull filters `is_available = false`). Marked available
--        instead, with `dog_id` DELIBERATELY LEFT IN PLACE: it is the only link
--        back, and nulling it would make `restore_dog` lossy — a restored dog
--        would draw a new number while `entries.armband` still carried the old
--        one. Keeping it means `assign_armband`'s (show_id, dog_id) fast path
--        hands the same number back if the dog returns, with no restore_dog
--        change needed. No number is recycled either way: assign_armband always
--        takes MAX+1 and the released row keeps its armband_number.
--      * waitlist_entries: deleted, matching `removeFromWaitlist`
--        (services/database/waitlists/reads.ts), which is what "leave the
--        waitlist" has always meant here. The table has no soft-delete column and
--        its dog_id is NOT NULL, so releasing is not available. A deleted dog
--        that stayed queued could still be promoted into a live entry. Positions
--        are left as-is — removeFromWaitlist leaves gaps too, and `position` is
--        only an ordering.
--
CREATE OR REPLACE FUNCTION public.soft_delete_dog(p_dog_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_person_id UUID;
  v_rows_affected INT;
BEGIN
  SELECT get_my_person_id() INTO v_person_id;

  UPDATE dogs
  SET
    deleted_at = NOW(),
    updated_at = NOW()
  WHERE
    id = p_dog_id
    AND deleted_at IS NULL
    AND (
      owner_id = v_person_id
      OR co_owner_id = v_person_id
      OR (SELECT is_platform_admin())
    );

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected = 0 THEN
    RAISE EXCEPTION 'Dog not found or permission denied' USING ERRCODE = '42501';
  END IF;

  -- Refuse over money or results, BEFORE any cascade runs. Placed after the
  -- permission gate so an unauthorised caller still gets 42501 and learns
  -- nothing about the dog's entries. The RAISE aborts the function's
  -- transaction, so the UPDATE above is rolled back with it.
  IF EXISTS (
    SELECT 1
    FROM entries e
    WHERE e.dog_id = p_dog_id
      AND e.deleted_at IS NULL
      AND (
        e.payment_status = 'paid'
        OR e.is_scored IS TRUE
        OR e.scoring_completed_at IS NOT NULL
        OR (e.result_status IS NOT NULL AND e.result_status <> 'pending')
      )
  ) THEN
    RAISE EXCEPTION
      'This dog has paid or scored entries. Scratch or refund them before deleting.'
      USING ERRCODE = 'MK002';
  END IF;

  -- Cascade: soft-delete the dog's live entries so a deleted dog leaves no live
  -- entries behind in rosters/scoring.
  UPDATE entries
  SET
    deleted_at = NOW(),
    deleted_by = auth.uid(),
    updated_at = NOW()
  WHERE
    dog_id = p_dog_id
    AND deleted_at IS NULL;

  -- Cascade: clear any pre-checkout cart items for the dog (no soft-delete
  -- column; NO ACTION FK would otherwise orphan them).
  DELETE FROM entry_cart_items WHERE dog_id = p_dog_id;

  -- Cascade: mark the dog's armbands available again. `dog_id` stays so a
  -- restore (or a re-entry) reclaims the same number via assign_armband.
  UPDATE armbands
  SET
    is_available = TRUE,
    assigned_at = NULL
  WHERE dog_id = p_dog_id
    AND (is_available IS NOT TRUE OR assigned_at IS NOT NULL);

  -- Cascade: drop the dog off every waitlist it is queued on, so it cannot be
  -- promoted into a live entry after deletion.
  DELETE FROM waitlist_entries WHERE dog_id = p_dog_id;
END;
$function$;

-- Grant decisions restated with the replacement (unchanged from the live ACL):
-- exhibitors delete their own dogs, and a signed-out visitor never can.
REVOKE ALL ON FUNCTION public.soft_delete_dog(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.soft_delete_dog(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_dog(uuid) TO authenticated;

-- Backfill the rows that were already left behind by the pre-fix function.
UPDATE public.armbands a
SET
  is_available = TRUE,
  assigned_at = NULL
FROM public.dogs d
WHERE d.id = a.dog_id
  AND d.deleted_at IS NOT NULL
  AND (a.is_available IS NOT TRUE OR a.assigned_at IS NOT NULL);

DELETE FROM public.waitlist_entries w
USING public.dogs d
WHERE d.id = w.dog_id
  AND d.deleted_at IS NOT NULL;
