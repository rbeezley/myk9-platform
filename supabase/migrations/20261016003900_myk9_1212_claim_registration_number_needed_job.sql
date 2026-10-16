-- =============================================================================
-- MYK9-1212: claim a "registration number needed" email atomically.
--
-- send-lifecycle-email aims for exactly-once delivery of this email across
-- retries. It used to do so with several separate PostgREST reads and writes,
-- and a failure between any two of them stranded the request (supersede the old
-- job, die before the insert) or sent twice. Two cases stayed open:
--   1. A request that RECOVERED an earlier failed or stale job had no record of
--      doing so; once the lost-response retry found the job `sent` it inserted a
--      second email.
--   2. A retry of the request's OWN ready/failed job replayed it to the stored
--      address even after the owner's address was corrected.
--
-- This migration moves the decision into one SECURITY DEFINER function that runs
-- in ONE transaction, so there is no partial state to reason about.
--
--   1. public.show_lifecycle_email_job_requests: the tie between a send REQUEST
--      and the job that currently answers it, PRIMARY KEY (show_id, request_key).
--      Many requests may resolve to one job (A creates J, B recovers J, C
--      recovers J and sends it: A, B and C all keep finding J), so the tie is a
--      table, not a column on the job. A request key resolves to exactly one job
--      by construction (the primary key), and it is only ever:
--        * INSERTED when a request creates a job or recovers one (never
--          overwriting another request's tie);
--        * RE-POINTED, for that request alone, when its address changed and the
--          job was replaced. Other requests' ties to the superseded job stay, so
--          their retries find a skipped job and answer busy.
--      ON DELETE CASCADE removes ties with their job. Existing registration_number_needed
--      jobs are backfilled with one tie each from idempotency_key, which until now
--      WAS the request key for every job this action created.
--      Only this SECURITY DEFINER function and service_role touch the table: RLS is
--      enabled and forced with a deny-all policy for anon/authenticated, and every
--      API role is revoked explicitly (this project's default privileges would
--      otherwise grant anon full CRUD on a new table). No serial or sequence is
--      involved, so the relkind='S' trap does not apply.
--   2. claim_registration_number_needed_job(...) returns jsonb
--      {outcome: 'sent' | 'send' | 'busy', job_id, recovered}:
--        tie exists, job sent                       -> sent (same job, never a second email)
--        tie exists, ready/failed, same address     -> send that job (replay)
--        tie exists, ready newer than p_stale_before, new address -> busy (a send in
--                                                      flight; nothing written)
--        tie exists, failed or stale ready, new address -> supersede it, insert a
--                                                      fresh job, re-point this
--                                                      request's tie, send
--        tie exists, any other status               -> busy (replaced by a newer request)
--        no tie, but a job already carries the plain key (the previous handler made
--                 it)                               -> adopt it: insert its tie, then the
--                                                      tied-job rows above apply to it
--        no tie, a ready job newer than p_stale_before -> busy (a send in flight)
--        no tie, outstanding job at the same address   -> recover it: add a tie for this
--                                                      request, send, recovered = true
--        no tie, otherwise                          -> supersede every outstanding job,
--                                                      insert a new job and its tie, send
--      The "stale" cutoff is passed in (p_stale_before) so the handler's
--      NUMBER_NEEDED_STALE_SEND_MS stays the single definition.
--      idempotency_key: a first job keeps the handler's key (the request key); an
--      address-change replacement gets "<request key>:to:<uuid>" because the old
--      row still holds the request key and the column is globally unique. A retry
--      finds the replacement through its tie, never through the key text, so the
--      suffix need not be reproducible. A first job's plain key cannot already be
--      taken: the key embeds this show and entry, and a job holding it is adopted.
--      Rollout order: migration first is safe. Until the new function is deployed
--      the old handler keeps creating jobs on the plain key with no tie; the next
--      claim for that request adopts the job (lazy adoption), so a lost-response
--      retry cannot send twice. Edge function second.
--   3. Serialisation: an advisory transaction lock per entry (covers the first
--      insert, when no row exists to lock) plus SELECT ... FOR UPDATE on the rows
--      read. Under it a tie insert cannot conflict, so those inserts are plain: a
--      conflict would mean a bug and should be loud. The partial unique index
--      one_outstanding_number_needed (one ready/failed email per entry) still backs
--      it against writers outside this function; the handler maps its 23505 to busy.
--   4. Authorization stays in the handler (show-official check, step switch, held
--      verdict, current owner address). The function checks that the entry belongs
--      to p_show_id AND is not soft-deleted (it bypasses RLS as its owner, so it
--      restates the filter), and that the step belongs to p_show_id. It is
--      EXECUTE-able by service_role alone; the edge function uses the service
--      client. It never reads or writes any other step_type.
--
-- Grants: show_lifecycle_email_jobs is unchanged (no new column). The new table is
-- service_role only; anon and authenticated have no privilege.
--
-- Rollback: DROP FUNCTION public.claim_registration_number_needed_job(uuid, uuid,
-- uuid, text, text, text, text, text, text, uuid, timestamptz); DROP TABLE
-- public.show_lifecycle_email_job_requests; then deploy the previous
-- send-lifecycle-email (it never reads the tie table).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.show_lifecycle_email_job_requests (
  show_id uuid NOT NULL,
  request_key text NOT NULL,
  job_id uuid NOT NULL REFERENCES public.show_lifecycle_email_jobs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (show_id, request_key)
);

CREATE INDEX IF NOT EXISTS show_lifecycle_email_job_requests_job_id_idx
  ON public.show_lifecycle_email_job_requests (job_id);

ALTER TABLE public.show_lifecycle_email_job_requests ENABLE ROW LEVEL SECURITY;
-- FORCE so the migrations-only rebuild owner is subject to the policy too.
ALTER TABLE public.show_lifecycle_email_job_requests FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.show_lifecycle_email_job_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.show_lifecycle_email_job_requests TO service_role;

-- Deny-all disposition: no API role may ever read or write a tie; the SECURITY
-- DEFINER function (owner) and service_role (BYPASSRLS) are the only users.
CREATE POLICY show_lifecycle_email_job_requests_deny_all
  ON public.show_lifecycle_email_job_requests
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

INSERT INTO public.show_lifecycle_email_job_requests (show_id, request_key, job_id)
SELECT j.show_id, j.idempotency_key, j.id
  FROM public.show_lifecycle_email_jobs j
 WHERE j.step_type = 'registration_number_needed'
   AND j.idempotency_key LIKE 'show-lifecycle-email:%:registration_number_needed:entry:request-%'
ON CONFLICT (show_id, request_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_registration_number_needed_job(
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
  p_stale_before timestamptz
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
  v_repoint boolean := false;
  v_resolved boolean;
BEGIN
  IF v_email = '' OR coalesce(btrim(p_request_key), '') = '' THEN
    RAISE EXCEPTION 'MYK9-1212: recipient and request key are required'
      USING ERRCODE = '22023';
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

  -- Resolve the job this request answers: (1) its tie, else (2) a job the PREVIOUS
  -- handler created for it. Until the new edge function is deployed that handler
  -- still inserts jobs on the plain request key with no tie, so such a job is
  -- ADOPTED: its tie is inserted now, and the same rules then apply to it.
  SELECT j.* INTO v_tie
    FROM public.show_lifecycle_email_job_requests r
    JOIN public.show_lifecycle_email_jobs j ON j.id = r.job_id
   WHERE r.show_id = p_show_id AND r.request_key = p_request_key
     FOR UPDATE OF r, j;
  v_resolved := FOUND;

  IF NOT v_resolved THEN
    SELECT j.* INTO v_tie
      FROM public.show_lifecycle_email_jobs j
     WHERE j.idempotency_key = p_request_key
       AND j.show_id = p_show_id
       AND j.step_type = 'registration_number_needed'
       AND j.entry_id = p_entry_id
       FOR UPDATE;
    v_resolved := FOUND;
    IF v_resolved THEN
      INSERT INTO public.show_lifecycle_email_job_requests (show_id, request_key, job_id)
      VALUES (p_show_id, p_request_key, v_tie.id);
    END IF;
  END IF;

  IF v_resolved THEN
    IF v_tie.entry_id IS DISTINCT FROM p_entry_id
       OR v_tie.step_type <> 'registration_number_needed' THEN
      RAISE EXCEPTION 'MYK9-1212: request key belongs to another email' USING ERRCODE = '22023';
    END IF;
    IF v_tie.status = 'sent' THEN
      RETURN jsonb_build_object('outcome', 'sent', 'job_id', v_tie.id, 'recovered', false);
    END IF;
    IF v_tie.status NOT IN ('ready', 'failed') THEN
      -- Replaced since by a newer request: nothing of this one is left to send.
      RETURN jsonb_build_object('outcome', 'busy', 'job_id', null, 'recovered', false);
    END IF;
    IF lower(btrim(coalesce(v_tie.recipient_email, ''))) = v_email THEN
      RETURN jsonb_build_object('outcome', 'send', 'job_id', v_tie.id, 'recovered', false);
    END IF;
    -- A recent READY job is a send still awaiting the provider: replacing it would
    -- put a second email under a different provider key. Same guard as branch (b).
    IF v_tie.status = 'ready'
       AND NOT (v_tie.created_at IS NULL OR v_tie.created_at < p_stale_before) THEN
      RETURN jsonb_build_object('outcome', 'busy', 'job_id', null, 'recovered', false);
    END IF;
    -- The owner's address changed since: this job would go to a stale address.
    -- Supersede it and replace it; only THIS request's tie moves to the new job.
    -- Other requests' ties stay on the skipped job, so their retries answer busy.
    UPDATE public.show_lifecycle_email_jobs
       SET status = 'skipped', skipped_at = now(), updated_by = p_user_id
     WHERE id = v_tie.id;
    v_repoint := true;
    v_idem := p_request_key || ':to:' || gen_random_uuid()::text;
  ELSE
    -- (b) No tie and nothing to adopt. Look at this entry's outstanding email (at most one per entry).
    FOR v_row IN
      SELECT j.id, j.status, j.created_at, j.recipient_email
        FROM public.show_lifecycle_email_jobs j
       WHERE j.show_id = p_show_id
         AND j.step_type = 'registration_number_needed'
         AND j.entry_id = p_entry_id
         AND j.status IN ('ready', 'failed')
         FOR UPDATE
    LOOP
      v_supersede := v_supersede || v_row.id;
      IF v_row.status = 'ready'
         AND NOT (v_row.created_at IS NULL OR v_row.created_at < p_stale_before) THEN
        v_busy := true;
      END IF;
      IF v_same IS NULL
         AND lower(btrim(coalesce(v_row.recipient_email, ''))) = v_email THEN
        v_same := v_row.id;
      END IF;
    END LOOP;

    -- A recent READY job is a send in flight: never touch it.
    IF v_busy THEN
      RETURN jsonb_build_object('outcome', 'busy', 'job_id', null, 'recovered', false);
    END IF;

    -- A failed or stale one at the current address may already have reached the
    -- provider: recover it (replayed under its own key) and ADD a tie for THIS
    -- request. Every earlier request's tie to it stays, so they all still resolve.
    IF v_same IS NOT NULL THEN
      INSERT INTO public.show_lifecycle_email_job_requests (show_id, request_key, job_id)
      VALUES (p_show_id, p_request_key, v_same);
      RETURN jsonb_build_object('outcome', 'send', 'job_id', v_same, 'recovered', true);
    END IF;

    IF cardinality(v_supersede) > 0 THEN
      UPDATE public.show_lifecycle_email_jobs
         SET status = 'skipped', skipped_at = now(), updated_by = p_user_id
       WHERE id = ANY (v_supersede);
    END IF;
    -- The handler's key is the request key itself. No row can already carry it:
    -- the key embeds this show and entry, so any such row was adopted above.
    v_idem := p_request_key;
  END IF;

  INSERT INTO public.show_lifecycle_email_jobs (
    show_id, step_id, step_type, status, recipient_scope, entry_id,
    recipient_email, recipient_name, subject, body, secretary_note,
    idempotency_key, due_at, created_by, updated_by
  ) VALUES (
    p_show_id, p_step_id, 'registration_number_needed', 'ready', 'entry', p_entry_id,
    btrim(p_recipient_email), p_recipient_name, p_subject, p_body, p_secretary_note,
    v_idem, now(), p_user_id, p_user_id
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

  RETURN jsonb_build_object('outcome', 'send', 'job_id', v_new, 'recovered', false);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_registration_number_needed_job(
  uuid, uuid, uuid, text, text, text, text, text, text, uuid, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_registration_number_needed_job(
  uuid, uuid, uuid, text, text, text, text, text, text, uuid, timestamptz
) TO service_role;

COMMIT;
