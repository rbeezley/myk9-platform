-- MYK9-681: email notifications for access requests, built on a job queue.
--
-- The first version sent these emails from the browser after the request or
-- the decision had saved (removed from PR #2420). Two ways to lose an email:
-- the tab closes or the connection drops before the call, and a request the
-- signup trigger creates never passes through the page at all. Richard's
-- decision on the issue (2026-09-24): a database job queue.
--
-- 1. public.access_request_email_jobs — one row per (request, event). An AFTER
--    trigger on each request table writes it in the SAME transaction as the
--    insert or the review, so the job exists exactly when the state change
--    does: whatever path made it (an RPC, the signup trigger, a site admin's
--    direct UPDATE) and whether or not a browser is still there. The unique
--    (request_kind, request_id, event) key makes every retry, refresh or
--    double review a no-op; an event can be queued once and only once.
--
--      request_kind  table                          reviewers
--      new_club      club_access_requests           site admins
--      role          role_requests                  club admins for a
--                                                   club-routed secretary ask,
--                                                   site admins otherwise
--      membership    club_membership_requests       club admins
--
--    The job names the event, not the recipients or the copy: the worker
--    (supabase/functions/send-access-request-emails) resolves both when it
--    sends, from the request row.
--
-- 2. claim_access_request_email_jobs / finish_access_request_email_job — the
--    worker's once-only claim and its result. A claim carries a fresh token
--    and a 10-minute lease; the finish is conditional on that token, so a
--    worker that lost its lease cannot overwrite a newer attempt. A failed
--    send goes back to 'pending' with a backoff (1, 4, 16, 64 minutes) and
--    becomes 'failed' after the fifth attempt. Recipients already reached are
--    kept in delivered_to, so a retry never emails them twice.
--
-- 3. request_access_request_email_dispatch + the 'access-request-emails' cron.
--    Same shape as the trial-packet crons (20260822190000): the Vault reads
--    stay inline in the cron command, where list_cron_vault_secret_refs() can
--    see them, and the job is scheduled only once its secret exists. It posts
--    only when a job is due, so the every-minute run is one indexed read.
--
-- Nothing here can roll back a request or a review because of email: the
-- trigger's only statement is an INSERT ... ON CONFLICT DO NOTHING into a
-- table with no foreign keys, and the send happens later, outside it.
--
-- No backfill: requests made before this migration do not get emails.
--
-- Behavioral coverage: supabase/tests/myk9_681_access_request_email_jobs_test.sql

BEGIN;

-- ============================================================================
-- 1. The queue
-- ============================================================================

CREATE TABLE public.access_request_email_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_kind text NOT NULL CHECK (request_kind IN ('new_club', 'role', 'membership')),
  -- No foreign key: the id points into one of three tables, named by
  -- request_kind. A job whose request was deleted finishes as 'skipped'.
  request_id uuid NOT NULL,
  event text NOT NULL CHECK (event IN ('submitted', 'approved', 'denied')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'skipped', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claim_token uuid,
  claimed_at timestamptz,
  -- Lower-cased addresses already emailed for this job. A retry skips them.
  delivered_to text[] NOT NULL DEFAULT '{}'::text[],
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_request_email_jobs_once UNIQUE (request_kind, request_id, event),
  CONSTRAINT access_request_email_jobs_claim_shape CHECK (
    (status = 'sending') = (claim_token IS NOT NULL AND claimed_at IS NOT NULL)
  )
);

COMMENT ON TABLE public.access_request_email_jobs IS
  'MYK9-681: access-request email jobs, one per (request, event). Written by triggers on club_access_requests, role_requests and club_membership_requests; sent by the send-access-request-emails edge function. No client access.';
COMMENT ON COLUMN public.access_request_email_jobs.delivered_to IS
  'Lower-cased recipient addresses already emailed for this job; a retry skips them.';
COMMENT ON COLUMN public.access_request_email_jobs.last_error IS
  'Why the most recent attempt failed. Kept after a later success so the history survives.';

-- The worker's two reads: due pending jobs, and 'sending' jobs whose lease ran out.
CREATE INDEX access_request_email_jobs_due_idx
  ON public.access_request_email_jobs (next_attempt_at)
  WHERE status = 'pending';
CREATE INDEX access_request_email_jobs_sending_idx
  ON public.access_request_email_jobs (claimed_at)
  WHERE status = 'sending';

ALTER TABLE public.access_request_email_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_request_email_jobs FORCE ROW LEVEL SECURITY;

-- REQUIRED, not tidy-up: this project's ALTER DEFAULT PRIVILEGES grant anon
-- (and authenticated) full CRUD on every new public table. No client role
-- reads or writes this table; the triggers and the worker RPCs are SECURITY
-- DEFINER, and the worker authenticates as service_role.
REVOKE ALL ON TABLE public.access_request_email_jobs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.access_request_email_jobs TO service_role;

CREATE POLICY access_request_email_jobs_deny_clients
  ON public.access_request_email_jobs
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ============================================================================
-- 2. Enqueue: one statement, idempotent, inside the caller's transaction
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enqueue_access_request_email_job(
  p_request_kind text,
  p_request_id uuid,
  p_event text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.access_request_email_jobs (request_kind, request_id, event)
  VALUES (p_request_kind, p_request_id, p_event)
  ON CONFLICT ON CONSTRAINT access_request_email_jobs_once DO NOTHING;
$$;

COMMENT ON FUNCTION public.enqueue_access_request_email_job(text, uuid, text) IS
  'MYK9-681: queue one access-request email event. A repeat of the same (kind, request, event) is a no-op.';

REVOKE ALL ON FUNCTION public.enqueue_access_request_email_job(text, uuid, text)
  FROM PUBLIC, anon, authenticated;

-- TG_ARGV[0] is the request_kind. Every request table carries id and status.
-- INSERT of a pending row = submitted; pending -> approved/denied = the
-- decision. Any other transition (a role request's 'cancelled', a re-save
-- that leaves status alone) queues nothing.
CREATE OR REPLACE FUNCTION public.enqueue_access_request_email_from_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'pending' THEN
      PERFORM public.enqueue_access_request_email_job(TG_ARGV[0], NEW.id, 'submitted');
    END IF;
  ELSIF OLD.status = 'pending' AND NEW.status IN ('approved', 'denied') THEN
    PERFORM public.enqueue_access_request_email_job(TG_ARGV[0], NEW.id, NEW.status);
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.enqueue_access_request_email_from_trigger() IS
  'MYK9-681: AFTER INSERT OR UPDATE OF status trigger on the three access-request tables. TG_ARGV[0] names the request kind.';

REVOKE ALL ON FUNCTION public.enqueue_access_request_email_from_trigger()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_club_access_requests_email_job ON public.club_access_requests;
CREATE TRIGGER trg_club_access_requests_email_job
  AFTER INSERT OR UPDATE OF status ON public.club_access_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_access_request_email_from_trigger('new_club');

DROP TRIGGER IF EXISTS trg_role_requests_email_job ON public.role_requests;
CREATE TRIGGER trg_role_requests_email_job
  AFTER INSERT OR UPDATE OF status ON public.role_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_access_request_email_from_trigger('role');

DROP TRIGGER IF EXISTS trg_club_membership_requests_email_job ON public.club_membership_requests;
CREATE TRIGGER trg_club_membership_requests_email_job
  AFTER INSERT OR UPDATE OF status ON public.club_membership_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_access_request_email_from_trigger('membership');

-- ============================================================================
-- 3. The worker's claim and finish
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_access_request_email_jobs(p_limit integer DEFAULT 25)
RETURNS SETOF public.access_request_email_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- A worker that died mid-send never finished its claim. After the lease
  -- the job is due again, or failed if that was its last attempt. Its
  -- delivered_to is kept, and Resend's idempotency key covers a send that
  -- landed but was never recorded.
  UPDATE public.access_request_email_jobs
  SET status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END,
      last_error = 'The previous attempt stopped before it recorded a result.',
      next_attempt_at = now(),
      claim_token = NULL,
      claimed_at = NULL,
      updated_at = now()
  WHERE status = 'sending'
    AND claimed_at < now() - interval '10 minutes';

  RETURN QUERY
  UPDATE public.access_request_email_jobs AS job
  SET status = 'sending',
      attempts = job.attempts + 1,
      claim_token = gen_random_uuid(),
      claimed_at = now(),
      updated_at = now()
  WHERE job.id IN (
    SELECT due.id
    FROM public.access_request_email_jobs AS due
    WHERE due.status = 'pending'
      AND due.next_attempt_at <= now()
    ORDER BY due.next_attempt_at, due.created_at
    LIMIT greatest(1, least(coalesce(p_limit, 25), 100))
    FOR UPDATE SKIP LOCKED
  )
  RETURNING job.*;
END;
$$;

COMMENT ON FUNCTION public.claim_access_request_email_jobs(integer) IS
  'MYK9-681: claim up to p_limit due access-request email jobs for one worker run. service_role only.';

REVOKE ALL ON FUNCTION public.claim_access_request_email_jobs(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_access_request_email_jobs(integer) TO service_role;

-- p_outcome: 'sent' (every recipient reached), 'skipped' (nothing to send:
-- the request is gone or nobody has an address), or 'retry' (some send
-- failed). Returns the job's new status, or NULL when the claim was not this
-- caller's any more (lease expired and another run took the job).
CREATE OR REPLACE FUNCTION public.finish_access_request_email_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_outcome text,
  p_delivered_to text[] DEFAULT '{}'::text[],
  p_error text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('sent', 'skipped', 'retry') THEN
    RAISE EXCEPTION 'Unknown access-request email outcome: %', p_outcome
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.access_request_email_jobs AS job
  SET delivered_to = ARRAY(
        SELECT DISTINCT lower(address)
        FROM unnest(job.delivered_to || coalesce(p_delivered_to, '{}'::text[])) AS address
        WHERE nullif(btrim(address), '') IS NOT NULL
        ORDER BY 1
      ),
      status = CASE
        WHEN p_outcome = 'sent' THEN 'sent'
        WHEN p_outcome = 'skipped' THEN 'skipped'
        WHEN job.attempts >= 5 THEN 'failed'
        ELSE 'pending'
      END,
      sent_at = CASE WHEN p_outcome = 'sent' THEN now() ELSE job.sent_at END,
      last_error = CASE
        WHEN p_outcome = 'sent' THEN job.last_error
        ELSE coalesce(nullif(btrim(p_error), ''), job.last_error, 'Email delivery failed.')
      END,
      next_attempt_at = CASE
        WHEN p_outcome = 'retry'
          THEN now() + make_interval(mins => (power(4, greatest(job.attempts, 1) - 1))::integer)
        ELSE job.next_attempt_at
      END,
      claim_token = NULL,
      claimed_at = NULL,
      updated_at = now()
  WHERE job.id = p_job_id
    AND job.status = 'sending'
    AND job.claim_token = p_claim_token
  RETURNING job.status INTO v_status;

  RETURN v_status;
END;
$$;

COMMENT ON FUNCTION public.finish_access_request_email_job(uuid, uuid, text, text[], text) IS
  'MYK9-681: record one worker attempt. A retry backs off 1/4/16/64 minutes and fails after the fifth attempt. service_role only.';

REVOKE ALL ON FUNCTION public.finish_access_request_email_job(uuid, uuid, text, text[], text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_access_request_email_job(uuid, uuid, text, text[], text)
  TO service_role;

-- ============================================================================
-- 4. The cron
-- ============================================================================

-- Credentials arrive as ARGUMENTS, read from Vault in the cron command, so
-- list_cron_vault_secret_refs() / audit_cron_vault_secrets() can see which
-- secrets this job depends on (see 20260822190000_trial_packet_cron.sql).
CREATE OR REPLACE FUNCTION public.request_access_request_email_dispatch(
  p_base_url text,
  p_secret text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF nullif(p_base_url, '') IS NULL OR nullif(p_secret, '') IS NULL THEN
    RAISE EXCEPTION 'Missing Vault secret: edge_function_base_url or access_request_email_cron_secret';
  END IF;

  -- Most minutes nothing is due; do not wake the edge function for nothing.
  IF NOT EXISTS (
    SELECT 1 FROM public.access_request_email_jobs
    WHERE status = 'pending' AND next_attempt_at <= now()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.access_request_email_jobs
    WHERE status = 'sending' AND claimed_at < now() - interval '10 minutes'
  ) THEN
    RETURN;
  END IF;

  -- The function authenticates on ACCESS_REQUEST_EMAIL_CRON_SECRET and builds
  -- its own service-role client, so no key travels here. pg_net dispatches
  -- from a background worker; a failed POST raises, the cron run records
  -- 'failed', and /admin/health's background-jobs check surfaces it.
  PERFORM net.http_post(
    url := p_base_url || '/send-access-request-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || p_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END;
$$;

COMMENT ON FUNCTION public.request_access_request_email_dispatch(text, text) IS
  'MYK9-681: cron entry point. Wakes send-access-request-emails when an access-request email job is due.';

REVOKE ALL ON FUNCTION public.request_access_request_email_dispatch(text, text)
  FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'access-request-emails';

-- Scheduled ONLY once its secret exists; otherwise the cron-vault-secrets
-- contract would go red and the job would raise every minute. Jobs queued
-- before the schedule exists simply wait for it.
DO $schedule$
BEGIN
  IF EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'access_request_email_cron_secret'
  ) THEN
    PERFORM cron.schedule(
      'access-request-emails',
      '* * * * *',
      $job$
      select public.request_access_request_email_dispatch(
        (select decrypted_secret from vault.decrypted_secrets where name = 'edge_function_base_url'),
        (select decrypted_secret from vault.decrypted_secrets where name = 'access_request_email_cron_secret')
      );
      $job$
    );
  ELSE
    RAISE WARNING '%',
      'access_request_email_cron_secret is not in Vault, so access-request-emails was NOT scheduled. '
      'Create it and the matching ACCESS_REQUEST_EMAIL_CRON_SECRET function secret, then re-run the '
      'cron.schedule call in 20260925054100_myk9_681_access_request_email_jobs.sql.';
  END IF;
END
$schedule$;

COMMIT;
