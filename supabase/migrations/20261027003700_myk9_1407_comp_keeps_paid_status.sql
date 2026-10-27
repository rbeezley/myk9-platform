-- MYK9-1407: a comp can never relabel collected money, and undo restores the
-- status the entry had before the comp.
--
-- Before this migration the client wrote the payment status itself: Comp sent
-- `payment_status = 'waived'` without reading the row, Undo sent a hard-coded
-- `'pending'`. On a PAID entry that turned collected money into "forgiven"
-- (no refund_requests row, nothing owed back) and Undo then showed the
-- exhibitor live debt with the payment erased. The online payment-status
-- guard (20260705200000) only guards moves INTO paid/refunded, so neither write was
-- refused.
--
-- The fix is a trigger, not an RPC, so EVERY writer of `comped` is guarded:
-- the Entry Management client, any direct PostgREST update, and future paths.
--
--   comped false -> true  Allowed only from an UNPAID status (pending, waived,
--                         NULL). Anything else (paid, refunded, and any value
--                         the domain may grow: paid_online, paid_by_cash,
--                         paid_by_check, partial_refund) raises SQLSTATE MKCMP
--                         and the row is untouched. Allowed: the old status is
--                         kept in payment_status_before_comp, payment_status
--                         becomes 'waived'.
--   comped true -> false  Only while the row still reads 'waived' (the comp
--                         is the last word on its money): payment_status :=
--                         the stored pre-comp status (pending when none was
--                         stored: rows comped before this column existed).
--                         If money moved the comped row since (the
--                         record_enrollment_payment entries cascade, a
--                         service_role webhook write, an INSERT with
--                         comped = true and a paid status, which the comp
--                         refusal never sees), payment_status keeps OLD's
--                         value, never the caller's: undo must not write
--                         pending over a payment or a refund. Either way the
--                         column is cleared.
--   anything else         payment_status_before_comp keeps its OLD value. No
--                         caller may write it: `authenticated` holds table-wide
--                         UPDATE on entries, so without this a caller could
--                         plant 'paid' and have Undo restore it, skipping the
--                         online-payment guard (an UPDATE that does not SET
--                         payment_status never fires the online
--                         payment-status guard of 20260705200000).
--
-- Undo either restores what the comp stored (only ever an unpaid status,
-- since the comp refuses every paid family status) over a 'waived' row, or
-- leaves the row's current status alone. It can never write paid or refunded,
-- and it can never overwrite them.
--
-- The trigger is `BEFORE UPDATE OF comped, payment_status_before_comp`, so the
-- ringside scoring hot path and every other entries update that touches
-- neither column never enters it. UPDATE OF matches the statement's SET list
-- (not columns another trigger changed), so the three cases above still hold:
-- a comp or undo SETs comped, and planting the remembered status SETs
-- payment_status_before_comp, which takes the ELSE branch and is discarded.
-- An UPDATE that names neither column cannot change either one, because no
-- other trigger on entries writes them.
--
-- Firing order (BEFORE UPDATE, alphabetical): auto_assign_armband_on_accept_
-- trigger, entries_version_increment, stamp_entry_withdrawn_at, trg_00_*,
-- trg_01_*, trg_entries_00_direct_write_gate, trg_entries_block_score_*,
-- trg_entries_capacity_override, then THIS trigger
-- (trg_entries_comp_payment_status), then trg_entries_handler_is_junior,
-- trg_entries_junior_fee, trg_entries_protect_payment_fields, the
-- 20260705200000 payment-status guard, trg_entries_refund_origin,
-- trg_restrict_entry_refund_*, update_entries_updated_at. None of the
-- earlier ones writes payment_status or comped. The later payment
-- triggers that declare `UPDATE OF payment_status` fire only when the
-- statement itself SETs payment_status (Postgres matches the target list, not
-- columns a BEFORE trigger changed); when an older client still sends
-- payment_status they see the value this trigger chose ('waived', the
-- restored unpaid status, or the row's unchanged current status), which
-- neither refuses nor stamps a refund origin.
-- trg_entries_desk_payment_ledger (AFTER) acts only on 'paid'. This trigger
-- never moves a row INTO paid; an undo on a row money already made paid keeps
-- it paid, unchanged, and that ledger insert is ON CONFLICT DO NOTHING.
--
-- Money rule: nothing here refunds or queues a refund. Refusing the comp keeps
-- the paid row as it was; a refund remains a person's action.
--
-- Rollback (follow-up migration): DROP TRIGGER trg_entries_comp_payment_status
-- ON public.entries; DROP FUNCTION private.entries_comp_payment_status();
-- ALTER TABLE public.entries DROP COLUMN payment_status_before_comp; and
-- restore the client writes of payment_status in compEntry/uncompEntry.

BEGIN;

-- The CHECK mirrors entries.payment_status's own domain (003_entries_and_
-- scoring.sql, never widened by a later migration: 'pending', 'paid',
-- 'refunded', 'waived'). Only the unpaid members are ever stored.
ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS payment_status_before_comp text
    CONSTRAINT entries_payment_status_before_comp_check
    CHECK (payment_status_before_comp IN ('pending', 'paid', 'refunded', 'waived'));

