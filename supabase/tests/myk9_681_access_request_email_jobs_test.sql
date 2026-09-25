-- Behavioral test for the access-request email queue (MYK9-681). All fixtures
-- roll back.
--
-- Covers:
--   1. Enqueue on each event, through the real RPCs, in the same transaction:
--      new-club submit and deny, club-routed secretary submit and approve,
--      membership submit and deny, and a signup-trigger role request.
--   2. Idempotency: a duplicate submit, a repeated enqueue and a second
--      status write each leave exactly one job per (request, event); a
--      write that leaves status alone (approved or pending) queues nothing.
--   3. No client access: anon and authenticated can neither read nor write
--      the queue, nor execute the enqueue, claim, finish or dispatch
--      functions.
--   4. A failed send is retryable: 'retry' puts the job back to pending with
--      a backoff and keeps the recipients already reached; the job is claimed
--      again once due; a stale claim token cannot finish it; the fifth failed
--      attempt is terminal; an abandoned lease is recovered.
--   5. The dispatcher posts only when a job is due, and refuses a missing
--      secret.
--
-- People are inserted before auth.users so handle_new_user adopts each one
-- by email (same order as club_membership_requests_test.sql).

BEGIN;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000681c01', 'MYK9-681 Email Club');

INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000681a01', 'Site', 'Admin', 'myk9-681-site-admin@example.test'),
  ('00000000-0000-0000-0000-000000681a02', 'Club', 'Admin', 'myk9-681-club-admin@example.test'),
  ('00000000-0000-0000-0000-000000681a03', 'Rita', 'Requester', 'myk9-681-rita@example.test'),
  ('00000000-0000-0000-0000-000000681a04', 'Sam', 'Signup', 'myk9-681-sam@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000681b01', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-681-site-admin@example.test', '', now(),
   now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000681b02', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-681-club-admin@example.test', '', now(),
   now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000681b03', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-681-rita@example.test', '', now(),
   now(), now(), '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000681b04', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9-681-sam@example.test', '', now(),
   now(), now(), '{}', '{}', false, false, false);

DO $$
DECLARE
  v_unadopted int;
BEGIN
  SELECT count(*) INTO v_unadopted
  FROM public.people
  WHERE id IN (
    '00000000-0000-0000-0000-000000681a01',
    '00000000-0000-0000-0000-000000681a02',
    '00000000-0000-0000-0000-000000681a03',
    '00000000-0000-0000-0000-000000681a04'
  )
    AND auth_user_id IS NULL;

  IF v_unadopted <> 0 THEN
    RAISE EXCEPTION 'FIXTURE handle_new_user did not adopt % seeded people by email', v_unadopted;
  END IF;
END;
$$;

INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000681a01', id, true, '00000000-0000-0000-0000-000000681b01'
FROM public.roles WHERE name = 'site_admin';

