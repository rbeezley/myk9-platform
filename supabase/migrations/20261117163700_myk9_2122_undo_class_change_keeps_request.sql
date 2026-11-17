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
-- THE DISCRIMINATOR is the status the source had when THIS move began, recorded
-- on the source as it goes to 'moved': entries.status_before_move. Leftover
-- request columns are not enough. An entry accepted in place over a waiting
-- request ("Accept entry"), or one whose class change was undone before this
-- migration, is 'confirmed' while still holding move_up_requested and
-- class_change_target_class_id; a later ordinary Change class and Move back must
-- not reopen that old request. So the reversal restores 'move-up-requested' only
-- when:
--   * the destination would otherwise come back 'confirmed' (a destination since
--     withdrawn, scratched or marked absent restores from its own status, as
--     before);
--   * status_before_move is 'move-up-requested' (or the retired underscore
--     spelling); and
--   * class_change_target_class_id is still set (the class asked for).
-- A move made before this migration has a NULL status_before_move and restores
-- exactly as before ('confirmed'); nothing is inferred. No money figure takes
-- part.
--
-- It is deliberately NOT narrowed to "the destination is the class asked for": a
-- secretary's own Change class on an entry with a waiting request also folds the
-- request to 'confirmed', and undoing that move puts the unanswered request back.
--
-- WHO WRITES status_before_move. authenticated holds table-level INSERT and
-- UPDATE on public.entries (pre_rule_table_grants_test), so a column ACL cannot
-- stop a client planting a value: only a trigger can. One BEFORE trigger is
-- therefore the column's only writer, in the pattern of
-- check_in_status_before_pull (20261027014900, MYK9-1396):
--   * INSERT: NULL;
--   * entry_status goes INTO 'moved': OLD.entry_status;
--   * entry_status leaves 'moved' (the reversal's restore): NULL;
--   * anything else, including a direct write of the column: OLD's value.
-- That covers move_up_entry without redefining it (its only write to the source
-- is entry_status = 'moved'), and any other path into 'moved' records the truth
-- as well. The column gets no grant and is in neither entry-results view, so no
-- client reads it; anon is revoked explicitly.
--
-- CONSECUTIVE MOVES. A -> B by the secretary, then the exhibitor asks for C on B.
-- Undoing B -> A while B holds that waiting request would carry B's status onto A
-- and soft-delete B, the row holding the class asked for. The reversal refuses it
-- in words until the request is accepted, declined or taken back.
--
-- MONEY: none. The reversal still touches no payment column, entry_fee or
-- enrollment; the source is the paying entry and keeps everything it held.
--
-- reverse_move_up_entry is copied from the latest definition
-- (20261020161337_myk9_1265_cross_trial_check_in.sql) with the signature,
-- SECURITY DEFINER, search_path, guards, grants and comment kept; the body adds
-- the waiting-request refusal and the restore block.
BEGIN;

-- Fail fast rather than queue behind a long transaction holding entries.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS status_before_move text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'entries_status_before_move_check'
      AND conrelid = 'public.entries'::regclass
  ) THEN
    -- The value is always an OLD.entry_status, so entries_entry_status_check
    -- already bounds it; what this adds is that a move never records itself.
    ALTER TABLE public.entries
      ADD CONSTRAINT entries_status_before_move_check
      CHECK (status_before_move IS NULL OR status_before_move <> 'moved');
  END IF;
END $$;

COMMENT ON COLUMN public.entries.status_before_move IS
  'MYK9-2122: server-only. The entry_status this entry had when it was marked moved, so reverse_move_up_entry can tell an accepted class change request from leftover request columns. NULL when the entry is not moved, and for moves made before MYK9-2122. Written only by trg_entries_status_before_move.';

REVOKE ALL (status_before_move) ON public.entries FROM anon;

CREATE OR REPLACE FUNCTION private.entries_stamp_status_before_move()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status_before_move := NULL;
    RETURN NEW;
  END IF;

  IF NEW.entry_status = 'moved'
     AND OLD.entry_status IS DISTINCT FROM 'moved' THEN
    NEW.status_before_move := OLD.entry_status;
  ELSIF OLD.entry_status = 'moved'
     AND NEW.entry_status IS DISTINCT FROM 'moved' THEN
    NEW.status_before_move := NULL;
  ELSE
    NEW.status_before_move := OLD.status_before_move;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.entries_stamp_status_before_move() IS
  'MYK9-2122: sole writer of entries.status_before_move. Records OLD.entry_status when an entry goes to moved, clears it when the entry leaves moved, keeps OLD otherwise. A caller-supplied value is discarded.';

REVOKE ALL ON FUNCTION private.entries_stamp_status_before_move()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_entries_status_before_move ON public.entries;
CREATE TRIGGER trg_entries_status_before_move
  BEFORE UPDATE OF entry_status, status_before_move ON public.entries
  FOR EACH ROW
  EXECUTE FUNCTION private.entries_stamp_status_before_move();

DROP TRIGGER IF EXISTS trg_entries_status_before_move_insert ON public.entries;
CREATE TRIGGER trg_entries_status_before_move_insert
  BEFORE INSERT ON public.entries
  FOR EACH ROW
  EXECUTE FUNCTION private.entries_stamp_status_before_move();

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

  -- MYK9-2122: a class change request was waiting when THIS move began (the
  -- status recorded by trg_entries_status_before_move, never leftover request
  -- columns; see the header). move_up_entry folded it to 'confirmed' on the
  -- destination; undoing the move puts the request back to waiting, with the
  -- class asked for still set. A NULL record (a move made before MYK9-2122)
  -- restores as before.
  IF v_restored_status = 'confirmed'
     AND v_source.status_before_move IN ('move-up-requested', 'move_up_requested')
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
  'destination. When a class change request was waiting when the move began (the source''s '
  'status_before_move is move-up-requested and its class_change_target_class_id is still '
  'set) and the destination is still ''confirmed'', the source goes back to '
  '''move-up-requested'' with its stored request intact. Refuses once the run has STARTED, '
  'while the destination itself holds a waiting class change request, or when a newer '
  'live successor already '
  'superseded the destination. Touches no money. Restates can_manage_show on BOTH the '
  'destination''s and the source''s show, and requires them to be the same show.';

NOTIFY pgrst, 'reload schema';
COMMIT;
