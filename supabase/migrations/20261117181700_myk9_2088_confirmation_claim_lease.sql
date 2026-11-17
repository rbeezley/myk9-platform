BEGIN;

-- MYK9-2088: a full-confirmation claim is a lease, not a stamp.
--
-- send-confirmation-email used to claim an entry by stamping confirmation_email_sent_at BEFORE
-- the send, and every candidate read requires that column to be null. A run that stopped between
-- the claim and the send (timeout, deploy, crash) left the entry stamped and unsent, so the
-- exhibitor never got the acceptance email. The claim is now
--   confirmation_claimed_until = now + 15 minutes
-- and confirmation_email_sent_at is stamped only AFTER the provider accepts. An entry is
-- claimable when it is unsent AND (never claimed OR its lease has run out). The function's
-- worst-case run is a few minutes (50 exhibitors per run, each send retried within seconds, and
-- an edge function is stopped well inside 15 minutes), so a live lease never expires under a
-- running send; a dead run's lease expires and the next run retries with the SAME Resend
-- idempotency key (entries + acceptance generations), which Resend dedupes for 24 hours.
--
-- Fence: a lease also dies when the entry's status changes. A re-acceptance (back to review, then
-- 'confirmed' again) therefore voids the old run's lease, so that run's stamp (which matches the
-- lease value it wrote) cannot mark the new acceptance sent, and the new generation is sent its
-- own email. The reminder (reminder_email_*) is separate and untouched.
--
-- Server-only state, the way MYK9-1963 receipt_email_* is: authenticated holds TABLE-level
-- UPDATE/INSERT on entries and a column REVOKE cannot narrow a table grant, so the column is
-- guarded by a BEFORE trigger (current_user anon/authenticated: INSERT gets NULL, UPDATE keeps
-- OLD; service_role and owner-run code pass). Column SELECT is not granted to authenticated and
-- anon is revoked explicitly. The column is in no view and no replication select list.
-- Historical confirmation_email_sent_at values are not touched.

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS confirmation_claimed_until timestamptz;

COMMENT ON COLUMN public.entries.confirmation_claimed_until IS
  'MYK9-2088: lease on the full confirmation send. Set (now + 15 minutes) when a run claims the entry, cleared when the provider accepts (sent_at is then stamped) or refuses. An entry with sent_at NULL and a lease in the past is an interrupted run: the next run claims it again and sends with the same idempotency key. Cleared by any entry_status change.';

REVOKE ALL (confirmation_claimed_until) ON public.entries FROM anon;

CREATE OR REPLACE FUNCTION private.entries_confirmation_claim_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.confirmation_claimed_until := NULL;
    ELSE
      NEW.confirmation_claimed_until := OLD.confirmation_claimed_until;
    END IF;
  END IF;

  -- A status change voids a lease still held for the old acceptance (the fence above).
  IF TG_OP = 'UPDATE' AND OLD.entry_status IS DISTINCT FROM NEW.entry_status THEN
    NEW.confirmation_claimed_until := NULL;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.entries_confirmation_claim_guard() IS
  'MYK9-2088: a client (anon/authenticated) cannot write entries.confirmation_claimed_until; any entry_status change clears the lease. service_role and owner-run code may write it.';

REVOKE ALL ON FUNCTION private.entries_confirmation_claim_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_entries_confirmation_claim_guard ON public.entries;
CREATE TRIGGER trg_entries_confirmation_claim_guard
  BEFORE INSERT OR UPDATE ON public.entries
  FOR EACH ROW
  EXECUTE FUNCTION private.entries_confirmation_claim_guard();

COMMIT;
