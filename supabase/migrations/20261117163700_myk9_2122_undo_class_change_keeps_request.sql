-- MYK9-2122: Undo after Accept returns a class change request to waiting.
--
-- Accepting an exhibitor's class change request (MYK9-1978) is the move-up
-- machinery: move_up_entry inserts the destination with the request status folded
-- to 'confirmed' and marks the source 'moved'. The reversal then restored the
-- source from the destination's live status, so an Undo straight after Accept
-- brought the dog back as a plain 'confirmed' entry and the exhibitor's request
-- was gone from the secretary's Class changes list, the Show Desk pill and the
-- exhibitor's own entry. Owner decision 2026-11-17: Undo returns the request to
-- waiting.
--
-- THE DISCRIMINATOR is stored request data on the SOURCE, which move_up_entry
-- never touches (it writes only entry_status = 'moved' there):
--
--   move_up_requested IS TRUE                  set by request_own_entry_class_change;
--                                              cleared by the take-back
--                                              (cancel_own_entry_class_change) and by
--                                              the secretary's decline
--                                              (denyMoveUpRequestReplicated).
--   class_change_target_class_id IS NOT NULL   written only by
--                                              request_own_entry_class_change; cleared
--                                              by the take-back, left behind by a
--                                              decline.
--
-- Both hold only while a request was waiting when the move was made: a declined
-- request keeps its target but not its flag, and an older entry whose flag was
-- set some other way has no target. No money figure takes part.
--
-- It is deliberately NOT narrowed to "the destination is the class asked for".
-- A secretary's own Change class on an entry with a waiting request also folds
-- the request to 'confirmed' on the destination, and undoing that move must put
-- the unanswered request back too; otherwise the original bug lives on inside
-- that branch.
--
-- Only the status changes, and only where the reversal would otherwise restore
-- 'confirmed'. A destination that has since been withdrawn, scratched or marked
-- absent is restored from its own status exactly as before. The request columns
-- were never cleared, so the class asked for, the reason and the time come back
-- as the exhibitor wrote them. Ordinary move-ups (no waiting request) are
-- unchanged.
--
-- MONEY: none. The reversal still touches no payment column, entry_fee or
-- enrollment; the source is the paying entry and keeps everything it held.
--
-- Copied from the latest definition (20261020161337_myk9_1265_cross_trial_check_in.sql)
-- with the signature, SECURITY DEFINER, search_path, guards, grants and comment
-- kept; the only body change is the v_restored_status block.
BEGIN;

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

  -- MYK9-2122: a class change request was waiting when this move was made (see
  -- the header for why these two columns, and why not the destination class).
  -- move_up_entry folded it to 'confirmed' on the destination; undoing the move
  -- puts the request back to waiting instead of answering it.
  IF v_restored_status = 'confirmed'
     AND v_source.move_up_requested IS TRUE
     AND v_source.class_change_target_class_id IS NOT NULL THEN
    v_restored_status := 'move-up-requested';
  END IF;

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
REVOKE ALL ON FUNCTION public.reverse_move_up_entry(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_move_up_entry(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.reverse_move_up_entry(uuid) IS
  'MYK9-640/MYK9-1265/MYK9-2122: undo a move as ONE transaction -- restore the superseded source from '
  'the destination''s live entry_status, and from the SOURCE''s own check_in_status unless '
  'the dog was checked in on the destination after the move AND the destination is in the '
  'same trial (another trial''s check-in is never imported), then soft-delete the '
  'destination. When a class change request was waiting at the move (the source has '
  'move_up_requested AND a class_change_target_class_id) and the destination is still '
  '''confirmed'', the source goes back to ''move-up-requested'' with its stored request '
  'intact. Refuses once the run has STARTED, or when a newer live successor already '
  'superseded the destination. Touches no money. Restates can_manage_show on BOTH the '
  'destination''s and the source''s show, and requires them to be the same show.';

NOTIFY pgrst, 'reload schema';
COMMIT;