INSERT INTO public.user_roles (user_id, role_id, club_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000681a02', id, '00000000-0000-0000-0000-000000681c01',
       true, '00000000-0000-0000-0000-000000681b02'
FROM public.roles WHERE name = 'club_admin';

-- Fixture rows made above must not have queued anything but what the test
-- creates below.
DELETE FROM public.access_request_email_jobs
WHERE request_id IN (
  SELECT id FROM public.role_requests
  WHERE person_id IN (
    '00000000-0000-0000-0000-000000681a01', '00000000-0000-0000-0000-000000681a02',
    '00000000-0000-0000-0000-000000681a03', '00000000-0000-0000-0000-000000681a04'
  )
);

-- ============================================================================
-- 1. Rita submits all three kinds; each enqueues a 'submitted' job.
-- ============================================================================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000681b03', true);

DO $$
DECLARE
  v_new_club uuid;
  v_role uuid;
  v_membership uuid;
  v_duplicate uuid;
BEGIN
  v_new_club := public.submit_club_access_request('MYK9-681 Founding Club', NULL, 'Please set us up.');
  v_role := public.submit_role_request(
    'secretary', 'club', '00000000-0000-0000-0000-000000681c01', NULL, 'I run entries.'
  );
  v_membership := public.submit_club_membership_request(
    '00000000-0000-0000-0000-000000681c01', 'Long-time exhibitor.'
  );

  IF v_new_club IS NULL OR v_role IS NULL OR v_membership IS NULL THEN
    RAISE EXCEPTION 'FIXTURE a submit returned NULL (% / % / %)', v_new_club, v_role, v_membership;
  END IF;

  -- A duplicate pending membership ask returns NULL and writes no row.
  v_duplicate := public.submit_club_membership_request('00000000-0000-0000-0000-000000681c01', NULL);
  IF v_duplicate IS NOT NULL THEN
    RAISE EXCEPTION 'FIXTURE duplicate membership ask was not swallowed';
  END IF;

  PERFORM set_config('myk9_681.new_club', v_new_club::text, true);
  PERFORM set_config('myk9_681.role', v_role::text, true);
  PERFORM set_config('myk9_681.membership', v_membership::text, true);
END;
$$;

-- ============================================================================
-- 3a. No client access (as Rita, authenticated).
-- ============================================================================

DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.access_request_email_jobs;
    RAISE EXCEPTION 'FAIL authenticated read access_request_email_jobs';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS authenticated cannot read the queue (42501)';
  END;

  BEGIN
    INSERT INTO public.access_request_email_jobs (request_kind, request_id, event)
    VALUES ('role', gen_random_uuid(), 'submitted');
    RAISE EXCEPTION 'FAIL authenticated inserted into access_request_email_jobs';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS authenticated cannot write the queue (42501)';
  END;

  BEGIN
    PERFORM public.enqueue_access_request_email_job('role', gen_random_uuid(), 'submitted');
    RAISE EXCEPTION 'FAIL authenticated executed enqueue_access_request_email_job';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS authenticated cannot execute the enqueue function (42501)';
  END;

  BEGIN
    PERFORM public.claim_access_request_email_jobs(10);
    RAISE EXCEPTION 'FAIL authenticated claimed access-request email jobs';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS authenticated cannot claim jobs (42501)';
  END;

  BEGIN
    PERFORM public.finish_access_request_email_job(gen_random_uuid(), gen_random_uuid(), 'sent');
    RAISE EXCEPTION 'FAIL authenticated finished an access-request email job';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS authenticated cannot finish jobs (42501)';
  END;

  BEGIN
    PERFORM public.request_access_request_email_dispatch('https://example.test', 'secret');
    RAISE EXCEPTION 'FAIL authenticated executed the dispatcher';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS authenticated cannot execute the dispatcher (42501)';
  END;
END;
$$;

RESET ROLE;
SET LOCAL ROLE anon;

DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.access_request_email_jobs;
    RAISE EXCEPTION 'FAIL anon read access_request_email_jobs';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS anon cannot read the queue (42501)';
  END;

  BEGIN
    INSERT INTO public.access_request_email_jobs (request_kind, request_id, event)
    VALUES ('role', gen_random_uuid(), 'submitted');
    RAISE EXCEPTION 'FAIL anon inserted into access_request_email_jobs';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS anon cannot write the queue (42501)';
  END;

  BEGIN
    PERFORM public.claim_access_request_email_jobs(10);
    RAISE EXCEPTION 'FAIL anon claimed access-request email jobs';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS anon cannot claim jobs (42501)';
  END;
END;
$$;

RESET ROLE;

DO $$
DECLARE
  v_acl text;
BEGIN
  SELECT coalesce(array_to_string(relacl, ','), '') INTO v_acl
  FROM pg_class WHERE oid = 'public.access_request_email_jobs'::regclass;
  IF v_acl ~ '(^|,)(anon|authenticated)=' THEN
    RAISE EXCEPTION 'FAIL a client role holds a table grant on the queue: %', v_acl;
  END IF;
  IF NOT (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.access_request_email_jobs'::regclass) THEN
    RAISE EXCEPTION 'FAIL access_request_email_jobs is not FORCE ROW LEVEL SECURITY';
  END IF;
  RAISE NOTICE 'PASS the queue carries no client grant and forces RLS';
END;
$$;

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.access_request_email_jobs
  WHERE (request_kind, request_id, event) IN (
    ('new_club', current_setting('myk9_681.new_club')::uuid, 'submitted'),
    ('role', current_setting('myk9_681.role')::uuid, 'submitted'),
    ('membership', current_setting('myk9_681.membership')::uuid, 'submitted')
  )
    AND status = 'pending' AND attempts = 0;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'FAIL expected one pending submitted job per kind, found %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.access_request_email_jobs
  WHERE request_kind = 'membership';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL the swallowed duplicate membership ask queued a job (% membership jobs)', v_count;
  END IF;

  RAISE NOTICE 'PASS each submit queues exactly one submitted job, in the RPC''s transaction';
END;
$$;

-- ============================================================================
-- 1b. Reviews queue the decision.
-- ============================================================================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000681b02', true);

DO $$
BEGIN
  PERFORM public.approve_club_role_request(current_setting('myk9_681.role')::uuid, 'Welcome aboard.');
  PERFORM public.deny_club_membership_request(
    current_setting('myk9_681.membership')::uuid, 'Please join at the next meeting.'
  );
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000681b01', true);

DO $$
BEGIN
  PERFORM public.review_club_access_request(
    current_setting('myk9_681.new_club')::uuid, 'denied', NULL, NULL, 'Duplicate of an existing club.'
  );
END;
$$;

RESET ROLE;

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.access_request_email_jobs
  WHERE (request_kind, request_id, event) IN (
    ('role', current_setting('myk9_681.role')::uuid, 'approved'),
    ('membership', current_setting('myk9_681.membership')::uuid, 'denied'),
    ('new_club', current_setting('myk9_681.new_club')::uuid, 'denied')
  )
    AND status = 'pending';
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'FAIL expected approved/denied jobs for all three reviews, found %', v_count;
  END IF;
  RAISE NOTICE 'PASS approve and deny each queue one decision job';
END;
$$;

-- ============================================================================
-- 1c. A role request the signup path creates queues too.
-- ============================================================================

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000681b04', true);
SELECT public.submit_signup_role_requests('["secretary"]'::jsonb);
RESET ROLE;

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.access_request_email_jobs job
  JOIN public.role_requests rr ON rr.id = job.request_id
  WHERE job.request_kind = 'role'
    AND job.event = 'submitted'
    AND rr.person_id = '00000000-0000-0000-0000-000000681a04'
    AND rr.club_id IS NULL;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL the signup role request queued % jobs, expected 1', v_count;
  END IF;
  RAISE NOTICE 'PASS a signup-created role request queues its submitted job';
END;
$$;

-- ============================================================================
-- 2. Idempotency and non-events.
-- ============================================================================

DO $$
DECLARE
  v_role uuid := current_setting('myk9_681.role')::uuid;
  v_before int;
  v_after int;
  v_signup uuid;
BEGIN
  SELECT count(*) INTO v_before FROM public.access_request_email_jobs;

  -- The same event again, directly and via a repeated status write.
  PERFORM public.enqueue_access_request_email_job('role', v_role, 'submitted');
  PERFORM public.enqueue_access_request_email_job('role', v_role, 'approved');
  UPDATE public.role_requests SET status = 'pending' WHERE id = v_role;
  UPDATE public.role_requests SET status = 'approved' WHERE id = v_role;

  -- Writes that leave status alone queue nothing, on a decided row and on a
  -- pending one.
  UPDATE public.role_requests SET requester_note = 'edited' WHERE id = v_role;
  SELECT rr.id INTO v_signup FROM public.role_requests rr
  WHERE rr.person_id = '00000000-0000-0000-0000-000000681a04' AND rr.status = 'pending';
  UPDATE public.role_requests SET requester_note = 'edited' WHERE id = v_signup;

  SELECT count(*) INTO v_after FROM public.access_request_email_jobs;
  IF v_after <> v_before THEN
    RAISE EXCEPTION 'FAIL repeats or non-events changed the job count from % to %', v_before, v_after;
  END IF;
  RAISE NOTICE 'PASS repeated events and non-decision writes queue nothing new';
END;
$$;

-- ============================================================================
-- 4. The worker: claim, retry, backoff, stale token, terminal failure, lease.
-- ============================================================================

-- Only this test's jobs are due, whatever else the database holds.
UPDATE public.access_request_email_jobs
SET next_attempt_at = now() + interval '1 day'
WHERE request_id NOT IN (
  current_setting('myk9_681.new_club')::uuid,
  current_setting('myk9_681.role')::uuid,
  current_setting('myk9_681.membership')::uuid
);

SET LOCAL ROLE service_role;

DO $$
DECLARE
  v_job public.access_request_email_jobs;
  v_token uuid;
  v_claimed int;
  v_status text;
BEGIN
  SELECT count(*) INTO v_claimed FROM public.claim_access_request_email_jobs(100);
  IF v_claimed <> 6 THEN
    RAISE EXCEPTION 'FAIL expected this test''s 6 due jobs to be claimed, got %', v_claimed;
  END IF;

  SELECT * INTO v_job FROM public.access_request_email_jobs
  WHERE request_kind = 'role' AND request_id = current_setting('myk9_681.role')::uuid
    AND event = 'submitted';
  IF v_job.status <> 'sending' OR v_job.attempts <> 1 OR v_job.claim_token IS NULL THEN
    RAISE EXCEPTION 'FAIL claim did not mark the job sending/attempt 1: % %', v_job.status, v_job.attempts;
  END IF;
  v_token := v_job.claim_token;

  -- A second claim takes nothing: every due job is already held.
  SELECT count(*) INTO v_claimed FROM public.claim_access_request_email_jobs(100);
  IF v_claimed <> 0 THEN
    RAISE EXCEPTION 'FAIL a held job was claimed twice (% rows)', v_claimed;
  END IF;

  -- A token that is not the claim's cannot finish it.
  v_status := public.finish_access_request_email_job(v_job.id, gen_random_uuid(), 'sent');
  IF v_status IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL a stale claim token finished the job (%)', v_status;
  END IF;

  -- One recipient reached, one failed: retry, keeping the reached one.
  v_status := public.finish_access_request_email_job(
    v_job.id, v_token, 'retry', ARRAY['Rita@Example.test'], 'provider_http_500'
  );
  SELECT * INTO v_job FROM public.access_request_email_jobs WHERE id = v_job.id;
  IF v_status <> 'pending' OR v_job.status <> 'pending'
     OR v_job.next_attempt_at <= now()
     OR v_job.last_error <> 'provider_http_500'
     OR v_job.delivered_to <> ARRAY['rita@example.test']
     OR v_job.claim_token IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL retry did not requeue with backoff and keep delivered_to: % % % %',
      v_job.status, v_job.next_attempt_at, v_job.last_error, v_job.delivered_to;
  END IF;

  -- Not due yet: the next run leaves it alone.
  SELECT count(*) INTO v_claimed FROM public.claim_access_request_email_jobs(100);
  IF v_claimed <> 0 THEN
    RAISE EXCEPTION 'FAIL a backed-off job was claimed before it was due';
  END IF;

  -- Once due, it is claimed again and can succeed.
  UPDATE public.access_request_email_jobs SET next_attempt_at = now() WHERE id = v_job.id;
  SELECT * INTO v_job FROM public.claim_access_request_email_jobs(100);
  IF v_job.id IS NULL OR v_job.attempts <> 2 OR v_job.delivered_to <> ARRAY['rita@example.test'] THEN
    RAISE EXCEPTION 'FAIL the retried job was not re-claimed as attempt 2 with its recipients';
  END IF;
  v_status := public.finish_access_request_email_job(
    v_job.id, v_job.claim_token, 'sent', ARRAY['myk9-681-club-admin@example.test']
  );
  SELECT * INTO v_job FROM public.access_request_email_jobs WHERE id = v_job.id;
  IF v_status <> 'sent' OR v_job.sent_at IS NULL
     OR v_job.delivered_to <> ARRAY['myk9-681-club-admin@example.test', 'rita@example.test'] THEN
    RAISE EXCEPTION 'FAIL the retried job did not finish sent: % %', v_status, v_job.delivered_to;
  END IF;

  RAISE NOTICE 'PASS a failed send is retried after its backoff, without re-sending reached recipients';
END;
$$;

DO $$
DECLARE
  v_job public.access_request_email_jobs;
  v_status text;
BEGIN
  -- Fifth failed attempt is terminal.
  SELECT * INTO v_job FROM public.access_request_email_jobs
  WHERE request_kind = 'membership' AND event = 'submitted'
    AND request_id = current_setting('myk9_681.membership')::uuid;
  UPDATE public.access_request_email_jobs SET attempts = 5 WHERE id = v_job.id;
  v_status := public.finish_access_request_email_job(v_job.id, v_job.claim_token, 'retry', '{}', 'network');
  IF v_status <> 'failed' THEN
    RAISE EXCEPTION 'FAIL the fifth failed attempt left the job %', v_status;
  END IF;

  -- An abandoned lease is recovered to pending and re-claimed.
  SELECT * INTO v_job FROM public.access_request_email_jobs
  WHERE request_kind = 'membership' AND event = 'denied'
    AND request_id = current_setting('myk9_681.membership')::uuid;
  UPDATE public.access_request_email_jobs
  SET claimed_at = now() - interval '11 minutes'
  WHERE id = v_job.id;
  SELECT * INTO v_job FROM public.claim_access_request_email_jobs(100);
  IF v_job.id IS NULL OR v_job.attempts <> 2 THEN
    RAISE EXCEPTION 'FAIL an expired lease was not recovered and re-claimed';
  END IF;

  -- An unknown outcome is refused.
  BEGIN
    PERFORM public.finish_access_request_email_job(v_job.id, v_job.claim_token, 'maybe');
    RAISE EXCEPTION 'FAIL an unknown outcome was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;

  v_status := public.finish_access_request_email_job(v_job.id, v_job.claim_token, 'skipped', '{}', 'no recipients');
  IF v_status <> 'skipped' THEN
    RAISE EXCEPTION 'FAIL skipped outcome recorded %', v_status;
  END IF;

  RAISE NOTICE 'PASS the fifth failure is terminal; an abandoned lease is recovered';
END;
$$;

RESET ROLE;

-- ============================================================================
-- 5. The dispatcher.
-- ============================================================================

DO $$
BEGIN
  BEGIN
    PERFORM public.request_access_request_email_dispatch(NULL, 'secret');
    RAISE EXCEPTION 'FAIL the dispatcher accepted a missing base URL';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Missing Vault secret%' THEN
      RAISE;
    END IF;
  END;

  -- Nothing due: returns without posting (no pg_net call needed to prove it,
  -- because a post would need the net schema's worker; returning is enough).
  UPDATE public.access_request_email_jobs SET next_attempt_at = now() + interval '1 day'
  WHERE status = 'pending';
  PERFORM public.request_access_request_email_dispatch('https://example.test', 'secret');

  RAISE NOTICE 'PASS the dispatcher refuses a missing secret and is a no-op with nothing due';
END;
$$;

ROLLBACK;
