-- MYK9-2113: the reminder goes by itself, two days before the show's first day.
--
-- send-confirmation-email gains scope {"scope":"reminder"}: one email per exhibitor per show to
-- every exhibitor with a live (accepted, not deleted) entry, on a published show, on the day two
-- days before its first day in the show's own time zone, between 08:00 and 11:59 local. The
-- secretary sets no date and presses nothing; a reminder missed that day is never sent late.
--
-- Two columns record it the way entries.confirmation_email_sent_at / _status (192) record the
-- full confirmation: reminder_email_sent_at is the claim stamped before the send (so two runs never
-- both send, and a crash never double-sends); reminder_email_status is 'sent' once it went and
-- 'failed' after a failed attempt, which an hourly run in the same morning window retries.
--
-- Grants: none added. Both columns are written and read only by the edge function (service_role,
-- which holds table-level privileges). authenticated reads entries through column-level grants
-- and anon has none, so leaving these two ungranted keeps them out of both roles' reach.
--
-- The job reads the same three Vault secrets as 'heritage-confirmation-emails'
-- (20260525160000_heritage_cron_vault.sql). It runs hourly at minute 41, offset from the other
-- jobs' minutes; the function itself decides which shows are due this hour.

BEGIN;

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS reminder_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_email_status text NOT NULL DEFAULT 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'entries_reminder_email_status_check'
      AND conrelid = 'public.entries'::regclass
  ) THEN
    ALTER TABLE public.entries
      ADD CONSTRAINT entries_reminder_email_status_check
      CHECK (reminder_email_status IN ('pending', 'sent', 'failed', 'covered'));
  END IF;
END $$;

REVOKE ALL (reminder_email_sent_at, reminder_email_status)
  ON public.entries FROM anon, authenticated;

COMMENT ON COLUMN public.entries.reminder_email_sent_at IS
  'MYK9-2113: stamped when the show reminder email is claimed for this entry, before it is sent. The send function skips a stamped entry, so overlapping runs never send twice. Cleared when the send fails. A stamp that is 30 minutes old on a pending entry is a crashed run: the next run may claim it again.';
COMMENT ON COLUMN public.entries.reminder_email_status IS
  'MYK9-2113: pending (never tried), sent, failed (tried and released; the next hourly run on the reminder morning retries), or covered (accepted after the exhibitor''s reminder for this show went out, so it is never sent a second one).';

SELECT cron.unschedule('exhibitor-reminder-emails')
WHERE EXISTS (
  SELECT 1
  FROM cron.job
  WHERE jobname = 'exhibitor-reminder-emails'
);

SELECT
  cron.schedule(
    'exhibitor-reminder-emails',
    '41 * * * *',
    $$
    do $exhibitor_reminder_cron$
    declare
      confirmation_email_url text;
      service_role_key text;
      function_secret text;
    begin
      select decrypted_secret
      into confirmation_email_url
      from vault.decrypted_secrets
      where name = 'heritage_confirmation_email_url';

      select decrypted_secret
      into service_role_key
      from vault.decrypted_secrets
      where name = 'heritage_confirmation_service_role_key';

      select decrypted_secret
      into function_secret
      from vault.decrypted_secrets
      where name = 'heritage_confirmation_secret';

      if nullif(confirmation_email_url, '') is null then
        raise exception 'Missing Vault secret: heritage_confirmation_email_url';
      end if;

      if nullif(service_role_key, '') is null then
        raise exception 'Missing Vault secret: heritage_confirmation_service_role_key';
      end if;

      if nullif(function_secret, '') is null then
        raise exception 'Missing Vault secret: heritage_confirmation_secret';
      end if;

      perform net.http_post(
        url := confirmation_email_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_role_key,
          'x-function-secret', function_secret
        ),
        body := '{"scope":"reminder"}'::jsonb
      );
    end
    $exhibitor_reminder_cron$;
    $$
  );

COMMIT;
