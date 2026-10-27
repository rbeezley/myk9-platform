-- MYK9-1396: an Accept after a Pull restores the check-in the Pull overwrote.
--
-- A Pull writes check_in_status='pulled'. Un-pulling (MYK9-1384) could only
-- restore the prior check-in from an in-memory Undo snapshot; a plain Accept
-- after a reload wrote 'no-status', so a dog that was checked in read "not
-- checked in" until re-checked by hand.
--
-- The SERVER owns both halves, so no client mirrors a derived column through
-- offline sync (an earlier client-side design on #3315 failed three sync
-- reviews). entries.check_in_status_before_pull is server-only state: no role
-- reads it, and ONE BEFORE trigger is its only writer.
--
-- Why a trigger and not per-writer stamps: check_in_status is written by the
-- secretary status builder, the narrow check-in desk / Show Map / ringside
-- path (CheckinStatusDialog offers 'pulled'), bulk status updates, and the
-- self_checkin_entry RPC. The trigger sees every writer, queued offline replay
-- included. self_checkin_entry is deliberately NOT redefined here.
--
-- Trigger rules (BEFORE UPDATE OF check_in_status, check_in_status_before_pull):
--   * moving to 'pulled' from a non-'pulled' value stores OLD.check_in_status;
--   * moving off 'pulled' clears it to NULL, and FIRST, when the same UPDATE
--     un-scratches the entry (entry_status leaves 'scratched') and writes
--     'no-status' (what every client's plain Accept writes), restores the
--     stored value instead. A moment-in-time ring state (at-gate, come-to-gate,
--     in-ring) restores as 'checked-in': nobody is at the gate any more. An
--     explicit non-'no-status' value (Undo's captured prior) is honoured as sent;
--   * anything else (including a re-Pull, pulled -> pulled) keeps OLD's value.
-- A caller can never plant a value: the stamp is always recomputed from OLD.
-- The trigger fires on UPDATE OF BOTH columns, because "UPDATE OF" fires when a
-- column is named in the SET list; naming check_in_status_before_pull alone
-- must also be caught. A separate BEFORE INSERT trigger clears it on new rows.
-- The function is SECURITY INVOKER with an empty search_path in schema private,
-- EXECUTE revoked from everyone (a trigger needs no EXECUTE grant at fire time).
--
-- Firing order (same-event BEFORE triggers fire alphabetically by name). The
-- other BEFORE UPDATE triggers on entries (updated_at, entries_version_increment,
-- stamp_entry_withdrawn_at, the refund / payment-field restrictors, the junior
-- fee, registration-number score block, deleted-parent and soft-delete guards)
-- read specific columns; none reads check_in_status_before_pull or branches on
-- check_in_status's value, so this trigger rewriting NEW.check_in_status on a
-- restore does not interact with them.
--
-- Same value domain as check_in_status (092_add_check_in_status.sql is the only
-- migration that defines that CHECK). NULL means "nothing remembered".
--
-- Grants: none. The column is not added to either entry-results view and gets
-- no column grant, so authenticated cannot read it. anon is revoked explicitly
-- (omitting a GRANT is not the same as keeping a role out).

-- Fail fast rather than queue behind a long transaction holding entries.
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS check_in_status_before_pull text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'entries_check_in_status_before_pull_check'
      AND conrelid = 'public.entries'::regclass
  ) THEN
    ALTER TABLE public.entries
      ADD CONSTRAINT entries_check_in_status_before_pull_check
      CHECK (check_in_status_before_pull IS NULL OR check_in_status_before_pull IN (
        'no-status', 'checked-in', 'conflict', 'pulled',
        'at-gate', 'come-to-gate', 'in-ring', 'completed'
      ));
  END IF;
END $$;

COMMENT ON COLUMN public.entries.check_in_status_before_pull IS
  'MYK9-1396: server-only. The check_in_status a Pull overwrote; an Accept that writes no-status while un-scratching restores it (ring states as checked-in). NULL when nothing is remembered. Written only by trg_entries_check_in_before_pull.';

REVOKE ALL (check_in_status_before_pull) ON public.entries FROM anon;

CREATE OR REPLACE FUNCTION private.entries_stamp_check_in_before_pull()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.check_in_status_before_pull := NULL;
    RETURN NEW;
  END IF;

  IF NEW.check_in_status = 'pulled'
     AND OLD.check_in_status IS DISTINCT FROM 'pulled' THEN
    NEW.check_in_status_before_pull := OLD.check_in_status;
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
  ELSE
    NEW.check_in_status_before_pull := OLD.check_in_status_before_pull;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.entries_stamp_check_in_before_pull() IS
  'MYK9-1396: sole writer of entries.check_in_status_before_pull. Stamps OLD.check_in_status on a move to pulled; on a move off pulled restores it when the UPDATE un-scratches and writes no-status (ring states as checked-in), then clears it; otherwise keeps OLD. A caller-supplied value is discarded.';

REVOKE ALL ON FUNCTION private.entries_stamp_check_in_before_pull()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_entries_check_in_before_pull ON public.entries;
CREATE TRIGGER trg_entries_check_in_before_pull
  BEFORE UPDATE OF check_in_status, check_in_status_before_pull ON public.entries
  FOR EACH ROW
  EXECUTE FUNCTION private.entries_stamp_check_in_before_pull();

DROP TRIGGER IF EXISTS trg_entries_check_in_before_pull_insert ON public.entries;
CREATE TRIGGER trg_entries_check_in_before_pull_insert
  BEFORE INSERT ON public.entries
  FOR EACH ROW
  EXECUTE FUNCTION private.entries_stamp_check_in_before_pull();
