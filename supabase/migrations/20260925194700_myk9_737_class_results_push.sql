-- MYK9-737: the "Results Posted" push fires when results become VISIBLE, once
-- per class, not when each entry is scored; and a failed send is retried
-- instead of being lost.
--
-- Before: trg_notify_entry_scoring_push (20260703122000) posted to
-- push-trigger-scoring the moment an entry's scoring_completed_at went from
-- NULL to set. It never consulted the results release gate, so a show holding
-- results for manual release announced them on the exhibitor's phone before
-- anyone could see them, and every scored dog sent its own push.
--
-- After:
--   * The entry trigger and its function are dropped.
--   * A classes trigger fires on the three columns that move a class through
--     the release gate's states (status, is_scoring_finalized,
--     results_released_at). When private.class_results_push_due finds the
--     class done and its qualification results visible, and the class has no
--     push row yet, private.claim_class_results_push inserts ONE 'pending' row
--     (single winner: primary key + ON CONFLICT DO NOTHING RETURNING) and the
--     trigger posts the class to push-trigger-scoring.
--   * The edge function owns the outcome. It takes a short lease on the
--     pending row (begin_class_results_push), sends, and only then records
--     'sent' (finish_class_results_push). A failed send records last_error and
--     leaves the row pending. pg_net is asynchronous, so the trigger never
--     learns whether the post landed; the row, not the post, is the truth.
--   * private.retry_class_results_push, run every five minutes by the
--     'class-results-push-retry' cron, re-posts every pending row whose last
--     attempt is more than five minutes old and whose lease has lapsed. After
--     the fifth attempt a still-pending row becomes 'failed', and the
--     class_results_push check on /admin/health goes red for it. That check
--     reads the source of truth, not just the rows: it also goes red for any
--     class due for 20+ minutes that is not sent (no row at all, or still
--     pending), and when the retry cron itself has not succeeded for 15
--     minutes (section 7).
--
-- Delivery semantics: at-least-once per recipient. The lease makes two
-- concurrent posts for one class unable to both send; a crash between the
-- provider call and finish_class_results_push leaves the row pending, and the
-- retry sends again (recipients already recorded in delivered_to are skipped,
-- so only the crash window can double-notify). The alternative, marking sent
-- before sending, is at-most-once and is exactly the lost push this fixes.
--
-- Visibility is decided by public.resolve_class_result_visibility, the
-- canonical resolver the results views use (20260617150000; parity with
-- private.class_result_visibility is pinned by
-- myk9_126_class_result_visibility_parity_test.sql). Nothing here restates the
-- show -> trial -> class timing cascade.
--
-- Paths this produces:
--   * Default presets (qualification 'immediate' or 'class_complete'): the push
--     fires when the class completes or is scoring-finalized.
--   * manual_release: completing or finalizing queues nothing (qualification
--     is not visible yet); setting results_released_at does, and fires then.
--   * Released (or completed) before any entry is scored: nothing until the
--     first scored entry, then the next retry-cron sweep queues and posts it.
--   * A class un-released (or soft-deleted) before the edge function runs:
--     begin_class_results_push finds it no longer due and DELETES the pending
--     row, so the next release queues a fresh push instead of the class being
--     marked as announced.
--
-- Whose visibility: the push goes only to the signed-in owner, co-owner and
-- handler of scored entries. They read their results through
-- view_authenticated_entry_results and view_own_entry_results, which gate
-- result_status on vis.qualification_visible from this same resolver and
-- nothing else. The anon view_public_entry_results ALSO requires
-- results_released_at (MYK9-466, MYK9-552), but it is the public board, not
-- what these recipients see, so gating on it would delay the default-preset
-- push until a release that open shows may never do.
--
-- "Done" (released, completed, or scoring-finalized) is the resolver's own
-- class-state rule (step 5 of resolve_class_result_visibility). It is needed
-- separately because an 'immediate' field is visible while the class is still
-- running, and "Results Posted" must not fire when a class STARTS.
--
-- Nothing to announce yet: a class is due only once at least one entry has a
-- result worth announcing (private.class_results_push_announces: live,
-- scored, not scratched/withdrawn/absent/moved/not accepted). The Release
-- Results action does not require scoring to be complete, so a class released
-- before any dog is scored queues nothing; it becomes due when an entry is
-- scored, which touches entries, not classes, so the trigger cannot see it.
-- The retry cron's sweep does: every five minutes it queues recent classes
-- (trial within 30 days) that are due and have no row, at most 50 per run.
-- The same sweep covers a visibility setting loosened after a class finished.
-- A class whose entries are all scratched or absent is never due.
--
-- Backfill: classes ALREADY done and visible when this migration runs are
-- recorded as 'sent' (no replay): the old per-entry trigger announced them.
--
-- Behavioral coverage: supabase/tests/myk9_737_class_results_push_test.sql

