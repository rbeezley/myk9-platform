BEGIN;

-- MYK9-1963 phase 2 (owner, 2026-11-14): the submit receipt and the pre-show confirmation are two
-- emails with two markers. entries.confirmation_email_* stays the pre-show confirmation's marker
-- (armband, judge, directions; sent on the trial's confirmation date to everyone). The receipt
-- sent at submit for every payment method (card, check, cash) gets these columns:
--   receipt_email_sent_at     set when the receipt is claimed/sent; NULL = not sent
--   receipt_email_status      pending (never tried) | sent | failed (released after a failed send)
--   receipt_email_message_id  the Resend message id of the receipt
--   receipt_email_attempted_at  last claim or release; the retry sweep waits a few minutes past it
--
-- Server-only state: written by service-role edge functions (send-registration-email,
-- stripe-webhook) and read by the scheduled retry sweep. Clients can neither read nor write it:
--   * READ: no column SELECT grant to authenticated (the base-table counts in
--     pre_rule_table_grants_test.sql do not move); anon is revoked explicitly.
--   * WRITE: authenticated holds TABLE-level INSERT/UPDATE on entries, and a column REVOKE cannot
--     narrow a table grant (20260926024300), so the columns are client-writable by grant alone.
--     trg_entries_receipt_email_server_only below neutralises that: for anon/authenticated it
--     keeps OLD on UPDATE and forces the defaults on INSERT. service_role and the owner-run RPCs
--     (current_user is neither) pass through. Same current_user test as 20261029043900.

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS receipt_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_email_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS receipt_email_message_id text,
  ADD COLUMN IF NOT EXISTS receipt_email_attempted_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'entries_receipt_email_status_check'
      AND conrelid = 'public.entries'::regclass
  ) THEN
    ALTER TABLE public.entries
      ADD CONSTRAINT entries_receipt_email_status_check
      CHECK (receipt_email_status IN ('pending', 'sent', 'failed'));
  END IF;
END $$;

COMMENT ON COLUMN public.entries.receipt_email_status IS
  'MYK9-1963: state of the submit receipt (not the pre-show confirmation, which is confirmation_email_status). pending = never tried, sent, failed = released after a failed send and eligible for the retry sweep.';

REVOKE ALL (receipt_email_sent_at, receipt_email_status, receipt_email_message_id, receipt_email_attempted_at)
  ON public.entries FROM anon;

-- The retry sweep reads only failed, unsent receipts; keep that read off a table scan.
CREATE INDEX IF NOT EXISTS entries_receipt_email_failed_idx
  ON public.entries (receipt_email_attempted_at)
  WHERE receipt_email_status = 'failed' AND receipt_email_sent_at IS NULL;

CREATE OR REPLACE FUNCTION private.entries_receipt_email_server_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.receipt_email_sent_at := NULL;
    NEW.receipt_email_status := 'pending';
    NEW.receipt_email_message_id := NULL;
    NEW.receipt_email_attempted_at := NULL;
  ELSE
    NEW.receipt_email_sent_at := OLD.receipt_email_sent_at;
    NEW.receipt_email_status := OLD.receipt_email_status;
    NEW.receipt_email_message_id := OLD.receipt_email_message_id;
    NEW.receipt_email_attempted_at := OLD.receipt_email_attempted_at;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.entries_receipt_email_server_only() IS
  'MYK9-1963: a client (anon/authenticated) cannot write entries.receipt_email_*; INSERT forces the defaults, UPDATE keeps OLD. service_role and owner-run code pass.';

REVOKE ALL ON FUNCTION private.entries_receipt_email_server_only() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_entries_receipt_email_server_only ON public.entries;
CREATE TRIGGER trg_entries_receipt_email_server_only
  BEFORE INSERT OR UPDATE ON public.entries
  FOR EACH ROW
  EXECUTE FUNCTION private.entries_receipt_email_server_only();

-- ---------------------------------------------------------------------------
-- Backfill: entries stamped by the OLD code. Until now the stripe-webhook stamped
-- confirmation_email_* when it sent the card receipt, so the scheduled pre-show sender skips
-- those entries forever. Runs as the migration owner (current_user is not anon/authenticated),
-- so trg_entries_receipt_email_server_only passes it through. Idempotent: each branch selects
-- only rows it has not yet moved.
--
--   1. Trial's confirmation_date is AFTER today (UTC; the scheduled sender matches the UTC date,
--      so it cannot have sent yet): any confirmation stamp can only be the receipt. Move it to
--      the receipt columns and give the pre-show email back (pending, unstamped).
--   2. Trial's confirmation_date is null or past (the pre-show send has already happened or
--      never will, so the stamp is ambiguous): copy the stamp into the receipt columns only,
--      never clear it, so the sweep cannot resend a receipt that probably went out.
--   A trial confirming TODAY is refused outright (see the guard in the function).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.backfill_entry_receipt_markers()
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- A trial confirming TODAY is the one case the two branches cannot tell apart: before the
  -- 09:00 UTC run its stamp is the receipt, after it the stamp may be the pre-show email. Rather
  -- than guess, refuse; the migration is then pushed on another day (none matched on 2026-11-14).
  IF EXISTS (
    SELECT 1
      FROM public.entries e
      JOIN public.trials t ON t.id = e.trial_id
     WHERE e.confirmation_email_sent_at IS NOT NULL
       AND e.receipt_email_sent_at IS NULL
       AND (t.confirmation_date AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date
  ) THEN
    RAISE EXCEPTION 'MYK9-1963 backfill: a stamped entry belongs to a trial whose confirmation date is today (UTC); push this migration on another day'
      USING errcode = 'P0001';
  END IF;

  UPDATE public.entries e
     SET receipt_email_sent_at = e.confirmation_email_sent_at,
         receipt_email_message_id = e.confirmation_email_message_id,
         receipt_email_status = 'sent',
         confirmation_email_sent_at = NULL,
         confirmation_email_message_id = NULL,
         confirmation_email_status = 'pending'
    FROM public.trials t
   WHERE t.id = e.trial_id
     AND e.confirmation_email_sent_at IS NOT NULL
     AND e.receipt_email_sent_at IS NULL
     AND t.confirmation_date >= (date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day') AT TIME ZONE 'UTC';

  UPDATE public.entries e
     SET receipt_email_sent_at = e.confirmation_email_sent_at,
         receipt_email_message_id = e.confirmation_email_message_id,
         receipt_email_status = 'sent'
   WHERE e.confirmation_email_sent_at IS NOT NULL
     AND e.receipt_email_sent_at IS NULL;
END;
$$;

COMMENT ON FUNCTION private.backfill_entry_receipt_markers() IS
  'MYK9-1963: one-time, idempotent move of receipt stamps off confirmation_email_*; a function only so the behavioral SQL test can run the same statements.';

REVOKE ALL ON FUNCTION private.backfill_entry_receipt_markers() FROM PUBLIC, anon, authenticated, service_role;

SELECT private.backfill_entry_receipt_markers();

COMMIT;
