-- =============================================================================
-- MYK9-1212 (redesign): one owned attempt per "registration number needed" job.
--
-- 20261016125300 added an in-flight lease (claimed_until) but gave it no owner:
-- a same-request replay renewed it, and the handler's sent/failed writes (and the
-- generic `send` loop, which sent these jobs with no claim at all) cleared it by
-- job id alone. An abandoned attempt finishing late could therefore overwrite the
-- outcome of the attempt that replaced it, or clear the live attempt's lease.
--
-- The rule now: a send is an ATTEMPT, and only its owner records the outcome.
--
--   active job      := claimed_until > now()
--
--   The lease ALONE decides "active"; attempt_id decides only who may record the
--   outcome. A job leased by the previous function version (20261016125300) has a
--   future claimed_until and a NULL attempt_id: it is a send in flight at push time,
--   so it must answer busy, never be recovered or superseded. Every lease this
--   function writes comes with an attempt_id, and every write that clears an attempt
--   (finish, supersede) clears the lease with it.
--
--   1. One active attempt per job. Every `send` answer mints a fresh attempt_id
--      (gen_random_uuid()) and stamps claimed_until = p_lease_until on the job.
--   2. Only the owner records the outcome: finish_registration_number_needed_attempt
--      is a compare-and-set on attempt_id. A loser's write changes nothing and
--      answers false (the handler logs it and reports the provider's real result).
--   3. Nothing touches an active job: no supersede, no recovery, no replay. A
--      same-request replay while the attempt is active answers `busy` (the browser
--      already handles busy), so a lost response never starts a second provider call.
--   4. An expired lease is an abandoned attempt: recoverable at the same address,
--      supersedable at a changed one. The handler's lease
--      (NUMBER_NEEDED_STALE_SEND_MS, 10 minutes) is longer than the edge function's
--      wall-clock cap, so an attempt cannot still be running once its lease expires.
--   5. The claim is the only send path for this step: the handler's generic `send`
--      action skips registration_number_needed jobs (reason send_on_demand).
--
--   decision table (claim_registration_number_needed_job)        answer
--   tied job sent                                                sent
--   tied job not ready/failed (superseded by another request)     busy
--   tied job ACTIVE (any address, including a same-request replay) busy, nothing written
--   tied job, same address, not active                           new attempt, send
--   tied job, changed address, not active                        supersede, insert replacement
--                                                                (with the new attempt),
--                                                                re-point THIS request's tie, send
--   no tie, any outstanding job ACTIVE                           busy, nothing written
--   no tie, outstanding job at the same address                  recover: add tie + new attempt,
--                                                                send, recovered = true
--   no tie, otherwise                                            supersede outstanding, insert
--                                                                first job with new attempt, send
--   Returns {outcome, job_id, attempt_id, recovered}.
--
-- Deleted from 20261016125300's body: lazy adoption of a plain-key job with no tie
-- (the pre-tie handler is long gone and the live table has no such rows), the
-- lease-less "recent ready job = busy" fallback (every job the claim writes now
-- carries an attempt), and the replay-renews-lease branch.
--
-- Signature and rollout. The argument TYPES are unchanged (twelve, the last two
-- timestamptz) but the names and order change, so the old function is DROPPED and
-- re-created: p_lease_until is now required and p_stale_before is a trailing,
-- IGNORED argument kept for one release. That keeps this migration safe to push
-- BEFORE the edge function deploy: the live handler (v16) calls with named
-- arguments p_stale_before and p_lease_until, which still resolve. It receives the
-- extra attempt_id and ignores it; its sent/failed writes clear claimed_until, so a
-- job it finishes is no longer active (attempt_id alone never makes a job active).
-- Remove p_stale_before in the release after the redeployed handler (which omits it).
-- The new handler must NOT be deployed before this migration: its parser requires
-- attempt_id on `send`.
--
-- attempt_id is a new column on a table with table-level grants, so the existing
-- ACL covers it unchanged (authenticated SELECT/UPDATE under the existing RLS,
-- service_role ALL; anon none). It is internal bookkeeping, not a secret. Note that
-- authenticated can therefore UPDATE attempt_id (and claimed_until) on rows the
-- table's RLS lets it update; tightening that with a column ACL is a filed follow-up.
--
-- Rollback: re-create the function from 20261016125300, DROP
-- finish_registration_number_needed_attempt, ALTER TABLE ... DROP COLUMN attempt_id,
-- redeploy the previous handler.
-- =============================================================================

BEGIN;

ALTER TABLE public.show_lifecycle_email_jobs ADD COLUMN IF NOT EXISTS attempt_id uuid;

DROP FUNCTION IF EXISTS public.claim_registration_number_needed_job(
  uuid, uuid, uuid, text, text, text, text, text, text, uuid, timestamptz, timestamptz
);

CREATE FUNCTION public.claim_registration_number_needed_job(
  p_show_id uuid,
  p_entry_id uuid,
  p_step_id uuid,
  p_request_key text,
  p_recipient_email text,
  p_recipient_name text,
  p_subject text,
  p_body text,
  p_secretary_note text,
  p_user_id uuid,
  p_lease_until timestamptz,
  -- Ignored. Kept one release so the pre-redesign handler's named call still resolves.
  p_stale_before timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_recipient_email, '')));
  v_tie public.show_lifecycle_email_jobs%ROWTYPE;
  v_row record;
  v_supersede uuid[] := ARRAY[]::uuid[];
  v_busy boolean := false;
  v_same uuid;
  v_idem text;
  v_new uuid;
  v_attempt uuid := gen_random_uuid();
  v_repoint boolean := false;
