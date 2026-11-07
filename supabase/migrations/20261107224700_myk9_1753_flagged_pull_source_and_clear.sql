-- MYK9-1753: the Check-in desk shows who flagged a pull, and the secretary can
-- Clear the flag back to the check-in it overwrote.
--
-- A 'pulled' check-in on an entry that is still entered is only a flag: an
-- exhibitor (self_checkin_entry) or ringside staff set it, and nothing about
-- money changed. The desk shows it as "Flagged pulled" (MYK9-1749); the
-- secretary either confirms it as the real Pull (the existing desk Pull,
-- scratchShowMapEntry) or clears it.
--
-- 1. entries.check_in_pulled_by ('exhibitor' | 'staff', NULL when not pulled).
--    Server-stamped by the MYK9-1396 trigger, the one place that sees every
--    check-in writer (desk, Show Map, ringside_update_entry, bulk updates,
--    queued offline replay, self_checkin_entry). self_checkin_entry marks its
--    own UPDATE with a transaction-local setting; every other writer is staff,
--    because ringside_update_entry and the entries UPDATE policy admit only
--    show officials. Like check_in_status_before_pull it is always recomputed
--    from OLD, so a caller can never plant a value. Readable by authenticated
--    (the desk shows it); anon is revoked explicitly.
--
-- 2. public.clear_flagged_pull(entry_id): show managers only (site admin,
--    trial secretary, club admin, the same tier ringside_update_entry calls a
--    manager). Moves a still-entered, unscored 'pulled' flag back to the
--    remembered check-in (ring states as checked-in, as Accept restores them;
--    nothing remembered = no-status). The prior stays server-only: the client
--    never reads or sends it. Returns the restored status.
--
-- self_checkin_entry is copied from its latest definition
-- (20260909174329_fix_self_checkin_visibility_join.sql); the only change is
-- the source marker around the UPDATE.

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS check_in_pulled_by text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'entries_check_in_pulled_by_check'
      AND conrelid = 'public.entries'::regclass
  ) THEN
    ALTER TABLE public.entries
      ADD CONSTRAINT entries_check_in_pulled_by_check
      CHECK (check_in_pulled_by IS NULL OR check_in_pulled_by IN ('exhibitor', 'staff'));
  END IF;
END $$;

COMMENT ON COLUMN public.entries.check_in_pulled_by IS
  'MYK9-1753: who set check_in_status to pulled: exhibitor (self_checkin_entry) or staff. NULL when not pulled. Written only by trg_entries_check_in_before_pull.';

REVOKE ALL (check_in_pulled_by) ON public.entries FROM anon;
GRANT SELECT (check_in_pulled_by) ON public.entries TO authenticated;

CREATE OR REPLACE FUNCTION private.entries_stamp_check_in_before_pull()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.check_in_status_before_pull := NULL;
    NEW.check_in_pulled_by := NULL;
    RETURN NEW;
  END IF;

  IF NEW.check_in_status = 'pulled'
     AND OLD.check_in_status IS DISTINCT FROM 'pulled' THEN
    NEW.check_in_status_before_pull := OLD.check_in_status;
    NEW.check_in_pulled_by := CASE
      WHEN current_setting('myk9.check_in_source', true) = 'exhibitor' THEN 'exhibitor'
      ELSE 'staff'
    END;
  ELSIF OLD.check_in_status = 'pulled'
     AND NEW.check_in_status IS DISTINCT FROM 'pulled' THEN
    IF OLD.entry_status = 'scratched'
       AND NEW.entry_status IS DISTINCT FROM 'scratched'
       AND NEW.check_in_status = 'no-status'
       AND OLD.check_in_status_before_pull IS NOT NULL THEN
      NEW.check_in_status := CASE
        WHEN OLD.check_in_status_before_pull IN ('at-gate', 'come-to-gate', 'in-ring')
          THEN 'checked-in'
        ELSE OLD.check_in_status_before_pull
      END;
    END IF;
    NEW.check_in_status_before_pull := NULL;
    NEW.check_in_pulled_by := NULL;
  ELSE
    NEW.check_in_status_before_pull := OLD.check_in_status_before_pull;
    NEW.check_in_pulled_by := OLD.check_in_pulled_by;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.entries_stamp_check_in_before_pull() IS
  'MYK9-1396/1753: sole writer of entries.check_in_status_before_pull and check_in_pulled_by. Stamps OLD.check_in_status and the source on a move to pulled; on a move off pulled restores the prior when the UPDATE un-scratches and writes no-status (ring states as checked-in), then clears both; otherwise keeps OLD. Caller-supplied values are discarded.';

REVOKE ALL ON FUNCTION private.entries_stamp_check_in_before_pull()
  FROM PUBLIC, anon, authenticated, service_role;

-- Fire on the new column too, so an UPDATE naming only it is still recomputed.
DROP TRIGGER IF EXISTS trg_entries_check_in_before_pull ON public.entries;
CREATE TRIGGER trg_entries_check_in_before_pull
  BEFORE UPDATE OF check_in_status, check_in_status_before_pull, check_in_pulled_by
  ON public.entries
  FOR EACH ROW
  EXECUTE FUNCTION private.entries_stamp_check_in_before_pull();

create or replace function public.self_checkin_entry(
  p_entry_id uuid,
  p_new_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_person_id uuid;
  v_allowed_statuses text[] := array[
    'checked-in', 'conflict', 'pulled', 'at-gate', 'no-status'
  ];
begin
  if p_new_status is null or not p_new_status = any(v_allowed_statuses) then
    raise exception 'Status % is not allowed for self-check-in', p_new_status;
  end if;

  select p.id
    into v_person_id
    from public.people p
   where p.auth_user_id = (select auth.uid())
   limit 1;

  if v_person_id is null then
    raise exception 'Not authorized: caller is not linked to a person record';
  end if;

  -- MYK9-1753: the check-in trigger records an exhibitor's Pulled as theirs.
  perform set_config('myk9.check_in_source', 'exhibitor', true);

  -- The UPDATE target is visible to a correlated EXISTS subquery, but not
  -- inside the ON clauses of the UPDATE's own FROM join tree (SQLSTATE 42P01).
  update public.entries e
     set check_in_status = p_new_status,
         updated_at = now()
   where e.id = p_entry_id
     and exists (
       select 1
       from public.dogs d
       left join public.classes c on c.id = e.class_id
       left join public.trials t on t.id = coalesce(c.trial_id, e.trial_id)
       left join public.show_visibility_settings show_vis
         on show_vis.show_id = coalesce(e.show_id, t.show_id)
       left join public.trial_visibility_overrides trial_vis
         on trial_vis.trial_id = coalesce(c.trial_id, e.trial_id)
       left join public.class_visibility_overrides class_vis
         on class_vis.class_id = e.class_id
       where d.id = e.dog_id
         and (
           e.handler_id = v_person_id
           or d.owner_id = v_person_id
           or d.co_owner_id = v_person_id
         )
         and coalesce(
           class_vis.self_checkin_enabled,
           trial_vis.self_checkin_enabled,
           show_vis.self_checkin_enabled,
           true
         )
     );

  if not found then
    raise exception 'Not authorized: caller does not own entry % or self check-in is disabled', p_entry_id;
  end if;

  perform set_config('myk9.check_in_source', '', true);
end;
$func$;

revoke all on function public.self_checkin_entry(uuid, text) from public, anon;
grant execute on function public.self_checkin_entry(uuid, text) to authenticated;

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
