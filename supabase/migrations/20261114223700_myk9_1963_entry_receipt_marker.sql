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
-- stripe-webhook) and read by the scheduled retry sweep. Clients never read it, so NO column
-- grant to authenticated (the base-table counts in pre_rule_table_grants_test.sql do not move);
-- anon is revoked explicitly. service_role keeps its table-level privileges.

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

COMMIT;
