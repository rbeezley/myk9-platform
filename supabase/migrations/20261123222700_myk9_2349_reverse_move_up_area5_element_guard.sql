-- MYK9-2349: reverse_move_up_entry's "run has already started" guard also checks
-- area5_time_seconds and element_time_seconds.
--
-- 20261117163700 (MYK9-2122) restated the function from a body that predates
-- 20261116041700 (MYK9-2068), which added area5_time_seconds and
-- element_time_seconds (both writable through ringside_update_entry). The guard
-- listed area1..area4 only, so a destination holding just one of those two times
-- could be reversed and its partial timing discarded.
--
-- Copied from the latest definition (20261117163700) with signature, SECURITY
-- DEFINER, search_path, guards, grants and comment unchanged; the only change is
-- the two added terms in the started-run guard. No table, column, trigger or
-- grant changes; no money.
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
  v_status_before_move text;
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
     OR COALESCE(v_dest.area5_time_seconds, 0) <> 0
     OR COALESCE(v_dest.element_time_seconds, 0) <> 0
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

  -- MYK9-2122: the destination itself holds a waiting class change request (it
  -- was moved here, then the exhibitor asked to change again). Reversing now
  -- would carry its waiting status onto the source and soft-delete the row that
  -- holds the class asked for, so the request is answered first.
  IF COALESCE(v_dest.entry_status, '') IN ('move-up-requested', 'move_up_requested')
     AND v_dest.class_change_target_class_id IS NOT NULL THEN
    RAISE EXCEPTION 'This entry has a class change request waiting. Accept or decline it first.'
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

  -- MYK9-2122: a class change request was waiting when THIS move began. The
  -- status before the move comes from the capture trigger's history, never from
  -- leftover request columns (see the header). move_up_entry folded the request
  -- to 'confirmed' on the destination; undoing the move puts it back to waiting,
  -- with the class asked for still set. No history row: restores as before.
  SELECT h.previous_status
    INTO v_status_before_move
    FROM public.entry_status_history h
   WHERE h.entry_id = v_source.id
     AND h.new_status = 'moved'
   ORDER BY h.changed_at DESC, h.id DESC
   LIMIT 1;

  IF v_restored_status = 'confirmed'
     AND v_status_before_move IN ('move-up-requested', 'move_up_requested')
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
  'destination. When a class change request was waiting when the move began (the latest '
  'entry_status_history row moving the source to moved has previous_status '
  'move-up-requested, and its class_change_target_class_id is still set) and the '
  'destination is still ''confirmed'', the source goes back to '
  '''move-up-requested'' with its stored request intact. Refuses once the run has STARTED, '
  'while the destination itself holds a waiting class change request, or when a newer '
  'live successor already '
  'superseded the destination. Touches no money. Restates can_manage_show on BOTH the '
  'destination''s and the source''s show, and requires them to be the same show.';

NOTIFY pgrst, 'reload schema';
COMMIT;