BEGIN;

-- ============================================================================
-- 1. One row per class. Internal bookkeeping in the private schema (no client
--    role has USAGE on it, 20260728210000): no client role can read or write
--    it, and the edge function reaches it only through the service_role RPCs
--    in section 5.
-- ============================================================================

CREATE TABLE private.class_results_push (
  class_id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  last_error text,
  -- The edge function's lease: set by begin_class_results_push, cleared by
  -- finish_class_results_push. A finish must present the token it was given,
  -- so a worker whose lease lapsed cannot overwrite a newer attempt.
  claim_token uuid,
  claimed_until timestamptz,
  -- Auth user ids already notified. A retry skips them, so a partial failure
  -- re-sends only to the recipients the provider call failed for.
  delivered_to uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'sent') = (sent_at IS NOT NULL))
);

COMMENT ON TABLE private.class_results_push IS
  'MYK9-737: one row per class whose "Results Posted" push has been queued. pending -> sent by push-trigger-scoring after it has sent; pending -> failed by private.retry_class_results_push after 5 attempts.';

CREATE INDEX class_results_push_pending_idx
  ON private.class_results_push (last_attempt_at)
  WHERE status = 'pending';

ALTER TABLE private.class_results_push ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.class_results_push FROM PUBLIC, anon, authenticated, service_role;

-- ============================================================================
-- 2. The decision: done + qualification visible + something to announce.
--    Shared by the claim, the backfill, the lease and the retry sweep so they
--    cannot disagree.
-- ============================================================================

