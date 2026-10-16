-- =============================================================================
-- MYK9-1212 (residual): an in-flight lease on the "registration number needed" claim.
--
-- Codex nightly 2026-10-16: public.claim_registration_number_needed_job answered
-- `send` for a RECOVERED failed or stale-ready job (and for an own-request replay)
-- without recording that a send was now in flight. The freshness guard looked at the
-- job's ORIGINAL ready/created_at state, so a second request after the owner's
-- address changed could supersede the job and send a replacement while the
-- recovered provider call was still pending. Both emails completed, under two
-- different provider keys.
--
-- Fix: every `send` answer stamps show_lifecycle_email_jobs.claimed_until =
-- p_lease_until on the job it answers, in the same transaction. The handler
-- computes the lease from its NUMBER_NEEDED_STALE_SEND_MS (single-sourced) and
-- clears it (claimed_until = null) in the same update that records `sent` or
-- `failed`. A job is an ACTIVE send when claimed_until > now(), or (backward
-- compatibility, claimed_until IS NULL) when it is a ready job newer than
-- p_stale_before: the old "recent ready means busy" guard survives only for jobs
-- the pre-lease handler created, and is otherwise subsumed by the lease.
--
--   rule                                                       answer
--   tied job sent                                              sent
--   tied job, same request, same address (replay)              send, lease renewed
--       Allowed under an active lease: same provider key, address and stored text
--       collapse at the provider, and refusing would turn every lost-response retry
--       into 10 minutes of busy (a crash before the provider call leaves the lease).
--   tied job, changed address, ACTIVE                          busy, nothing written
--   tied job, changed address, lease expired or null           supersede + insert (lease on new job)
--   no tie, any outstanding job ACTIVE (any address)           busy, nothing written
--   no tie, outstanding job at the same address, not active    recover, tie, lease stamped
--   no tie, otherwise                                          supersede + insert (lease on new job)
--   an abandoned attempt (lease expired) recovers like today.
-- All other behaviour (advisory lock, ties, adoption, filters, grants) is unchanged.
--
-- Signature and rollout: the function gains `p_lease_until timestamptz DEFAULT NULL`
-- as a trailing parameter and p_stale_before stays (the lease-less compatibility
-- rule needs it). Adding a parameter makes a NEW overload, so the 11-argument
-- function is DROPPED here: no stale overload stays callable, and a named-argument
-- call from the live handler (v15, 11 arguments) resolves unambiguously to this
-- function with p_lease_until = NULL, i.e. exactly today's behaviour (it stamps
-- NULL and never reads a lease it did not write). Migration first is safe; the
-- redeployed handler then passes the lease. Grants are re-applied below.
--
-- claimed_until is a new column on a table with table-level grants, so the existing
-- ACL covers it unchanged (authenticated SELECT/UPDATE under the existing RLS,
-- service_role ALL; anon none). It is internal bookkeeping, not a secret.
--
-- Rollback: re-create the 11-argument function from 20261016003900, DROP the new
-- one, ALTER TABLE ... DROP COLUMN claimed_until, redeploy the previous handler.
-- =============================================================================

BEGIN;

ALTER TABLE public.show_lifecycle_email_jobs ADD COLUMN IF NOT EXISTS claimed_until timestamptz;

DROP FUNCTION IF EXISTS public.claim_registration_number_needed_job(
  uuid, uuid, uuid, text, text, text, text, text, text, uuid, timestamptz
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
  p_stale_before timestamptz,
  p_lease_until timestamptz DEFAULT NULL
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
      -- Same request, same address, same stored text and provider key: the
      -- provider collapses the replay, so it is allowed even under an active
      -- lease. It renews the lease: this attempt now owns the send.
      UPDATE public.show_lifecycle_email_jobs
         SET claimed_until = COALESCE(p_lease_until, claimed_until)
       WHERE id = v_tie.id;
      RETURN jsonb_build_object('outcome', 'send', 'job_id', v_tie.id, 'recovered', false);
    END IF;
    -- An active send (lease, or a recent lease-less ready job) is awaiting the
    -- provider: replacing it would put a second email under a different provider key.
    IF v_tie.claimed_until > now()
       OR (v_tie.claimed_until IS NULL AND v_tie.status = 'ready'
           AND NOT (v_tie.created_at IS NULL OR v_tie.created_at < p_stale_before)) THEN
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
      SELECT j.id, j.status, j.created_at, j.claimed_until, j.recipient_email
        FROM public.show_lifecycle_email_jobs j
       WHERE j.show_id = p_show_id
         AND j.step_type = 'registration_number_needed'
         AND j.entry_id = p_entry_id
         AND j.status IN ('ready', 'failed')
         FOR UPDATE
    LOOP
      v_supersede := v_supersede || v_row.id;
      IF v_row.claimed_until > now()
         OR (v_row.claimed_until IS NULL AND v_row.status = 'ready'
             AND NOT (v_row.created_at IS NULL OR v_row.created_at < p_stale_before)) THEN
        v_busy := true;
      END IF;
      IF v_same IS NULL
         AND lower(btrim(coalesce(v_row.recipient_email, ''))) = v_email THEN
        v_same := v_row.id;
      END IF;
    END LOOP;

    -- An active send (lease, or a recent lease-less ready job) is in flight: never touch it.
    IF v_busy THEN
      RETURN jsonb_build_object('outcome', 'busy', 'job_id', null, 'recovered', false);
    END IF;

    -- A failed or stale one at the current address may already have reached the
    -- provider: recover it (replayed under its own key) and ADD a tie for THIS
    -- request. Every earlier request's tie to it stays, so they all still resolve.
    IF v_same IS NOT NULL THEN
      INSERT INTO public.show_lifecycle_email_job_requests (show_id, request_key, job_id)
      VALUES (p_show_id, p_request_key, v_same);
      -- The recovered send is now in flight: record it, or a changed address could
      -- supersede it while the provider call is pending.
      UPDATE public.show_lifecycle_email_jobs
         SET claimed_until = COALESCE(p_lease_until, claimed_until)
       WHERE id = v_same;
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
    idempotency_key, due_at, created_by, updated_by, claimed_until
  ) VALUES (
    p_show_id, p_step_id, 'registration_number_needed', 'ready', 'entry', p_entry_id,
    btrim(p_recipient_email), p_recipient_name, p_subject, p_body, p_secretary_note,
    v_idem, now(), p_user_id, p_user_id, p_lease_until
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
  uuid, uuid, uuid, text, text, text, text, text, text, uuid, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_registration_number_needed_job(
  uuid, uuid, uuid, text, text, text, text, text, text, uuid, timestamptz, timestamptz
) TO service_role;

COMMIT;