BEGIN
  IF v_email = '' OR coalesce(btrim(p_request_key), '') = '' THEN
    RAISE EXCEPTION 'MYK9-1212: recipient and request key are required'
      USING ERRCODE = '22023';
  END IF;
  -- An attempt without a live lease would be abandoned the moment it starts.
  IF p_lease_until IS NULL OR p_lease_until <= now() THEN
    RAISE EXCEPTION 'MYK9-1212: a future lease is required' USING ERRCODE = '22023';
  END IF;

  -- SECURITY DEFINER bypasses RLS: restate the entry's show scope and soft-delete filter.
  IF NOT EXISTS (
    SELECT 1 FROM public.entries e
     WHERE e.id = p_entry_id AND e.show_id = p_show_id AND e.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'MYK9-1212: entry does not belong to this show' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.show_lifecycle_email_steps s
     WHERE s.id = p_step_id
       AND s.show_id = p_show_id
       AND s.step_type = 'registration_number_needed'
  ) THEN
    RAISE EXCEPTION 'MYK9-1212: step does not belong to this show' USING ERRCODE = '22023';
  END IF;

  -- One claim per entry at a time, including the very first (no row to lock yet).
  PERFORM pg_advisory_xact_lock(
    hashtextextended('registration_number_needed:' || p_entry_id::text, 0)
  );

  SELECT j.* INTO v_tie
    FROM public.show_lifecycle_email_job_requests r
    JOIN public.show_lifecycle_email_jobs j ON j.id = r.job_id
   WHERE r.show_id = p_show_id AND r.request_key = p_request_key
     FOR UPDATE OF r, j;

  IF FOUND THEN
    IF v_tie.entry_id IS DISTINCT FROM p_entry_id
       OR v_tie.step_type <> 'registration_number_needed' THEN
      RAISE EXCEPTION 'MYK9-1212: request key belongs to another email' USING ERRCODE = '22023';
    END IF;
    IF v_tie.status = 'sent' THEN
      RETURN jsonb_build_object(
        'outcome', 'sent', 'job_id', v_tie.id, 'attempt_id', null, 'recovered', false);
    END IF;
    IF v_tie.status NOT IN ('ready', 'failed') THEN
      -- Replaced since by a newer request: nothing of this one is left to send.
      RETURN jsonb_build_object(
        'outcome', 'busy', 'job_id', null, 'attempt_id', null, 'recovered', false);
    END IF;
    -- A live lease (this version's attempt, or a pre-migration send) owns this job:
    -- answer busy and write nothing, even for a same-request replay (it would start a
    -- second provider call).
    IF v_tie.claimed_until > now() THEN
      RETURN jsonb_build_object(
        'outcome', 'busy', 'job_id', null, 'attempt_id', null, 'recovered', false);
    END IF;
    IF lower(btrim(coalesce(v_tie.recipient_email, ''))) = v_email THEN
      -- The earlier attempt is abandoned (or finished failed): a new attempt owns it.
      UPDATE public.show_lifecycle_email_jobs
         SET attempt_id = v_attempt, claimed_until = p_lease_until, updated_by = p_user_id
       WHERE id = v_tie.id;
      RETURN jsonb_build_object(
        'outcome', 'send', 'job_id', v_tie.id, 'attempt_id', v_attempt, 'recovered', false);
    END IF;
    -- The owner's address changed since: this job would go to a stale address.
    -- Supersede it and replace it; only THIS request's tie moves to the new job.
    -- Other requests' ties stay on the skipped job, so their retries answer busy.
    UPDATE public.show_lifecycle_email_jobs
       SET status = 'skipped', skipped_at = now(), updated_by = p_user_id,
           attempt_id = NULL, claimed_until = NULL
     WHERE id = v_tie.id;
    v_repoint := true;
    v_idem := p_request_key || ':to:' || gen_random_uuid()::text;
  ELSE
    -- No tie: look at this entry's outstanding email (at most one per entry).
    FOR v_row IN
      SELECT j.id, j.attempt_id, j.claimed_until, j.recipient_email
        FROM public.show_lifecycle_email_jobs j
       WHERE j.show_id = p_show_id
         AND j.step_type = 'registration_number_needed'
         AND j.entry_id = p_entry_id
         AND j.status IN ('ready', 'failed')
         FOR UPDATE
    LOOP
      v_supersede := v_supersede || v_row.id;
      IF v_row.claimed_until > now() THEN
        v_busy := true;
      END IF;
      IF v_same IS NULL
         AND lower(btrim(coalesce(v_row.recipient_email, ''))) = v_email THEN
        v_same := v_row.id;
      END IF;
    END LOOP;

    -- An active attempt is in flight: never touch it.
    IF v_busy THEN
      RETURN jsonb_build_object(
        'outcome', 'busy', 'job_id', null, 'attempt_id', null, 'recovered', false);
    END IF;

    -- An abandoned or failed job at the current address may already have reached
    -- the provider: recover it (replayed under its own key) and ADD a tie for THIS
    -- request. Every earlier request's tie to it stays, so they all still resolve.
    IF v_same IS NOT NULL THEN
      INSERT INTO public.show_lifecycle_email_job_requests (show_id, request_key, job_id)
      VALUES (p_show_id, p_request_key, v_same);
      UPDATE public.show_lifecycle_email_jobs
         SET attempt_id = v_attempt, claimed_until = p_lease_until, updated_by = p_user_id
       WHERE id = v_same;
      RETURN jsonb_build_object(
        'outcome', 'send', 'job_id', v_same, 'attempt_id', v_attempt, 'recovered', true);
    END IF;

    IF cardinality(v_supersede) > 0 THEN
      UPDATE public.show_lifecycle_email_jobs
         SET status = 'skipped', skipped_at = now(), updated_by = p_user_id,
             attempt_id = NULL, claimed_until = NULL
       WHERE id = ANY (v_supersede);
    END IF;
    -- The handler's key is the request key itself. The key embeds this show and
    -- entry, and only this function writes jobs for this step.
    v_idem := p_request_key;
  END IF;

  INSERT INTO public.show_lifecycle_email_jobs (
    show_id, step_id, step_type, status, recipient_scope, entry_id,
    recipient_email, recipient_name, subject, body, secretary_note,
    idempotency_key, due_at, created_by, updated_by, attempt_id, claimed_until
  ) VALUES (
    p_show_id, p_step_id, 'registration_number_needed', 'ready', 'entry', p_entry_id,
    btrim(p_recipient_email), p_recipient_name, p_subject, p_body, p_secretary_note,
    v_idem, now(), p_user_id, p_user_id, v_attempt, p_lease_until
  )
  RETURNING id INTO v_new;

  IF v_repoint THEN
    UPDATE public.show_lifecycle_email_job_requests
       SET job_id = v_new
     WHERE show_id = p_show_id AND request_key = p_request_key;
  ELSE
    INSERT INTO public.show_lifecycle_email_job_requests (show_id, request_key, job_id)
    VALUES (p_show_id, p_request_key, v_new);
  END IF;

  RETURN jsonb_build_object(
    'outcome', 'send', 'job_id', v_new, 'attempt_id', v_attempt, 'recovered', false);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_registration_number_needed_job(
  uuid, uuid, uuid, text, text, text, text, text, text, uuid, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_registration_number_needed_job(
  uuid, uuid, uuid, text, text, text, text, text, text, uuid, timestamptz, timestamptz
) TO service_role;

-- The owner, and only the owner, records an attempt's outcome. A compare-and-set on
-- attempt_id: an abandoned attempt finishing late, after another attempt took the
-- job (or after the job was superseded or sent), changes nothing and answers false.
-- It clears the attempt and its lease with the outcome.
CREATE FUNCTION public.finish_registration_number_needed_attempt(
  p_job_id uuid,
  p_attempt_id uuid,
  p_status text,
  p_email_log_id uuid,
  p_rendered_subject text,
  p_rendered_body text,
  p_rendered_secretary_note text,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owned boolean;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('sent', 'failed') THEN
    RAISE EXCEPTION 'MYK9-1212: an attempt finishes sent or failed' USING ERRCODE = '22023';
  END IF;
  IF p_attempt_id IS NULL THEN
    RAISE EXCEPTION 'MYK9-1212: attempt_id is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.show_lifecycle_email_jobs
     SET status = p_status,
         sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE sent_at END,
         email_log_id = p_email_log_id,
         rendered_subject = p_rendered_subject,
         rendered_body = p_rendered_body,
         rendered_secretary_note = p_rendered_secretary_note,
         updated_by = p_user_id,
         attempt_id = NULL,
         claimed_until = NULL
   WHERE id = p_job_id
     AND step_type = 'registration_number_needed'
     AND attempt_id = p_attempt_id
     AND status IN ('ready', 'failed')
  RETURNING true INTO v_owned;

  RETURN coalesce(v_owned, false);
END;
$$;

REVOKE ALL ON FUNCTION public.finish_registration_number_needed_attempt(
  uuid, uuid, text, uuid, text, text, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_registration_number_needed_attempt(
  uuid, uuid, text, uuid, text, text, text, uuid
) TO service_role;

COMMIT;
