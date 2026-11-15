-- =============================================================================
-- MYK9-1999: tell the exhibitor each thing as soon as it is known.
--
-- 1. email_log.subject / email_log.body_html: what an exhibitor email said, written by the
--    service-role senders (send-registration-email, stripe-webhook, send-confirmation-email).
--    NULL for every row written before this migration and for senders that do not record it.
--
-- 2. get_show_email_content(p_email_log_id): the secretary reads what one Delivery history row
--    said. Same gate as get_show_email_delivery_history (can_manage_show_lifecycle_email on the
--    row's show) and the same email types. A lifecycle email (acceptance, waitlist) carries no
--    body_html; its rendered subject and text come from show_lifecycle_email_jobs.
--
-- 3. The 'heritage-confirmation-emails' job moves from daily (09:00 UTC) to hourly. It now
--    sends the full confirmation once an entry is accepted (no trials.confirmation_date), so a
--    day's wait is too long. Same job, same Vault-secret body as 20260525160000; no new job.
--    Minute 17 keeps it off the top of the hour.
--
-- Rollback (follow-up migration): DROP FUNCTION public.get_show_email_content(uuid);
-- ALTER TABLE public.email_log DROP COLUMN subject, DROP COLUMN body_html; and re-run the
-- cron.schedule from 20260525160000 with '0 9 * * *'.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.email_log
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS body_html text;

COMMENT ON COLUMN public.email_log.subject IS
  'MYK9-1999: the subject the exhibitor email was sent (or attempted) with. NULL before MYK9-1999.';
COMMENT ON COLUMN public.email_log.body_html IS
  'MYK9-1999: the HTML the exhibitor email was sent (or attempted) with, read through get_show_email_content. NULL before MYK9-1999.';

-- Written only by service-role senders; nothing on the client reads these columns directly.
REVOKE ALL (subject, body_html) ON public.email_log FROM anon;

CREATE OR REPLACE FUNCTION public.get_show_email_content(p_email_log_id uuid)
RETURNS TABLE (
  id uuid,
  show_id uuid,
  subject text,
  body_html text,
  body_text text,
  recipient_email text,
  attempted_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid;
BEGIN
  IF p_email_log_id IS NULL THEN
    RAISE EXCEPTION 'email_log_id is required' USING ERRCODE = '22023';
  END IF;

  SELECT log.show_id INTO v_show_id
    FROM public.email_log AS log
   WHERE log.id = p_email_log_id
     AND log.email_type IN (
       'registration_confirmation',
       'heritage_confirmation',
       'show_lifecycle_email',
       'entry_decision',
       'waitlist_notification',
       'registry_results_submission',
       'show_message'
     );

  -- An unknown row and a row of another show read the same: not authorized.
  IF v_show_id IS NULL OR NOT public.can_manage_show_lifecycle_email(v_show_id) THEN
    RAISE EXCEPTION 'not authorized to read this email' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    log.id,
    log.show_id,
    COALESCE(log.subject, job.rendered_subject, job.subject),
    log.body_html,
    CASE
      WHEN log.body_html IS NULL THEN COALESCE(job.rendered_body, job.body)
      ELSE NULL
    END,
    log.recipient_email,
    log.created_at
  FROM public.email_log AS log
  LEFT JOIN public.show_lifecycle_email_jobs AS job
    ON job.id = log.related_id
   AND log.email_type = 'show_lifecycle_email'
  WHERE log.id = p_email_log_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_show_email_content(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_show_email_content(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_show_email_content(uuid) IS
  'MYK9-1999: what one show-owned email said, for its Delivery history row. Gated by can_manage_show_lifecycle_email on the row''s show.';

COMMIT;

-- cron.schedule commits its own work, so it runs outside the transaction above.
SELECT cron.unschedule('heritage-confirmation-emails')
WHERE EXISTS (
  SELECT 1
  FROM cron.job
  WHERE jobname = 'heritage-confirmation-emails'
);

SELECT
  cron.schedule(
    'heritage-confirmation-emails',
    '17 * * * *',
    $$
    do $heritage_confirmation_cron$
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
        body := '{}'::jsonb
      );
    end
    $heritage_confirmation_cron$;
    $$
  );