-- An entry whose result is worth announcing: live, scored, and not scratched,
-- withdrawn, absent, moved or refused. The ONE predicate behind both "is
-- there anything to announce" (class_results_push_due) and "who do we tell"
-- (class_results_push_audience), so a class is never due with nobody to tell
-- about it, or the reverse. A class released before any dog is scored is not
-- due yet; the retry's sweep queues it once an entry is scored.
-- Takes the four columns rather than the row type, so its GRANT/REVOKE lines
-- never name the entries table (the anon-grant contract reads those).
CREATE OR REPLACE FUNCTION private.class_results_push_announces(
  p_deleted_at timestamptz,
  p_scoring_completed_at timestamptz,
  p_entry_status text,
  p_result_status text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_deleted_at IS NULL
     AND p_scoring_completed_at IS NOT NULL
     AND coalesce(p_entry_status, '') NOT IN ('withdrawn', 'scratched', 'absent', 'moved', 'not_accepted')
     AND coalesce(p_result_status, '') NOT IN ('absent', 'withdrawn');
$$;

COMMENT ON FUNCTION private.class_results_push_announces(timestamptz, timestamptz, text, text) IS
  'MYK9-737: an entry (deleted_at, scoring_completed_at, entry_status, result_status) has a result worth a "Results Posted" push: live, scored, not scratched/withdrawn/absent/moved/not accepted.';

REVOKE ALL ON FUNCTION private.class_results_push_announces(timestamptz, timestamptz, text, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.class_results_push_due(p_class_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_finalized boolean;
  v_released timestamptz;
  v_visible boolean;
BEGIN
  SELECT c.status, c.is_scoring_finalized, c.results_released_at
    INTO v_status, v_finalized, v_released
  FROM public.classes c
  WHERE c.id = p_class_id
    AND c.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Done: the resolver's 'released' or 'completed' state (its step 5).
  IF NOT (
    v_released IS NOT NULL
    OR lower(coalesce(v_status, '')) = 'completed'
    OR v_finalized IS TRUE
  ) THEN
    RETURN false;
  END IF;

  -- Something to announce: without a scored entry there are no results yet,
  -- and claiming now would spend the class's one push on nobody.
  IF NOT EXISTS (
    SELECT 1 FROM public.entries e
    WHERE e.class_id = p_class_id
      AND private.class_results_push_announces(e.deleted_at, e.scoring_completed_at, e.entry_status, e.result_status)
  ) THEN
    RETURN false;
  END IF;

  SELECT v.qualification_visible INTO v_visible
  FROM public.resolve_class_result_visibility(p_class_id) AS v;

  RETURN v_visible IS TRUE;
END;
$$;

COMMENT ON FUNCTION private.class_results_push_due(uuid) IS
  'MYK9-737: true when the class is done (released, completed or scoring-finalized), has at least one entry private.class_results_push_announces, and its qualification results are visible (public.resolve_class_result_visibility).';

REVOKE ALL ON FUNCTION private.class_results_push_due(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.claim_class_results_push(p_class_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_claimed uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM private.class_results_push WHERE class_id = p_class_id) THEN
    RETURN false;
  END IF;

  IF NOT private.class_results_push_due(p_class_id) THEN
    RETURN false;
  END IF;

  -- The primary key makes the claim single-winner under concurrent updates.
  INSERT INTO private.class_results_push (class_id, status, attempts, last_attempt_at)
  VALUES (p_class_id, 'pending', 1, now())
  ON CONFLICT (class_id) DO NOTHING
  RETURNING class_id INTO v_claimed;

  RETURN v_claimed IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION private.claim_class_results_push(uuid) IS
  'MYK9-737: inserts the class''s pending push row and returns true exactly once per class, at the first moment private.class_results_push_due holds.';

REVOKE ALL ON FUNCTION private.claim_class_results_push(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Backfill: classes already done and visible were announced (per entry) by the
-- old trigger. Record them as sent so nothing replays.
INSERT INTO private.class_results_push (class_id, status, attempts, sent_at)
SELECT c.id, 'sent', 0, now()
FROM public.classes c
WHERE private.class_results_push_due(c.id)
ON CONFLICT (class_id) DO NOTHING;

-- ============================================================================
-- 3. The one place that posts a class to push-trigger-scoring. The trigger and
--    the retry both call it, with the Vault-backed PUSH_WEBHOOK_SECRET
--    handshake notify_class_status_push uses (20260703122000).
-- ============================================================================

CREATE OR REPLACE FUNCTION private.post_class_results_push(
  p_class_id uuid,
  p_base_url text,
  p_secret text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF nullif(p_base_url, '') IS NULL OR nullif(p_secret, '') IS NULL THEN
    -- Nothing to post with. The row stays pending with the reason, and the
    -- retry picks it up once the config exists.
    UPDATE private.class_results_push
    SET last_error = 'edge function config is not set (edge_function_base_url / push_webhook_secret)'
    WHERE class_id = p_class_id AND status = 'pending';
    RAISE NOTICE 'post_class_results_push skipped because edge function config is not set';
    RETURN;
  END IF;

  -- pg_net queues the request and sends it from a background worker after
  -- commit; its outcome is never read here. push-trigger-scoring records
  -- 'sent' itself, and a lost request is re-posted by the retry.
  PERFORM net.http_post(
    url := p_base_url || '/push-trigger-scoring',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || p_secret
    ),
    body := jsonb_build_object(
      'type', 'UPDATE',
      'table', 'classes',
      'record', jsonb_build_object(
        'id', p_class_id,
        'name', (SELECT c.name FROM public.classes c WHERE c.id = p_class_id)
      )
    ),
    timeout_milliseconds := 60000
  );
END;
$$;

COMMENT ON FUNCTION private.post_class_results_push(uuid, text, text) IS
  'MYK9-737: posts one class to push-trigger-scoring via pg_net. Shared by notify_class_results_push and retry_class_results_push.';

REVOKE ALL ON FUNCTION private.post_class_results_push(uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;

-- ============================================================================
-- 4. The classes trigger.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_class_results_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- The row is queued whether or not the webhook config exists: the decision
  -- belongs to the class, and the retry posts it once the config is there.
  IF NOT private.claim_class_results_push(new.id) THEN
    RETURN new;
  END IF;

  PERFORM private.post_class_results_push(
    new.id,
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_base_url'),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'push_webhook_secret')
  );

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_class_results_push() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_notify_class_results_push ON public.classes;
CREATE TRIGGER trg_notify_class_results_push
  AFTER UPDATE OF status, is_scoring_finalized, results_released_at ON public.classes
  FOR EACH ROW
  WHEN (
    old.status IS DISTINCT FROM new.status
    OR old.is_scoring_finalized IS DISTINCT FROM new.is_scoring_finalized
    OR old.results_released_at IS DISTINCT FROM new.results_released_at
  )
  EXECUTE FUNCTION public.notify_class_results_push();

-- ============================================================================
-- 5. The edge function's side: lease, then outcome. service_role only.
-- ============================================================================

-- Lease a pending row for one send. Returns ONE row:
--   ('leased', token, delivered_to) -> send, skipping delivered_to, then finish
--   ('held', NULL, NULL)            -> the class is no longer due (un-released,
--                                      visibility tightened, soft-deleted); the
--                                      pending row is DELETED so the next
--                                      release queues a fresh push
-- and NO row when the class is already sent or failed, has no row, or another
-- invocation holds a live lease: the caller must then send nothing. The row
-- lock (FOR UPDATE SKIP LOCKED) plus the lease is what stops two concurrent
-- posts for one class from both sending.
CREATE OR REPLACE FUNCTION public.begin_class_results_push(p_class_id uuid)
RETURNS TABLE (outcome text, claim_token uuid, delivered_to uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM 1
  FROM private.class_results_push p
  WHERE p.class_id = p_class_id
    AND p.status = 'pending'
    AND (p.claimed_until IS NULL OR p.claimed_until <= now())
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT private.class_results_push_due(p_class_id) THEN
    DELETE FROM private.class_results_push p WHERE p.class_id = p_class_id;
    RETURN QUERY SELECT 'held'::text, NULL::uuid, NULL::uuid[];
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE private.class_results_push AS p
  SET claim_token = gen_random_uuid(),
      claimed_until = now() + interval '5 minutes'
  WHERE p.class_id = p_class_id
  RETURNING 'leased'::text, p.claim_token, p.delivered_to;
END;
$$;

COMMENT ON FUNCTION public.begin_class_results_push(uuid) IS
  'MYK9-737: push-trigger-scoring''s five-minute lease on a pending "Results Posted" row (leased), or held when the class is no longer due. No row returned = send nothing.';

REVOKE ALL ON FUNCTION public.begin_class_results_push(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_class_results_push(uuid) TO service_role;

-- Record the outcome of a leased attempt. Only the lease holder, and only a
-- pending row:
--   'sent'  -> status sent, sent_at now (the ONLY path to 'sent' after the
--              backfill); p_error, if given, is kept as a note
--   'error' -> stays pending, last_error recorded, lease released for the retry
--   'held'  -> the audience read found no announceable result after all (the
--              results went away between the lease and the read): the row is
--              deleted, and the retry's sweep re-queues the class once it is
--              due again. Never 'sent' for a class with nothing to announce.
-- delivered_to is merged in for 'sent' and 'error'.
CREATE OR REPLACE FUNCTION public.finish_class_results_push(
  p_class_id uuid,
  p_claim_token uuid,
  p_outcome text,
  p_delivered_to uuid[],
  p_error text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_found boolean;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('sent', 'error', 'held') THEN
    RAISE EXCEPTION 'finish_class_results_push: unknown outcome %', p_outcome
      USING ERRCODE = '22023';
  END IF;

  IF p_outcome = 'held' THEN
    DELETE FROM private.class_results_push AS p
    WHERE p.class_id = p_class_id
      AND p.claim_token = p_claim_token
      AND p.status = 'pending';
    v_found := FOUND;
    RETURN v_found;
  END IF;

  UPDATE private.class_results_push AS p
  SET status = CASE WHEN p_outcome = 'sent' THEN 'sent' ELSE 'pending' END,
      sent_at = CASE WHEN p_outcome = 'sent' THEN now() ELSE NULL END,
      -- On 'sent', p_error is an optional note (for example recipients whose
      -- subscriptions had all expired: done, but worth knowing).
      last_error = CASE WHEN p_outcome = 'sent' THEN left(p_error, 500)
                        ELSE left(coalesce(p_error, 'unknown error'), 500) END,
      delivered_to = ARRAY(
        SELECT DISTINCT u FROM unnest(p.delivered_to || coalesce(p_delivered_to, '{}')) AS u
        ORDER BY u
      ),
      claim_token = NULL,
      claimed_until = NULL
  WHERE p.class_id = p_class_id
    AND p.claim_token = p_claim_token
    AND p.status = 'pending';
  v_found := FOUND;
  RETURN v_found;
END;
$$;

COMMENT ON FUNCTION public.finish_class_results_push(uuid, uuid, text, uuid[], text) IS
  'MYK9-737: push-trigger-scoring records a leased attempt''s outcome (sent / error / held). Conditional on the lease token and status pending.';

REVOKE ALL ON FUNCTION public.finish_class_results_push(uuid, uuid, text, uuid[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_class_results_push(uuid, uuid, text, uuid[], text) TO service_role;

-- Who to tell: the owner, co-owner and handler sign-in accounts of every entry
-- private.class_results_push_announces, one row per entry. The same predicate
-- as class_results_push_due, so "due" and "has results to announce" cannot
-- disagree. No row at all = nothing to announce (the edge function then
-- finishes 'held'); rows with no account = results exist but nobody can be
-- told (it finishes 'sent').
CREATE OR REPLACE FUNCTION public.class_results_push_audience(p_class_id uuid)
RETURNS TABLE (
  dog_call_name text,
  owner_auth_user_id uuid,
  co_owner_auth_user_id uuid,
  handler_auth_user_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT d.call_name, o.auth_user_id, co.auth_user_id, h.auth_user_id
  FROM public.entries e
  LEFT JOIN public.dogs d ON d.id = e.dog_id
  LEFT JOIN public.people o ON o.id = d.owner_id
  LEFT JOIN public.people co ON co.id = d.co_owner_id
  LEFT JOIN public.people h ON h.id = e.handler_id
  WHERE e.class_id = p_class_id
    AND private.class_results_push_announces(e.deleted_at, e.scoring_completed_at, e.entry_status, e.result_status)
  ORDER BY e.created_at, e.id;
$$;

COMMENT ON FUNCTION public.class_results_push_audience(uuid) IS
  'MYK9-737: push-trigger-scoring''s recipients for a class: one row per announceable entry (private.class_results_push_announces). service_role only.';

REVOKE ALL ON FUNCTION public.class_results_push_audience(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.class_results_push_audience(uuid) TO service_role;

-- ============================================================================
-- 6. The retry, and its cron.
-- ============================================================================

-- Credentials arrive as ARGUMENTS, read from Vault in the cron command, so
-- list_cron_vault_secret_refs() / audit_cron_vault_secrets() can see which
-- secrets this job depends on (the 20260822190000 / 20260925054100 pattern).
--
-- Two jobs per run:
--   1. Retry: re-post stale, unleased pending rows; fail them after 5 attempts.
--   2. Sweep: queue and post classes that became due WITHOUT a classes-column
--      change, which the trigger cannot see: most often a class released
--      before any dog was scored, whose first entry is scored later (also a
--      visibility setting loosened after the class finished). Bounded: only
--      classes whose trial is within the last 30 days, and at most
--      p_sweep_limit (default 50) per run, oldest id first; the rest wait for
--      the next run.
-- Returns how many classes it posted.
CREATE OR REPLACE FUNCTION private.retry_class_results_push(
  p_base_url text,
  p_secret text,
  p_sweep_limit integer DEFAULT 50
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  c_max_attempts CONSTANT integer := 5;
  c_retry_after CONSTANT interval := interval '5 minutes';
  v_class_id uuid;
  v_posted integer := 0;
BEGIN
  IF nullif(p_base_url, '') IS NULL OR nullif(p_secret, '') IS NULL THEN
    RAISE EXCEPTION 'Missing Vault secret: edge_function_base_url or push_webhook_secret';
  END IF;

  -- Out of attempts: the fifth post has had its five minutes.
  UPDATE private.class_results_push
  SET status = 'failed',
      claim_token = NULL,
      claimed_until = NULL
  WHERE status = 'pending'
    AND attempts >= c_max_attempts
    AND last_attempt_at < now() - c_retry_after
    AND (claimed_until IS NULL OR claimed_until <= now());

  -- Stale and unleased: count the attempt, then post. The UPDATE is the lock:
  -- a concurrent run re-checks last_attempt_at after the row lock and skips.
  FOR v_class_id IN
    UPDATE private.class_results_push
    SET attempts = attempts + 1,
        last_attempt_at = now()
    WHERE status = 'pending'
      AND attempts < c_max_attempts
      AND (last_attempt_at IS NULL OR last_attempt_at < now() - c_retry_after)
      AND (claimed_until IS NULL OR claimed_until <= now())
    RETURNING class_id
  LOOP
    PERFORM private.post_class_results_push(v_class_id, p_base_url, p_secret);
    v_posted := v_posted + 1;
  END LOOP;

  -- The sweep. claim_class_results_push re-checks due and inserts with
  -- ON CONFLICT DO NOTHING, so a class the trigger claims concurrently is
  -- posted once.
  FOR v_class_id IN
    SELECT c.id
    FROM public.classes c
    JOIN public.trials t ON t.id = c.trial_id
    WHERE c.deleted_at IS NULL
      AND t.date >= current_date - 30
      AND (c.results_released_at IS NOT NULL
           OR lower(coalesce(c.status, '')) = 'completed'
           OR c.is_scoring_finalized IS TRUE)
      AND NOT EXISTS (SELECT 1 FROM private.class_results_push p WHERE p.class_id = c.id)
      AND private.class_results_push_due(c.id)
    ORDER BY c.id
    LIMIT greatest(coalesce(p_sweep_limit, 50), 0)
  LOOP
    IF private.claim_class_results_push(v_class_id) THEN
      PERFORM private.post_class_results_push(v_class_id, p_base_url, p_secret);
      v_posted := v_posted + 1;
    END IF;
  END LOOP;

  RETURN v_posted;
END;
$$;

COMMENT ON FUNCTION private.retry_class_results_push(text, text, integer) IS
  'MYK9-737: cron entry point. Re-posts stale, unleased pending "Results Posted" rows (failed after 5 attempts), and queues up to p_sweep_limit recent classes that became due without a classes update.';

REVOKE ALL ON FUNCTION private.retry_class_results_push(text, text, integer) FROM PUBLIC, anon, authenticated, service_role;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'class-results-push-retry';

-- Scheduled ONLY once its secret exists; otherwise the cron-vault-secrets
-- contract would go red and the job would raise every five minutes. Rows
-- queued before the schedule exists simply wait for it.
DO $schedule$
BEGIN
  IF EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'push_webhook_secret'
  ) THEN
    PERFORM cron.schedule(
      'class-results-push-retry',
      '*/5 * * * *',
      $job$
      select private.retry_class_results_push(
        (select decrypted_secret from vault.decrypted_secrets where name = 'edge_function_base_url'),
        (select decrypted_secret from vault.decrypted_secrets where name = 'push_webhook_secret')
      );
      $job$
    );
  ELSE
    RAISE WARNING '%',
      'push_webhook_secret is not in Vault, so class-results-push-retry was NOT scheduled. '
      'Create it, then re-run the cron.schedule call in 20260925194700_myk9_737_class_results_push.sql.';
  END IF;
END
$schedule$;

-- ============================================================================
-- 7. /admin/health: the class_results_push check (cron-health-check calls
--    this every five minutes). It reads the SOURCE OF TRUTH, not the rows: a
--    class that is due (private.class_results_push_due, the predicate the
--    trigger and the sweep use) is owed a push whether or not a row exists.
--    Stuck =
--      * any 'failed' row (out of attempts; alarms whether or not the class is
--        still due), or
--      * a class due for more than 20 minutes that is not 'sent': row
--        missing (nothing ever queued it: trigger missed it and the sweep is
--        not running) or row still 'pending' (queued, not delivered).
--    The second rule subsumes the earlier row-only rules (pending after three
--    attempts, pending with no attempt for 20 minutes): a pending row belongs
--    to a class that has been due at least since its row was queued. 20
--    minutes = four retry periods: a healthy class is queued at once or by the
--    next sweep (<= 5 min) and retried within ~10 more, ~15 behind a lapsed
--    lease. Bounded like the sweep: only classes whose trial is within the
--    last 30 days are evaluated.
--
--    Plus the retry cron's own liveness (class-results-push-retry), read from
--    cron.job / cron.job_run_details here because this function is the
--    SECURITY DEFINER reader for the check (the pattern system_health_probe
--    uses for cron.*). The generic background_jobs check also lists this job,
--    but only flags failed or inactive runs and allows 26 hours before
--    "overdue", and cannot see a job that was never scheduled.
-- ============================================================================

-- When the class became due, as closely as the schema records it: the latest
-- of the events that can make a class due.
--   * classes.updated_at: bumped by update_classes_updated_at on every classes
--     UPDATE, so it is at or after the completion, finalization and release
--     that made the class done (classes has no completed_at/finalized_at;
--     results_released_at is included too, since it can be written in the
--     past).
--   * the latest scoring_completed_at among announceable entries: a class
--     released before scoring becomes due when its first entry is scored.
--   * the updated_at of the show / trial / class visibility settings: a
--     loosened setting can make a done class visible.
-- Taking the latest makes the estimate never earlier than the real moment,
-- so the check cannot alarm early; an unrelated later edit only delays it.
CREATE OR REPLACE FUNCTION private.class_results_push_due_since(p_class_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT greatest(
    c.updated_at,
    c.results_released_at,
    (SELECT max(e.scoring_completed_at) FROM public.entries e
     WHERE e.class_id = c.id
       AND private.class_results_push_announces(e.deleted_at, e.scoring_completed_at, e.entry_status, e.result_status)),
    (SELECT v.updated_at FROM public.show_visibility_settings v WHERE v.show_id = t.show_id),
    (SELECT o.updated_at FROM public.trial_visibility_overrides o WHERE o.trial_id = t.id),
    (SELECT o.updated_at FROM public.class_visibility_overrides o WHERE o.class_id = c.id)
  )
  FROM public.classes c
  JOIN public.trials t ON t.id = c.trial_id
  WHERE c.id = p_class_id;
$$;

COMMENT ON FUNCTION private.class_results_push_due_since(uuid) IS
  'MYK9-737: the latest recorded event that can have made the class due (classes.updated_at, results_released_at, latest announceable scoring_completed_at, visibility settings updated_at). Never earlier than the real moment.';

REVOKE ALL ON FUNCTION private.class_results_push_due_since(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.class_results_push_health()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH due AS (
    -- The sweep's candidate set: recent, live, done classes that are due.
    SELECT c.id AS class_id, private.class_results_push_due_since(c.id) AS due_since
    FROM public.classes c
    JOIN public.trials t ON t.id = c.trial_id
    WHERE c.deleted_at IS NULL
      AND t.date >= current_date - 30
      AND (c.results_released_at IS NOT NULL
           OR lower(coalesce(c.status, '')) = 'completed'
           OR c.is_scoring_finalized IS TRUE)
      AND private.class_results_push_due(c.id)
  ),
  owed AS (
    SELECT d.class_id, coalesce(p.status, 'missing') AS status, p.attempts,
           p.last_attempt_at, p.last_error, d.due_since
    FROM due d
    LEFT JOIN private.class_results_push p ON p.class_id = d.class_id
    WHERE coalesce(p.status, 'missing') <> 'sent'
      AND d.due_since < now() - interval '20 minutes'
  ),
  failed AS (
    SELECT p.class_id, p.status, p.attempts, p.last_attempt_at, p.last_error,
           NULL::timestamptz AS due_since
    FROM private.class_results_push p
    WHERE p.status = 'failed'
  ),
  stuck AS (
    SELECT * FROM failed
    UNION ALL
    SELECT * FROM owed WHERE status <> 'failed'
  ),
  named AS (
    SELECT x.*, c.name AS class_name, s.name AS show_name
    FROM stuck x
    LEFT JOIN public.classes c ON c.id = x.class_id
    LEFT JOIN public.trials t ON t.id = c.trial_id
    LEFT JOIN public.shows s ON s.id = t.show_id
  ),
  job AS (
    SELECT j.jobid, j.active FROM cron.job j WHERE j.jobname = 'class-results-push-retry'
  )
  SELECT jsonb_build_object(
    'stuck', (SELECT count(*) FROM stuck),
    'failed', (SELECT count(*) FROM failed),
    'missing', (SELECT count(*) FROM stuck WHERE status = 'missing'),
    'pending', (SELECT count(*) FROM private.class_results_push WHERE status = 'pending'),
    'sample', (
      SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY n.status, n.class_name), '[]'::jsonb)
      FROM (SELECT * FROM named ORDER BY status, class_name LIMIT 10) n
    ),
    'retry_job', jsonb_build_object(
      'scheduled', EXISTS (SELECT 1 FROM job),
      'active', coalesce((SELECT active FROM job), false),
      'last_success_at', (
        SELECT max(d.end_time) FROM cron.job_run_details d
        WHERE d.jobid = (SELECT jobid FROM job) AND d.status = 'succeeded'
      ),
      'last_status', (
        SELECT d.status FROM cron.job_run_details d
        WHERE d.jobid = (SELECT jobid FROM job)
        ORDER BY d.start_time DESC NULLS LAST LIMIT 1
      ),
      'last_message', (
        SELECT left(d.return_message, 200) FROM cron.job_run_details d
        WHERE d.jobid = (SELECT jobid FROM job)
        ORDER BY d.start_time DESC NULLS LAST LIMIT 1
      )
    )
  );
$$;

COMMENT ON FUNCTION public.class_results_push_health() IS
  'MYK9-737: facts for the /admin/health class_results_push check: failed pushes, classes due for 20+ minutes (trial within 30 days) that are not sent (row missing or pending), and the class-results-push-retry cron''s liveness. service_role only.';

REVOKE ALL ON FUNCTION public.class_results_push_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.class_results_push_health() TO service_role;

-- ============================================================================
-- 8. Retire the per-entry push.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_notify_entry_scoring_push ON public.entries;
DROP FUNCTION IF EXISTS public.notify_entry_scoring_push();

COMMIT;
