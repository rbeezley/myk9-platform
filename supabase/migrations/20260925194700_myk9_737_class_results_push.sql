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
--     class_results_push check on /admin/health goes red for it (and for any
--     row still pending after three attempts, or with no attempt for 20
--     minutes, which is what a stopped retry cron looks like).
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
-- Known limit: a secretary changing a class's visibility settings after it is
-- done (for example switching a held class to an open preset instead of
-- releasing it) changes visibility without touching classes, so no push fires
-- for that path.
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
-- 2. The decision: done + qualification visible. Shared by the claim and the
--    backfill so the two cannot disagree.
-- ============================================================================

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

  SELECT v.qualification_visible INTO v_visible
  FROM public.resolve_class_result_visibility(p_class_id) AS v;

  RETURN v_visible IS TRUE;
END;
$$;

COMMENT ON FUNCTION private.class_results_push_due(uuid) IS
  'MYK9-737: true when the class is done (released, completed or scoring-finalized) and its qualification results are visible (public.resolve_class_result_visibility).';

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
-- delivered_to is merged in either way.
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
  IF p_outcome IS NULL OR p_outcome NOT IN ('sent', 'error') THEN
    RAISE EXCEPTION 'finish_class_results_push: unknown outcome %', p_outcome
      USING ERRCODE = '22023';
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
  'MYK9-737: push-trigger-scoring records a leased attempt''s outcome (sent / error). Conditional on the lease token and status pending.';

REVOKE ALL ON FUNCTION public.finish_class_results_push(uuid, uuid, text, uuid[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_class_results_push(uuid, uuid, text, uuid[], text) TO service_role;

-- ============================================================================
-- 6. The retry, and its cron.
-- ============================================================================

-- Credentials arrive as ARGUMENTS, read from Vault in the cron command, so
-- list_cron_vault_secret_refs() / audit_cron_vault_secrets() can see which
-- secrets this job depends on (the 20260822190000 / 20260925054100 pattern).
-- Returns how many classes it re-posted.
CREATE OR REPLACE FUNCTION private.retry_class_results_push(
  p_base_url text,
  p_secret text
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

  RETURN v_posted;
END;
$$;

COMMENT ON FUNCTION private.retry_class_results_push(text, text) IS
  'MYK9-737: cron entry point. Re-posts stale, unleased pending "Results Posted" rows; marks a row failed after 5 attempts.';

REVOKE ALL ON FUNCTION private.retry_class_results_push(text, text) FROM PUBLIC, anon, authenticated, service_role;

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
--    this every five minutes). Names the classes. Stuck =
--      * failed, or
--      * pending after three attempts, or
--      * pending with no attempt for 20 minutes. A healthy pending row is
--        re-attempted within ~10 minutes (5 minutes stale + up to one 5-minute
--        cron period), or ~15 if a lapsed 5-minute lease delayed it; 20 minutes
--        (four retry periods) clears that with margin. Without this arm a lost
--        first post plus a missing or stopped retry cron would sit at
--        attempts = 1 forever and read green.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.class_results_push_health()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH stuck AS (
    SELECT p.class_id, p.status, p.attempts, p.last_attempt_at, p.last_error,
           c.name AS class_name, s.name AS show_name
    FROM private.class_results_push p
    LEFT JOIN public.classes c ON c.id = p.class_id
    LEFT JOIN public.trials t ON t.id = c.trial_id
    LEFT JOIN public.shows s ON s.id = t.show_id
    WHERE p.status = 'failed'
       OR (p.status = 'pending' AND p.attempts >= 3)
       OR (p.status = 'pending'
           AND coalesce(p.last_attempt_at, p.created_at) < now() - interval '20 minutes')
  )
  SELECT jsonb_build_object(
    'stuck', (SELECT count(*) FROM stuck),
    'failed', (SELECT count(*) FROM stuck WHERE status = 'failed'),
    'pending', (SELECT count(*) FROM private.class_results_push WHERE status = 'pending'),
    'sample', (
      SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.last_attempt_at DESC NULLS LAST), '[]'::jsonb)
      FROM (SELECT * FROM stuck ORDER BY last_attempt_at DESC NULLS LAST LIMIT 10) x
    )
  );
$$;

COMMENT ON FUNCTION public.class_results_push_health() IS
  'MYK9-737: "Results Posted" pushes that failed, are still pending after 3 attempts, or have had no attempt for 20 minutes, for the /admin/health class_results_push check. service_role only.';

REVOKE ALL ON FUNCTION public.class_results_push_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.class_results_push_health() TO service_role;

-- ============================================================================
-- 8. Retire the per-entry push.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_notify_entry_scoring_push ON public.entries;
DROP FUNCTION IF EXISTS public.notify_entry_scoring_push();

COMMIT;
