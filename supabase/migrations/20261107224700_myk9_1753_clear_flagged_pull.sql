-- MYK9-1753: the secretary can Clear a flagged pull back to the check-in it
-- overwrote.
--
-- A 'pulled' check-in on an entry that is still entered is only a flag: an
-- exhibitor (self_checkin_entry) or ringside staff set it, and nothing about
-- money changed. The Check-in desk shows it as "Flagged pulled" (MYK9-1749);
-- the secretary either confirms it as the real Pull (the existing desk Pull,
-- scratchShowMapEntry) or clears it.
--
-- public.clear_flagged_pull(entry_id): show managers only (site admin, trial
-- secretary, club admin: the tier ringside_update_entry calls a manager).
-- Moves a still-entered, unscored 'pulled' flag back to the check-in the
-- MYK9-1396 trigger remembered (ring states as checked-in, as Accept restores
-- them; nothing remembered = no-status). The prior stays server-only: the
-- client never reads or sends it. The trigger then clears it, because the row
-- moves off 'pulled'. Returns the restored status.
--
-- Showing WHO flagged the pull was dropped from this change (owner,
-- 2026-11-07): the source could not be matched reliably to the replicated row
-- the desk shows. It is a follow-up of its own.

CREATE OR REPLACE FUNCTION public.clear_flagged_pull(p_entry_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_club_id uuid;
  v_status text;
BEGIN
  SELECT s.club_id
    INTO v_club_id
    FROM public.entries e
    JOIN public.shows s ON s.id = e.show_id
   WHERE e.id = p_entry_id;

  IF v_club_id IS NULL
     OR NOT (
       public.is_site_admin()
       OR public.is_trial_secretary(v_club_id)
       OR public.is_club_admin(v_club_id)
     ) THEN
    RAISE EXCEPTION 'Not authorized to clear a pull on entry %', p_entry_id
      USING errcode = '42501';
  END IF;

  UPDATE public.entries e
     SET check_in_status = CASE
           WHEN e.check_in_status_before_pull IN ('at-gate', 'come-to-gate', 'in-ring')
             THEN 'checked-in'
           WHEN e.check_in_status_before_pull IS NULL
             OR e.check_in_status_before_pull = 'pulled'
             THEN 'no-status'
           ELSE e.check_in_status_before_pull
         END,
         updated_at = now()
   WHERE e.id = p_entry_id
     AND e.check_in_status = 'pulled'
     AND e.entry_status IS DISTINCT FROM 'scratched'
     AND e.deleted_at IS NULL
     AND coalesce(e.is_scored, false) = false
  RETURNING e.check_in_status INTO v_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entry % is no longer flagged pulled', p_entry_id
      USING errcode = 'P0001';
  END IF;

  RETURN v_status;
END;
$$;

COMMENT ON FUNCTION public.clear_flagged_pull(uuid) IS
  'MYK9-1753: a show manager clears a still-entered pulled flag back to the check-in it overwrote (ring states as checked-in; nothing remembered = no-status). Returns the restored status.';

REVOKE ALL ON FUNCTION public.clear_flagged_pull(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_flagged_pull(uuid) TO authenticated;
