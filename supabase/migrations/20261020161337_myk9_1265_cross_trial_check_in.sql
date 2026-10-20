-- MYK9-1265: owner-approved cross-trial Change class policy.
-- Copied from the latest definitions (20261004064300 and 20260919170000).
-- Keep the source check-in unchanged as its undo snapshot. A different trial
-- starts with no-status; undo never imports that trial's check-in into the source.
-- Same-trial carry/undo and all existing authorization, money and run guards remain.
BEGIN;

CREATE OR REPLACE FUNCTION public.move_up_entry(
  p_entry_id uuid,
  p_target_class_id uuid,
  p_new_entry_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_source         public.entries%ROWTYPE;
  v_target_show_id uuid;
  v_target_trial_id uuid;
  v_target_status text;
  v_note           text;
BEGIN
  -- MYK9-923: gate before entry rows. The destination INSERT below takes the
  -- target's parent gates (entries trigger); take them now, before locking the
  -- source, so a concurrent soft_delete_* (gate first, then the entries it
  -- cascades) cannot hold the gate while waiting on our source row. The
  -- verdict is not used here: the target checks below and the trigger refuse
  -- a deleted parent with their own messages.
  PERFORM private.entry_deleted_parent(
    p_target_class_id,
    (SELECT c.trial_id FROM public.classes c WHERE c.id = p_target_class_id),
    NULL
  );

  SELECT * INTO v_source
  FROM public.entries
  WHERE id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That entry no longer exists.' USING ERRCODE = 'P0002';
  END IF;

  -- Restated authorization (see the header): identical to entries_update.
  IF NOT public.can_manage_show(v_source.show_id) THEN
    RAISE EXCEPTION 'You do not have permission to move entries in this show.'
      USING ERRCODE = '42501';
  END IF;

  -- A dog who has been pulled, withdrawn, scratched, marked absent, already
  -- moved, or soft-deleted is not movable. Refusing here is what lets the
  -- move-back restore an unambiguous source, and what stops a pulled dog being
  -- carried into a class the readiness counters then drop them from.
  IF v_source.deleted_at IS NOT NULL
     OR COALESCE(v_source.entry_status, '') IN
        ('moved', 'withdrawn', 'scratched', 'absent', 'not_accepted')
     OR v_source.check_in_status = 'pulled' THEN
    RAISE EXCEPTION 'This entry is not in a state that can be moved.'
      USING ERRCODE = '22023';
  END IF;

  -- MYK9-980: Move up waits for acceptance (owner decision 2026-10-03). The
  -- set is the client's `isPendingEntryStatus`, including the owner's
  -- override that 'paid' and 'promotion-expired' stay pending. See the header.
  IF v_source.entry_status IN (
       'submitted', 'pending', 'draft', 'no-status', 'pending-payment',
       'paid', 'promotion-expired'
     ) THEN
    RAISE EXCEPTION 'This entry has not been accepted yet. Accept it before moving it up.'
      USING ERRCODE = '22023', HINT = 'entry_not_accepted';
  END IF;

  -- A run that has STARTED cannot be moved out of the class it started in --
  -- the same rule `reverse_move_up_entry` applies to the destination, and for
  -- the same reason. Marking the source `moved` excludes it from the class
  -- rollup, the catalog and every registry report, so moving a scored entry
  -- would VACATE a result from the class it was earned in. `completed`,
  -- `in-ring` and `competing` all passed the movability guard above, which
  -- refuses only the approval-dimension states.
  --
  -- `checked-in` and `at-gate` are deliberately still movable: the dog is
  -- present and has not run, which is exactly when a secretary moves them.
  IF COALESCE(v_source.is_scored, false)
     OR COALESCE(v_source.is_in_ring, false)
     OR COALESCE(v_source.entry_status, '') IN ('in-ring', 'competing', 'completed')
     OR v_source.check_in_status IN ('in-ring', 'completed')
     OR v_source.scoring_started_at IS NOT NULL
     OR v_source.scoring_completed_at IS NOT NULL
     OR v_source.ring_entry_time IS NOT NULL
     OR COALESCE(v_source.result_status, 'pending') <> 'pending'
     OR v_source.final_placement IS NOT NULL
     OR COALESCE(v_source.points_earned, 0) <> 0
     OR COALESCE(v_source.search_time_seconds, 0) <> 0
     OR COALESCE(v_source.area1_time_seconds, 0) <> 0
     OR COALESCE(v_source.area2_time_seconds, 0) <> 0
     OR COALESCE(v_source.area3_time_seconds, 0) <> 0
     OR COALESCE(v_source.area4_time_seconds, 0) <> 0
     OR COALESCE(v_source.total_faults, 0) <> 0
     OR COALESCE(v_source.total_correct_finds, 0) <> 0
     OR COALESCE(v_source.total_incorrect_finds, 0) <> 0
     OR COALESCE(v_source.no_finish_count, 0) <> 0
     OR COALESCE(v_source.total_score, 0) <> 0
     OR COALESCE(v_source.points_possible, 0) <> 0 THEN
    RAISE EXCEPTION 'This run has already started, so the entry can no longer be moved.'
      USING ERRCODE = '22023';
  END IF;

  SELECT t.show_id, c.trial_id, c.status
  INTO v_target_show_id, v_target_trial_id, v_target_status
  FROM public.classes c
  JOIN public.trials t ON t.id = c.trial_id
  WHERE c.id = p_target_class_id
    AND c.deleted_at IS NULL
    AND t.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That class no longer exists.' USING ERRCODE = 'P0002';
  END IF;

  IF v_target_show_id IS DISTINCT FROM v_source.show_id THEN
    RAISE EXCEPTION 'An entry can only move within its own show.'
      USING ERRCODE = '22023';
  END IF;

  IF lower(v_target_status) IN ('complete', 'completed', 'cancelled', 'canceled') THEN
    RAISE EXCEPTION 'This class is complete or cancelled and cannot accept a changed entry.'
      USING ERRCODE = '22023';
  END IF;

  IF p_target_class_id = v_source.class_id THEN
    RAISE EXCEPTION 'That entry is already in this class.' USING ERRCODE = '22023';
  END IF;

  -- MYK9-1265: Change class can cross trial, element and level within the show.
  -- The server owns authorization, movable rows, closed/duplicate targets and
  -- atomicity; the client lists the eligible classes and advisory capacity.

  -- A dog already entered in the target class would otherwise die on
  -- `entries_dog_class_unique_idx` with raw constraint text in the secretary's
  -- toast. Say it in words instead, in the same 22023 the client already
  -- renders verbatim.
  IF EXISTS (
    SELECT 1
    FROM public.entries e
    WHERE e.dog_id = v_source.dog_id
      AND e.class_id = p_target_class_id
      AND e.deleted_at IS NULL
      -- Byte-identical to entries_dog_class_unique_idx's predicate above. A
      -- COALESCE here would be STRICTER than the index: a NULL entry_status is
      -- excluded from the index entirely, so the INSERT would have succeeded
      -- while this refused it in words.
      AND e.entry_status <> ALL (ARRAY['withdrawn'::text, 'scratched'::text])
  ) THEN
    RAISE EXCEPTION 'This dog is already entered in that class.' USING ERRCODE = '22023';
  END IF;

  v_note := 'Moved up from class ' || v_source.class_id::text
            || COALESCE(': ' || NULLIF(btrim(p_reason), ''), '');

  INSERT INTO public.entries (
    id, dog_id, show_id, class_id, trial_id,
    handler_id, handler, armband, jump_height,
    entry_status, check_in_status,
    payment_status, entry_fee,
    is_day_of_show, entry_source, registration_id,
    special_requests, moved_from_entry_id
  )
  VALUES (
    p_new_entry_id, v_source.dog_id, v_source.show_id, p_target_class_id, v_target_trial_id,
    v_source.handler_id, v_source.handler, v_source.armband, v_source.jump_height,
    -- The dog's APPROVAL state travels; a move-up is not an acceptance. Writing
    -- 'confirmed' unconditionally promoted a `pending-payment` or `submitted`
    -- entry the secretary had never accepted, and a round trip then restored it
    -- as 'confirmed' -- because the reverse restores from the destination.
    --
    -- The four REQUEST statuses are the exception, and they have to be: a
    -- request is a request to move THIS entry, and it is fulfilled the moment
    -- this function runs. `approveMoveUpRequestReplicated` requires the source
    -- to be 'move-up-requested' before it calls here, so inheriting that status
    -- put the destination straight back into `getPendingMoveUpRequests`'s
    -- queue -- the secretary approves, the row reappears in front of them, and
    -- approving again walks the dog another rung up the ladder. Same shape for
    -- 'scratch-requested': an exhibitor's request against the OLD class must not
    -- become a pending request against a class they never entered.
    --
    -- Kept in lockstep with MOVE_UP_REQUEST_STATUSES in
    -- features/show-map/moveUpRequestStatuses.ts, which the contract test pins.
    CASE
      WHEN COALESCE(v_source.entry_status, '') IN (
        'move-up-requested', 'move_up_requested', 'scratch-requested', 'scratch_requested'
      ) THEN 'confirmed'
      ELSE v_source.entry_status
    END,
    -- MYK9-1265: a check-in travels only within the same trial. 'pulled' cannot
    -- reach here (refused above); 'in-ring', 'at-gate' and 'completed' describe
    -- a run in the class being left, not the one being entered.
    CASE WHEN v_source.check_in_status = 'checked-in'
      AND v_target_trial_id IS NOT DISTINCT FROM
        (SELECT trial_id FROM public.classes WHERE id = v_source.class_id)
      THEN 'checked-in' ELSE 'no-status' END,
    -- Money-neutral. See the header.
    'pending', 0,
    -- Provenance, NOT money: who collected the entry and under which
    -- enrollment. `entry_source` is the only field that proves UKC collected a
    -- fee ('ukc_online'), and `is_day_of_show` is the day-of/pre-entry split --
    -- both are per-BUCKET lines on the registry report, so losing them bills
    -- the club for a run a registry already collected, and strands the
    -- destination off the exhibitor's order card.
    v_source.is_day_of_show, v_source.entry_source, v_source.registration_id,
    v_note, p_entry_id
  );

  -- Deliberately does NOT touch the source's `special_requests`: the FK above is
  -- the lineage, and that column is where a secretary writes "reactive dog,
  -- needs the ramp".
  UPDATE public.entries
  SET entry_status = 'moved'
  WHERE id = p_entry_id;

  RETURN p_new_entry_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reverse_move_up_entry(
  p_destination_entry_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_dest             public.entries%ROWTYPE;
  v_source            public.entries%ROWTYPE;
  v_restored_status   text;
  v_restored_check_in text;
BEGIN
  SELECT * INTO v_dest
  FROM public.entries
  WHERE id = p_destination_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That entry no longer exists.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_manage_show(v_dest.show_id) THEN
    RAISE EXCEPTION 'You do not have permission to move entries in this show.'
      USING ERRCODE = '42501';
  END IF;

  IF v_dest.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'That entry has already been removed.' USING ERRCODE = '22023';
  END IF;

  IF v_dest.moved_from_entry_id IS NULL THEN
    RAISE EXCEPTION 'This entry was not created by a move-up, so there is nothing to move back.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.entries successor
    WHERE successor.moved_from_entry_id = v_dest.id
      AND successor.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'This move-up has a newer successor and cannot be reversed.'
      USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_dest.is_scored, false)
     OR COALESCE(v_dest.is_in_ring, false)
     OR v_dest.scoring_started_at IS NOT NULL
     OR v_dest.ring_entry_time IS NOT NULL
     OR COALESCE(v_dest.result_status, 'pending') <> 'pending'
     OR v_dest.final_placement IS NOT NULL
     OR COALESCE(v_dest.points_earned, 0) <> 0
     OR COALESCE(v_dest.search_time_seconds, 0) <> 0
     OR COALESCE(v_dest.area1_time_seconds, 0) <> 0
     OR COALESCE(v_dest.area2_time_seconds, 0) <> 0
     OR COALESCE(v_dest.area3_time_seconds, 0) <> 0
     OR COALESCE(v_dest.area4_time_seconds, 0) <> 0
     OR COALESCE(v_dest.total_faults, 0) <> 0
     OR COALESCE(v_dest.total_correct_finds, 0) <> 0
     OR COALESCE(v_dest.total_score, 0) <> 0
     OR COALESCE(v_dest.total_incorrect_finds, 0) <> 0
     OR COALESCE(v_dest.no_finish_count, 0) <> 0
     OR COALESCE(v_dest.points_possible, 0) <> 0
     OR v_dest.scoring_completed_at IS NOT NULL
     OR v_dest.check_in_status IN ('in-ring', 'completed') THEN
    RAISE EXCEPTION 'This run has already started, so the move-up can no longer be reversed.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_source
  FROM public.entries
  WHERE id = v_dest.moved_from_entry_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_source.deleted_at IS NOT NULL
     OR COALESCE(v_source.entry_status, '') <> 'moved' THEN
    RAISE EXCEPTION 'The original entry is no longer there to restore.'
      USING ERRCODE = '22023';
  END IF;

  IF v_source.show_id IS DISTINCT FROM v_dest.show_id
     OR NOT public.can_manage_show(v_source.show_id) THEN
    RAISE EXCEPTION 'The original entry is no longer there to restore.'
      USING ERRCODE = '22023';
  END IF;

  v_restored_status := CASE
    WHEN COALESCE(v_dest.entry_status, '') IN ('', 'moved') THEN 'confirmed'
    ELSE v_dest.entry_status
  END;

  v_restored_check_in := CASE
    WHEN v_dest.check_in_status = 'checked-in'
      AND (SELECT trial_id FROM public.classes WHERE id = v_source.class_id)
          IS NOT DISTINCT FROM
          (SELECT trial_id FROM public.classes WHERE id = v_dest.class_id)
      AND COALESCE(v_source.check_in_status, 'no-status') = 'no-status'
    THEN 'checked-in'
    ELSE v_source.check_in_status
  END;

  UPDATE public.entries
  SET entry_status = v_restored_status,
      check_in_status = v_restored_check_in
  WHERE id = v_source.id;

  UPDATE public.entries
  SET deleted_at = now()
  WHERE id = p_destination_entry_id;

  RETURN v_source.id;
END;
$function$;
REVOKE ALL ON FUNCTION public.move_up_entry(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_up_entry(uuid, uuid, uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.reverse_move_up_entry(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_move_up_entry(uuid) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