COMMENT ON COLUMN public.entries.payment_status_before_comp IS
  'MYK9-1407: payment_status the entry had when it was comped; restored on undo. Written only by trg_entries_comp_payment_status.';

-- Column grants, stated rather than inherited. No client reads this column
-- (the trigger owns the restore), so neither authenticated nor anon gets
-- SELECT. Per-column REVOKE only: a broad REVOKE drops other column grants.
-- `authenticated` keeps the table-wide UPDATE it already holds; the trigger
-- below discards anything a caller writes here.
REVOKE ALL (payment_status_before_comp) ON public.entries FROM anon;
REVOKE SELECT (payment_status_before_comp) ON public.entries FROM authenticated;
GRANT SELECT (payment_status_before_comp) ON public.entries TO service_role;

CREATE OR REPLACE FUNCTION private.entries_comp_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(NEW.comped, false) AND NOT COALESCE(OLD.comped, false) THEN
    -- Comp. Allow-list the unpaid statuses so a value the domain grows later
    -- is refused rather than relabelled.
    IF OLD.payment_status IS NOT NULL
       AND OLD.payment_status NOT IN ('pending', 'waived') THEN
      RAISE EXCEPTION 'comp_refused_paid_entry'
        USING ERRCODE = 'MKCMP',
              DETAIL = format('entry %s has payment_status %s', OLD.id, OLD.payment_status),
              HINT = 'Only an unpaid entry can be comped. Refund the payment instead.';
    END IF;
    NEW.payment_status_before_comp := COALESCE(OLD.payment_status, 'pending');
    NEW.payment_status := 'waived';
  ELSIF COALESCE(OLD.comped, false) AND NOT COALESCE(NEW.comped, false) THEN
    -- Undo. Restore from OLD, never from what the caller sent, and only over
    -- the comp's own 'waived': a status money wrote after the comp stands.
    IF OLD.payment_status IS NOT DISTINCT FROM 'waived' THEN
      NEW.payment_status := COALESCE(OLD.payment_status_before_comp, 'pending');
    ELSE
      NEW.payment_status := OLD.payment_status;
    END IF;
    NEW.payment_status_before_comp := NULL;
  ELSE
    NEW.payment_status_before_comp := OLD.payment_status_before_comp;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.entries_comp_payment_status() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_entries_comp_payment_status ON public.entries;
CREATE TRIGGER trg_entries_comp_payment_status
  BEFORE UPDATE OF comped, payment_status_before_comp
  ON public.entries
  FOR EACH ROW
  EXECUTE FUNCTION private.entries_comp_payment_status();

-- A caller can also plant the column on INSERT; nothing was comped through
-- this trigger yet, so it starts empty.
CREATE OR REPLACE FUNCTION private.entries_clear_payment_status_before_comp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.payment_status_before_comp := NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.entries_clear_payment_status_before_comp() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_entries_comp_payment_status_insert ON public.entries;
CREATE TRIGGER trg_entries_comp_payment_status_insert
  BEFORE INSERT
  ON public.entries
  FOR EACH ROW
  WHEN (NEW.payment_status_before_comp IS NOT NULL)
  EXECUTE FUNCTION private.entries_clear_payment_status_before_comp();

COMMIT;
