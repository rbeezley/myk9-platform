-- MYK9-640: only the terminal live destination of a move-up may be reversed.
-- Once a later move-up supersedes that destination, reversing the intermediate
-- row would restore a stale class and soft-delete the row the dog currently
-- runs in.

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

  IF COALESCE(v_dest.entry_status, '') = 'moved' THEN
    RAISE EXCEPTION 'This move-up has since been superseded by another move-up, so it cannot be reversed here.'
      USING ERRCODE = '22023';
  END IF;

  -- A run that has STARTED can never be un-run. Not just "has a result":
  -- the dog standing in the ring with two area times recorded is mid-run, and
  -- soft-deleting the row being scored into would take the judge's work with it.
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

  -- The source is a second row, potentially in a second trial. Keep the same
  -- authorization boundary as the original function before either UPDATE.
  IF v_source.show_id IS DISTINCT FROM v_dest.show_id
     OR NOT public.can_manage_show(v_source.show_id) THEN
    RAISE EXCEPTION 'The original entry is no longer there to restore.'
      USING ERRCODE = '22023';
  END IF;

  -- Restore from the destination's own live state. The source kept its own
  -- check-in through the move; only a later checked-in destination state is
  -- carried back when the source has no check-in yet.
  v_restored_status := CASE
    WHEN COALESCE(v_dest.entry_status, '') = '' THEN 'confirmed'
    ELSE v_dest.entry_status
  END;

  v_restored_check_in := CASE
    WHEN v_dest.check_in_status = 'checked-in'
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

REVOKE ALL ON FUNCTION public.reverse_move_up_entry(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_move_up_entry(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reverse_move_up_entry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_move_up_entry(uuid) TO service_role;

COMMENT ON FUNCTION public.reverse_move_up_entry(uuid) IS
  'MYK9-640: undo a terminal move-up as ONE transaction; refuses an intermediate '
  'destination whose entry_status is moved, and refuses any destination whose '
  'run has started.';
