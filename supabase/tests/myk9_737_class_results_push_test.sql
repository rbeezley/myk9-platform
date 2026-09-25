-- Behavioral test for MYK9-737: one "Results Posted" push per class, queued
-- when its qualification results become visible under the release gate
-- (public.resolve_class_result_visibility), marked sent only by the edge
-- function after it has sent, and retried by the cron until then. All
-- fixtures roll back.
--
-- Covers:
--   1. Default preset: a running class queues nothing even though
--      qualification is 'immediate'; completing it inserts ONE pending row
--      (attempts 1) and ONE post to push-trigger-scoring; a second trigger
--      fire inserts nothing and posts nothing.
--   2. 'standard' preset: scoring-finalization with a lagging status queues.
--   3. Held for manual release: completing and finalizing queue nothing;
--      setting results_released_at queues.
--   4. A soft-deleted class never queues.
--   5. Edge-function RPCs, as service_role: the lease is single-holder; a
--      finish needs the lease token; 'error' keeps the row pending with
--      last_error; 'sent' is the only way to sent (keeping an optional
--      note), and only from pending; a
--      sent class cannot be leased again.
--   6. Un-released before the send: begin returns 'held' and deletes the
--      row; the next release queues a fresh one.
--   7. Retry: re-posts only stale, unleased pending rows and counts the
--      attempt; a fresh or leased row is left alone; after the fifth attempt
--      the row becomes failed; a missing secret raises. The post helper
--      records last_error instead of posting when the config is absent.
--  7b. Nothing to announce yet: release before scoring queues nothing, the
--      retry sweep queues it once an entry is scored (and re-queues after a
--      'held' finish); only-scratched/absent classes never queue or alarm;
--      the audience RPC applies the same predicate; the sweep is bounded.
--   8. Health: class_results_push_health() names failed and 3+-attempt rows,
--      and a pending row with no attempt for 20 minutes (stalled retry), but
--      not a fresh one.
--   9. Wiring: the classes trigger exists, the per-entry push is gone, and
--      the retry cron (when scheduled) reads both secrets inline.
--  10. Backfill invariant: every class already due has a row.
--  11. Grants: no client role reaches the table or any function; service_role
--      reaches only the three public RPCs.
--
-- Posts are observed in net.http_request_queue: pg_net only enqueues there
-- and its worker sends after COMMIT, so inside this rolled-back transaction
-- nothing leaves the database. The Vault secrets the trigger reads are
-- created in-transaction when absent (the CI database has none), pointing at
-- a closed loopback port.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'edge_function_base_url') THEN
    PERFORM vault.create_secret('http://127.0.0.1:9/functions/v1', 'edge_function_base_url');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'push_webhook_secret') THEN
    PERFORM vault.create_secret('myk9-737-test-secret', 'push_webhook_secret');
  END IF;
END;
$$;

-- Posts to push-trigger-scoring for one class, from the pg_net queue.
CREATE FUNCTION pg_temp.posts_for(p_class_id uuid) RETURNS integer
LANGUAGE sql AS $$
  SELECT count(*)::integer
  FROM net.http_request_queue q
  WHERE q.url LIKE '%/push-trigger-scoring'
    AND convert_from(q.body, 'UTF8')::jsonb #>> '{record,id}' = p_class_id::text
$$;

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000737001', 'MYK9-737 Results Push Club');

INSERT INTO public.shows (id, name, organization, club_id, start_date, end_date)
VALUES
  ('00000000-0000-0000-0000-000000737002', 'MYK9-737 Default Show', 'AKC',
   '00000000-0000-0000-0000-000000737001', current_date, current_date),
  ('00000000-0000-0000-0000-000000737012', 'MYK9-737 Standard Show', 'AKC',
   '00000000-0000-0000-0000-000000737001', current_date, current_date);

INSERT INTO public.trials (id, show_id, name, date)
VALUES
  ('00000000-0000-0000-0000-000000737003', '00000000-0000-0000-0000-000000737002',
   'MYK9-737 Default Trial', current_date),
  ('00000000-0000-0000-0000-000000737013', '00000000-0000-0000-0000-000000737012',
   'MYK9-737 Standard Trial', current_date);

-- The 'standard' preset, materialized the way the app writes a show row.
INSERT INTO public.show_visibility_settings
  (show_id, placement_timing, qualification_timing, time_timing, faults_timing)
VALUES ('00000000-0000-0000-0000-000000737012', 'class_complete', 'immediate', 'class_complete', 'class_complete');

-- status_source 'manual' keeps the class-status rollup from re-deriving the
-- status as fixture entries are inserted: each arm moves its class itself.
INSERT INTO public.classes (id, trial_id, name, status, is_scoring_finalized, results_released_at, deleted_at)
VALUES
  -- A: default show, running.
  ('00000000-0000-0000-0000-0000007370a1', '00000000-0000-0000-0000-000000737003',
   'MYK9-737 A default', 'in_progress', false, NULL, NULL),
  -- B: standard show, running.
  ('00000000-0000-0000-0000-0000007370b1', '00000000-0000-0000-0000-000000737013',
   'MYK9-737 B standard', 'in_progress', false, NULL, NULL),
  -- C: default show, held for manual release by a class override.
  ('00000000-0000-0000-0000-0000007370c1', '00000000-0000-0000-0000-000000737003',
   'MYK9-737 C held', 'in_progress', false, NULL, NULL),
  -- D: default show, running, soft-deleted.
  ('00000000-0000-0000-0000-0000007370d1', '00000000-0000-0000-0000-000000737003',
   'MYK9-737 D deleted', 'in_progress', false, NULL, now()),
  -- E: default show, running (health arm: a stalled first attempt).
  ('00000000-0000-0000-0000-0000007370e1', '00000000-0000-0000-0000-000000737003',
   'MYK9-737 E stalled', 'in_progress', false, NULL, NULL),
  -- F: default show, released before any entry is scored.
  ('00000000-0000-0000-0000-0000007370f1', '00000000-0000-0000-0000-000000737003',
   'MYK9-737 F early release', 'in_progress', false, NULL, NULL),
  -- G: default show, every entry scratched or absent.
  ('00000000-0000-0000-0000-000000737091', '00000000-0000-0000-0000-000000737003',
   'MYK9-737 G nothing to announce', 'in_progress', false, NULL, NULL);

UPDATE public.classes SET status_source = 'manual'
WHERE trial_id IN ('00000000-0000-0000-0000-000000737003', '00000000-0000-0000-0000-000000737013');

INSERT INTO public.class_visibility_overrides (class_id, preset)
VALUES ('00000000-0000-0000-0000-0000007370c1', 'review');

-- Accounts for the audience arm. people.auth_user_id is not a foreign key.
INSERT INTO public.people (id, first_name, last_name, auth_user_id)
VALUES
  ('00000000-0000-0000-0000-00000073a0f1', 'Push', 'Owner', '00000000-0000-0000-0000-00000073a101'),
  ('00000000-0000-0000-0000-00000073a0f2', 'Push', 'Handler', '00000000-0000-0000-0000-00000073a102');

INSERT INTO public.dogs (id, name, call_name, breed, owner_id)
VALUES ('00000000-0000-0000-0000-00000073d001', 'MYK9-737 Rex', 'Rex', 'Beagle',
        '00000000-0000-0000-0000-00000073a0f1');

-- trg_entries_require_dog_registration: the dog needs an AKC number.
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
VALUES ('00000000-0000-0000-0000-00000073d001', 'AKC (American Kennel Club)', 'SR737REX', true);

-- Entries. A class is due only with an announceable result (scored, not
-- scratched/withdrawn/absent/moved/not accepted), so A-E each get one; A also
-- gets Rex (owner + handler accounts) and two entries that must NOT be
-- announced; F starts unscored; G has only a scratch and a scored absence.
INSERT INTO public.entries
  (id, dog_id, class_id, show_id, trial_id, handler_id, entry_status, check_in_status,
   is_scored, result_status, scoring_completed_at)
VALUES
  ('00000000-0000-0000-0000-00000073e0a1', NULL, '00000000-0000-0000-0000-0000007370a1',
   '00000000-0000-0000-0000-000000737002', '00000000-0000-0000-0000-000000737003', NULL,
   'completed', 'completed', true, 'qualified', now()),
  ('00000000-0000-0000-0000-00000073e0a2', '00000000-0000-0000-0000-00000073d001',
   '00000000-0000-0000-0000-0000007370a1', '00000000-0000-0000-0000-000000737002',
   '00000000-0000-0000-0000-000000737003', '00000000-0000-0000-0000-00000073a0f2',
   'completed', 'completed', true, 'nq', now()),
  ('00000000-0000-0000-0000-00000073e0a3', NULL, '00000000-0000-0000-0000-0000007370a1',
   '00000000-0000-0000-0000-000000737002', '00000000-0000-0000-0000-000000737003', NULL,
   'scratched', 'no-status', false, 'pending', NULL),
  ('00000000-0000-0000-0000-00000073e0a4', NULL, '00000000-0000-0000-0000-0000007370a1',
   '00000000-0000-0000-0000-000000737002', '00000000-0000-0000-0000-000000737003', NULL,
   'completed', 'completed', true, 'absent', now()),
  ('00000000-0000-0000-0000-00000073e0b1', NULL, '00000000-0000-0000-0000-0000007370b1',
   '00000000-0000-0000-0000-000000737012', '00000000-0000-0000-0000-000000737013', NULL,
   'completed', 'completed', true, 'qualified', now()),
  ('00000000-0000-0000-0000-00000073e0c1', NULL, '00000000-0000-0000-0000-0000007370c1',
   '00000000-0000-0000-0000-000000737002', '00000000-0000-0000-0000-000000737003', NULL,
   'completed', 'completed', true, 'qualified', now()),
  ('00000000-0000-0000-0000-00000073e0d1', NULL, '00000000-0000-0000-0000-0000007370d1',
   '00000000-0000-0000-0000-000000737002', '00000000-0000-0000-0000-000000737003', NULL,
   'completed', 'completed', true, 'qualified', now()),
  ('00000000-0000-0000-0000-00000073e0e1', NULL, '00000000-0000-0000-0000-0000007370e1',
   '00000000-0000-0000-0000-000000737002', '00000000-0000-0000-0000-000000737003', NULL,
   'completed', 'completed', true, 'qualified', now()),
  ('00000000-0000-0000-0000-00000073e0f1', NULL, '00000000-0000-0000-0000-0000007370f1',
   '00000000-0000-0000-0000-000000737002', '00000000-0000-0000-0000-000000737003', NULL,
   'checked-in', 'checked-in', false, 'pending', NULL),
  ('00000000-0000-0000-0000-00000073e091', NULL, '00000000-0000-0000-0000-000000737091',
   '00000000-0000-0000-0000-000000737002', '00000000-0000-0000-0000-000000737003', NULL,
   'scratched', 'no-status', false, 'pending', NULL),
  ('00000000-0000-0000-0000-00000073e092', NULL, '00000000-0000-0000-0000-000000737091',
   '00000000-0000-0000-0000-000000737002', '00000000-0000-0000-0000-000000737003', NULL,
   'absent', 'no-status', true, 'absent', now());

-- Inserting entries must not have moved any fixture class.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.classes
             WHERE trial_id IN ('00000000-0000-0000-0000-000000737003', '00000000-0000-0000-0000-000000737013')
               AND status <> 'in_progress') THEN
    RAISE EXCEPTION 'FIXTURE the class-status rollup moved a fixture class';
  END IF;
END;
$$;

-- The fixture classes must start with no row and no post, or every arm below
-- is vacuous.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM private.class_results_push
    WHERE class_id IN (
      '00000000-0000-0000-0000-0000007370a1', '00000000-0000-0000-0000-0000007370b1',
      '00000000-0000-0000-0000-0000007370c1', '00000000-0000-0000-0000-0000007370d1',
      '00000000-0000-0000-0000-0000007370e1', '00000000-0000-0000-0000-0000007370f1',
      '00000000-0000-0000-0000-000000737091'
    )
  ) THEN
    RAISE EXCEPTION 'FIXTURE a fixture class already has a push row';
  END IF;
  -- Positive control: the resolver really does show A's qualification while
  -- it runs, so arm 1's "nothing while running" is the done-guard at work.
  IF NOT (SELECT qualification_visible
          FROM public.resolve_class_result_visibility('00000000-0000-0000-0000-0000007370a1')) THEN
    RAISE EXCEPTION 'FIXTURE default-preset qualification is not immediate';
  END IF;
END;
$$;

-- ============================================================================
-- 1. Default preset: nothing while running, one row and one post on
--    completion, nothing more on a second fire.
-- ============================================================================

DO $$
DECLARE
  v_row private.class_results_push%ROWTYPE;
BEGIN
  -- Trigger fires while not done: setup -> in_progress.
  UPDATE public.classes SET status = 'setup'
  WHERE id = '00000000-0000-0000-0000-0000007370a1';
  UPDATE public.classes SET status = 'in_progress'
  WHERE id = '00000000-0000-0000-0000-0000007370a1';
  IF EXISTS (SELECT 1 FROM private.class_results_push WHERE class_id = '00000000-0000-0000-0000-0000007370a1')
     OR pg_temp.posts_for('00000000-0000-0000-0000-0000007370a1') <> 0 THEN
    RAISE EXCEPTION 'FAIL a running class queued the results push';
  END IF;

  UPDATE public.classes SET status = 'completed'
  WHERE id = '00000000-0000-0000-0000-0000007370a1';

  SELECT * INTO v_row FROM private.class_results_push
  WHERE class_id = '00000000-0000-0000-0000-0000007370a1';
  IF NOT FOUND OR v_row.status <> 'pending' OR v_row.attempts <> 1
     OR v_row.last_attempt_at IS NULL OR v_row.sent_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL completion did not queue one pending row (attempts 1): %', to_jsonb(v_row);
  END IF;
  IF pg_temp.posts_for('00000000-0000-0000-0000-0000007370a1') <> 1 THEN
    RAISE EXCEPTION 'FAIL completion posted % times, expected 1',
      pg_temp.posts_for('00000000-0000-0000-0000-0000007370a1');
  END IF;

  -- Second fire: finalizing a completed class.
  UPDATE public.classes SET is_scoring_finalized = true
  WHERE id = '00000000-0000-0000-0000-0000007370a1';
  IF (SELECT count(*) FROM private.class_results_push WHERE class_id = '00000000-0000-0000-0000-0000007370a1') <> 1
     OR (SELECT attempts FROM private.class_results_push WHERE class_id = '00000000-0000-0000-0000-0000007370a1') <> 1
     OR pg_temp.posts_for('00000000-0000-0000-0000-0000007370a1') <> 1 THEN
    RAISE EXCEPTION 'FAIL a second trigger fire queued or posted again';
  END IF;
  RAISE NOTICE 'PASS default preset: nothing while running, one pending row and one post on completion, none on a second fire';
END;
$$;

-- ============================================================================
-- 2. Standard preset: scoring-finalized with a lagging status counts as done.
-- ============================================================================

DO $$
BEGIN
  UPDATE public.classes SET is_scoring_finalized = true
  WHERE id = '00000000-0000-0000-0000-0000007370b1';

  IF NOT EXISTS (SELECT 1 FROM private.class_results_push
                 WHERE class_id = '00000000-0000-0000-0000-0000007370b1' AND status = 'pending')
     OR pg_temp.posts_for('00000000-0000-0000-0000-0000007370b1') <> 1 THEN
    RAISE EXCEPTION 'FAIL a scoring-finalized standard-preset class did not queue';
  END IF;
  RAISE NOTICE 'PASS standard preset: scoring finalization queues the push';
END;
$$;

-- ============================================================================
-- 3. Held for manual release: nothing until results_released_at is set.
-- ============================================================================

DO $$
BEGIN
  UPDATE public.classes SET status = 'completed', is_scoring_finalized = true
  WHERE id = '00000000-0000-0000-0000-0000007370c1';

  IF EXISTS (SELECT 1 FROM private.class_results_push WHERE class_id = '00000000-0000-0000-0000-0000007370c1')
     OR pg_temp.posts_for('00000000-0000-0000-0000-0000007370c1') <> 0 THEN
    RAISE EXCEPTION 'FAIL a class held for manual release queued before release';
  END IF;

  UPDATE public.classes SET results_released_at = now()
  WHERE id = '00000000-0000-0000-0000-0000007370c1';

  IF NOT EXISTS (SELECT 1 FROM private.class_results_push
                 WHERE class_id = '00000000-0000-0000-0000-0000007370c1' AND status = 'pending')
     OR pg_temp.posts_for('00000000-0000-0000-0000-0000007370c1') <> 1 THEN
    RAISE EXCEPTION 'FAIL releasing a held class did not queue the results push';
  END IF;
  RAISE NOTICE 'PASS manual release: nothing when completed, one push on release';
END;
$$;

-- ============================================================================
-- 4. A soft-deleted class never queues.
-- ============================================================================

DO $$
BEGIN
  UPDATE public.classes SET status = 'completed', is_scoring_finalized = true
  WHERE id = '00000000-0000-0000-0000-0000007370d1';

  IF EXISTS (SELECT 1 FROM private.class_results_push WHERE class_id = '00000000-0000-0000-0000-0000007370d1')
     OR pg_temp.posts_for('00000000-0000-0000-0000-0000007370d1') <> 0 THEN
    RAISE EXCEPTION 'FAIL a soft-deleted class queued the results push';
  END IF;
  RAISE NOTICE 'PASS a soft-deleted class never queues';
END;
$$;

-- ============================================================================
-- 5. The edge function's RPCs, as service_role, on class A.
-- ============================================================================

SET LOCAL ROLE service_role;

DO $$
DECLARE
  v_outcome text;
  v_token uuid;
  v_delivered uuid[];
  v_token2 uuid;
  v_ok boolean;
BEGIN
  SELECT b.outcome, b.claim_token, b.delivered_to INTO v_outcome, v_token, v_delivered
  FROM public.begin_class_results_push('00000000-0000-0000-0000-0000007370a1') b;
  IF v_outcome IS DISTINCT FROM 'leased' OR v_token IS NULL OR v_delivered <> '{}' THEN
    RAISE EXCEPTION 'FAIL begin did not lease the pending row (outcome %)', v_outcome;
  END IF;

  -- A second, concurrent post: the lease is held, so it gets nothing to send.
  IF EXISTS (SELECT 1 FROM public.begin_class_results_push('00000000-0000-0000-0000-0000007370a1')) THEN
    RAISE EXCEPTION 'FAIL a second begin leased a row that is already leased';
  END IF;

  -- A finish without the lease token does nothing.
  IF public.finish_class_results_push('00000000-0000-0000-0000-0000007370a1',
       gen_random_uuid(), 'sent', '{}', NULL) THEN
    RAISE EXCEPTION 'FAIL finish accepted a token it did not issue';
  END IF;

  -- A failed send: stays pending, records the error and who was reached,
  -- releases the lease.
  v_ok := public.finish_class_results_push('00000000-0000-0000-0000-0000007370a1',
    v_token, 'error', ARRAY['00000000-0000-0000-0000-00000073a001']::uuid[], '1/2 recipients failed');
  IF NOT v_ok THEN
    RAISE EXCEPTION 'FAIL finish(error) with the lease token returned false';
  END IF;
END;
$$;

RESET ROLE;

DO $$
DECLARE
  v_row private.class_results_push%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM private.class_results_push
  WHERE class_id = '00000000-0000-0000-0000-0000007370a1';
  IF v_row.status <> 'pending' OR v_row.last_error IS DISTINCT FROM '1/2 recipients failed'
     OR v_row.claim_token IS NOT NULL OR v_row.claimed_until IS NOT NULL
     OR v_row.delivered_to <> ARRAY['00000000-0000-0000-0000-00000073a001']::uuid[]
     OR v_row.sent_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL finish(error) left the wrong row: %', to_jsonb(v_row);
  END IF;
  RAISE NOTICE 'PASS a failed send stays pending with last_error and releases its lease';
END;
$$;

SET LOCAL ROLE service_role;

DO $$
DECLARE
  v_outcome text;
  v_token uuid;
  v_delivered uuid[];
BEGIN
  SELECT b.outcome, b.claim_token, b.delivered_to INTO v_outcome, v_token, v_delivered
  FROM public.begin_class_results_push('00000000-0000-0000-0000-0000007370a1') b;
  IF v_outcome IS DISTINCT FROM 'leased'
     OR v_delivered <> ARRAY['00000000-0000-0000-0000-00000073a001']::uuid[] THEN
    RAISE EXCEPTION 'FAIL the retry lease did not carry delivered_to (outcome %, %)', v_outcome, v_delivered;
  END IF;

  IF NOT public.finish_class_results_push('00000000-0000-0000-0000-0000007370a1',
       v_token, 'sent', ARRAY['00000000-0000-0000-0000-00000073a002']::uuid[],
       '1 recipient has only expired subscriptions') THEN
    RAISE EXCEPTION 'FAIL finish(sent) with the lease token returned false';
  END IF;

  -- Only pending -> sent: the same token cannot finish twice, and a sent
  -- class cannot be leased again.
  IF public.finish_class_results_push('00000000-0000-0000-0000-0000007370a1',
       v_token, 'error', '{}', 'late') THEN
    RAISE EXCEPTION 'FAIL finish changed a row that is already sent';
  END IF;
  IF EXISTS (SELECT 1 FROM public.begin_class_results_push('00000000-0000-0000-0000-0000007370a1')) THEN
    RAISE EXCEPTION 'FAIL a sent class was leased again';
  END IF;

  BEGIN
    PERFORM public.finish_class_results_push('00000000-0000-0000-0000-0000007370a1',
      v_token, 'bogus', '{}', NULL);
    RAISE EXCEPTION 'FAIL finish accepted an unknown outcome';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  -- service_role reaches the private table only through the RPCs.
  BEGIN
    PERFORM 1 FROM private.class_results_push;
    RAISE EXCEPTION 'FAIL service_role read private.class_results_push directly';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

RESET ROLE;

DO $$
DECLARE
  v_row private.class_results_push%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM private.class_results_push
  WHERE class_id = '00000000-0000-0000-0000-0000007370a1';
  IF v_row.status <> 'sent' OR v_row.sent_at IS NULL
     OR v_row.last_error IS DISTINCT FROM '1 recipient has only expired subscriptions'
     OR v_row.claim_token IS NOT NULL
     OR v_row.delivered_to <> ARRAY['00000000-0000-0000-0000-00000073a001',
                                    '00000000-0000-0000-0000-00000073a002']::uuid[] THEN
    RAISE EXCEPTION 'FAIL finish(sent) left the wrong row: %', to_jsonb(v_row);
  END IF;
  RAISE NOTICE 'PASS the lease is single-holder, finish needs its token, sent only from pending and only once';
END;
$$;

-- ============================================================================
-- 6. Un-released before the send: held, row deleted, re-release re-queues.
-- ============================================================================

DO $$
DECLARE
  v_outcome text;
BEGIN
  UPDATE public.classes SET results_released_at = NULL
  WHERE id = '00000000-0000-0000-0000-0000007370c1';

  SET LOCAL ROLE service_role;
  SELECT b.outcome INTO v_outcome
  FROM public.begin_class_results_push('00000000-0000-0000-0000-0000007370c1') b;
  RESET ROLE;

  IF v_outcome IS DISTINCT FROM 'held' THEN
    RAISE EXCEPTION 'FAIL begin on an un-released class returned % instead of held', v_outcome;
  END IF;
  IF EXISTS (SELECT 1 FROM private.class_results_push WHERE class_id = '00000000-0000-0000-0000-0000007370c1') THEN
    RAISE EXCEPTION 'FAIL the held class kept its pending row';
  END IF;

  UPDATE public.classes SET results_released_at = now()
  WHERE id = '00000000-0000-0000-0000-0000007370c1';
  IF NOT EXISTS (SELECT 1 FROM private.class_results_push
                 WHERE class_id = '00000000-0000-0000-0000-0000007370c1' AND status = 'pending' AND attempts = 1)
     OR pg_temp.posts_for('00000000-0000-0000-0000-0000007370c1') <> 2 THEN
    RAISE EXCEPTION 'FAIL re-releasing the class did not queue a fresh push';
  END IF;
  RAISE NOTICE 'PASS an un-released class is held (row deleted) and re-queued on the next release';
END;
$$;

-- ============================================================================
-- 7. Retry.
-- ============================================================================

DO $$
DECLARE
  v_row private.class_results_push%ROWTYPE;
BEGIN
  -- B: stale and unleased -> re-posted, attempt counted.
  UPDATE private.class_results_push SET last_attempt_at = now() - interval '6 minutes'
  WHERE class_id = '00000000-0000-0000-0000-0000007370b1';
  -- C: fresh (queued just above) -> left alone.

  PERFORM private.retry_class_results_push('http://127.0.0.1:9/functions/v1', 'myk9-737-test-secret');

  SELECT * INTO v_row FROM private.class_results_push WHERE class_id = '00000000-0000-0000-0000-0000007370b1';
  IF v_row.status <> 'pending' OR v_row.attempts <> 2 OR v_row.last_attempt_at < now() - interval '1 minute'
     OR pg_temp.posts_for('00000000-0000-0000-0000-0000007370b1') <> 2 THEN
    RAISE EXCEPTION 'FAIL retry did not re-post the stale row once: % (posts %)',
      to_jsonb(v_row), pg_temp.posts_for('00000000-0000-0000-0000-0000007370b1');
  END IF;
  IF (SELECT attempts FROM private.class_results_push WHERE class_id = '00000000-0000-0000-0000-0000007370c1') <> 1
     OR pg_temp.posts_for('00000000-0000-0000-0000-0000007370c1') <> 2 THEN
    RAISE EXCEPTION 'FAIL retry re-posted a row whose last attempt is fresh';
  END IF;

  -- B stale again but leased by an in-flight send -> left alone.
  UPDATE private.class_results_push
  SET last_attempt_at = now() - interval '6 minutes',
      claim_token = gen_random_uuid(), claimed_until = now() + interval '4 minutes'
  WHERE class_id = '00000000-0000-0000-0000-0000007370b1';
  PERFORM private.retry_class_results_push('http://127.0.0.1:9/functions/v1', 'myk9-737-test-secret');
  IF (SELECT attempts FROM private.class_results_push WHERE class_id = '00000000-0000-0000-0000-0000007370b1') <> 2
     OR pg_temp.posts_for('00000000-0000-0000-0000-0000007370b1') <> 2 THEN
    RAISE EXCEPTION 'FAIL retry re-posted a row with a live lease';
  END IF;

  -- The lease lapsed on the 4th attempt: the 5th is posted, then after its
  -- five minutes the row is failed and not posted again.
  UPDATE private.class_results_push
  SET attempts = 4, last_attempt_at = now() - interval '6 minutes',
      claimed_until = now() - interval '1 minute'
  WHERE class_id = '00000000-0000-0000-0000-0000007370b1';
  PERFORM private.retry_class_results_push('http://127.0.0.1:9/functions/v1', 'myk9-737-test-secret');
  SELECT * INTO v_row FROM private.class_results_push WHERE class_id = '00000000-0000-0000-0000-0000007370b1';
  IF v_row.status <> 'pending' OR v_row.attempts <> 5
     OR pg_temp.posts_for('00000000-0000-0000-0000-0000007370b1') <> 3 THEN
    RAISE EXCEPTION 'FAIL retry did not make the fifth attempt: %', to_jsonb(v_row);
  END IF;

  UPDATE private.class_results_push SET last_attempt_at = now() - interval '6 minutes'
  WHERE class_id = '00000000-0000-0000-0000-0000007370b1';
  PERFORM private.retry_class_results_push('http://127.0.0.1:9/functions/v1', 'myk9-737-test-secret');
  SELECT * INTO v_row FROM private.class_results_push WHERE class_id = '00000000-0000-0000-0000-0000007370b1';
  IF v_row.status <> 'failed' OR v_row.attempts <> 5
     OR pg_temp.posts_for('00000000-0000-0000-0000-0000007370b1') <> 3 THEN
    RAISE EXCEPTION 'FAIL the fifth failed attempt did not mark the row failed: % (posts %)',
      to_jsonb(v_row), pg_temp.posts_for('00000000-0000-0000-0000-0000007370b1');
  END IF;

  -- A failed class cannot be leased: nothing sends it any more.
  SET LOCAL ROLE service_role;
  IF EXISTS (SELECT 1 FROM public.begin_class_results_push('00000000-0000-0000-0000-0000007370b1')) THEN
    RAISE EXCEPTION 'FAIL a failed class was leased';
  END IF;
  RESET ROLE;

  -- A missing secret raises, so the cron run records a failure.
  BEGIN
    PERFORM private.retry_class_results_push('http://127.0.0.1:9/functions/v1', NULL);
    RAISE EXCEPTION 'FAIL retry accepted a missing secret';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Missing Vault secret%' THEN
      RAISE;
    END IF;
  END;

  -- The shared post helper with no config records why and posts nothing.
  PERFORM private.post_class_results_push('00000000-0000-0000-0000-0000007370c1', NULL, NULL);
  IF (SELECT last_error FROM private.class_results_push WHERE class_id = '00000000-0000-0000-0000-0000007370c1')
       NOT LIKE 'edge function config is not set%'
     OR pg_temp.posts_for('00000000-0000-0000-0000-0000007370c1') <> 2 THEN
    RAISE EXCEPTION 'FAIL the post helper without config did not record last_error';
  END IF;
  RAISE NOTICE 'PASS retry re-posts only stale unleased rows, counts attempts, fails after five, refuses a missing secret';
END;
$$;

-- ============================================================================
-- 7b. Nothing to announce yet (Codex round 2): a class released before any
--     entry is scored queues nothing; the retry's sweep queues it once an
--     entry is scored. A class with only scratches and absences never queues.
--     The audience is the same predicate. The sweep is bounded.
-- ============================================================================

DO $$
DECLARE
  v_token uuid;
BEGIN
  UPDATE public.classes SET status = 'completed', results_released_at = now()
  WHERE id = '00000000-0000-0000-0000-0000007370f1';
  IF EXISTS (SELECT 1 FROM private.class_results_push WHERE class_id = '00000000-0000-0000-0000-0000007370f1')
     OR pg_temp.posts_for('00000000-0000-0000-0000-0000007370f1') <> 0 THEN
    RAISE EXCEPTION 'FAIL a class released before any entry was scored queued the push';
  END IF;

  -- Scoring touches entries, not classes: the trigger cannot see it.
  UPDATE public.entries
  SET scoring_completed_at = now(), is_scored = true, result_status = 'qualified',
      entry_status = 'completed', check_in_status = 'completed'
  WHERE id = '00000000-0000-0000-0000-00000073e0f1';
  IF EXISTS (SELECT 1 FROM private.class_results_push WHERE class_id = '00000000-0000-0000-0000-0000007370f1') THEN
    RAISE EXCEPTION 'FIXTURE scoring an entry queued the push directly';
  END IF;

  PERFORM private.retry_class_results_push('http://127.0.0.1:9/functions/v1', 'myk9-737-test-secret');
  IF NOT EXISTS (SELECT 1 FROM private.class_results_push
                 WHERE class_id = '00000000-0000-0000-0000-0000007370f1' AND status = 'pending' AND attempts = 1)
     OR pg_temp.posts_for('00000000-0000-0000-0000-0000007370f1') <> 1 THEN
    RAISE EXCEPTION 'FAIL the retry sweep did not queue and post the newly scored class';
  END IF;

  -- If the results vanish between the lease and the read, the edge function
  -- finishes 'held': the row goes, and the sweep re-queues the class.
  SET LOCAL ROLE service_role;
  SELECT b.claim_token INTO v_token
  FROM public.begin_class_results_push('00000000-0000-0000-0000-0000007370f1') b;
  IF NOT public.finish_class_results_push('00000000-0000-0000-0000-0000007370f1', v_token, 'held', '{}', NULL) THEN
    RAISE EXCEPTION 'FAIL finish(held) with the lease token returned false';
  END IF;
  RESET ROLE;
  IF EXISTS (SELECT 1 FROM private.class_results_push WHERE class_id = '00000000-0000-0000-0000-0000007370f1') THEN
    RAISE EXCEPTION 'FAIL finish(held) did not delete the row';
  END IF;
  PERFORM private.retry_class_results_push('http://127.0.0.1:9/functions/v1', 'myk9-737-test-secret');
  IF NOT EXISTS (SELECT 1 FROM private.class_results_push
                 WHERE class_id = '00000000-0000-0000-0000-0000007370f1' AND status = 'pending')
     OR pg_temp.posts_for('00000000-0000-0000-0000-0000007370f1') <> 2 THEN
    RAISE EXCEPTION 'FAIL the sweep did not re-queue a held class that is due again';
  END IF;
  RAISE NOTICE 'PASS release before scoring queues nothing; the sweep queues it once scored, and re-queues after a hold';
END;
$$;

DO $$
DECLARE
  v_health jsonb;
BEGIN
  UPDATE public.classes SET status = 'completed', is_scoring_finalized = true, results_released_at = now()
  WHERE id = '00000000-0000-0000-0000-000000737091';
  PERFORM private.retry_class_results_push('http://127.0.0.1:9/functions/v1', 'myk9-737-test-secret');
  IF EXISTS (SELECT 1 FROM private.class_results_push WHERE class_id = '00000000-0000-0000-0000-000000737091')
     OR pg_temp.posts_for('00000000-0000-0000-0000-000000737091') <> 0 THEN
    RAISE EXCEPTION 'FAIL a class with only scratched and absent entries queued the push';
  END IF;
  SET LOCAL ROLE service_role;
  v_health := public.class_results_push_health();
  RESET ROLE;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_health -> 'sample') s
             WHERE s ->> 'class_name' = 'MYK9-737 G nothing to announce') THEN
    RAISE EXCEPTION 'FAIL health named a class with nothing to announce';
  END IF;
  RAISE NOTICE 'PASS a class with only scratches and absences never queues and never alarms';
END;
$$;

DO $$
DECLARE
  v_rows integer;
BEGIN
  SET LOCAL ROLE service_role;
  SELECT count(*) INTO v_rows
  FROM public.class_results_push_audience('00000000-0000-0000-0000-0000007370a1');
  IF v_rows <> 2 THEN
    RAISE EXCEPTION 'FAIL the audience returned % rows for A, expected 2 (scratch and absence excluded)', v_rows;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.class_results_push_audience('00000000-0000-0000-0000-0000007370a1') a
    WHERE a.dog_call_name = 'Rex'
      AND a.owner_auth_user_id = '00000000-0000-0000-0000-00000073a101'
      AND a.co_owner_auth_user_id IS NULL
      AND a.handler_auth_user_id = '00000000-0000-0000-0000-00000073a102'
  ) THEN
    RAISE EXCEPTION 'FAIL the audience did not resolve Rex''s owner and handler accounts';
  END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS the audience is the announceable entries with their owner, co-owner and handler accounts';
END;
$$;

DO $$
BEGIN
  -- Two classes that become due without the trigger seeing it (the
  -- class-status rollup finalizes a class when its entries are scored, which
  -- would fire the trigger, so it is off while they are set up). Their ids
  -- sort before every other fixture class, and the CI database has no other
  -- classes (db reset --no-seed).
  ALTER TABLE public.classes DISABLE TRIGGER trg_notify_class_results_push;
  INSERT INTO public.classes (id, trial_id, name, status, status_source)
  VALUES
    ('00000000-0000-0000-0000-000073710001', '00000000-0000-0000-0000-000000737003',
     'MYK9-737 H1 sweep', 'completed', 'manual'),
    ('00000000-0000-0000-0000-000073710002', '00000000-0000-0000-0000-000000737003',
     'MYK9-737 H2 sweep', 'completed', 'manual');
  INSERT INTO public.entries
    (class_id, show_id, trial_id, entry_status, check_in_status, is_scored, result_status, scoring_completed_at)
  VALUES
    ('00000000-0000-0000-0000-000073710001', '00000000-0000-0000-0000-000000737002',
     '00000000-0000-0000-0000-000000737003', 'completed', 'completed', true, 'qualified', now()),
    ('00000000-0000-0000-0000-000073710002', '00000000-0000-0000-0000-000000737002',
     '00000000-0000-0000-0000-000000737003', 'completed', 'completed', true, 'qualified', now());
  ALTER TABLE public.classes ENABLE TRIGGER trg_notify_class_results_push;
  IF EXISTS (SELECT 1 FROM private.class_results_push
             WHERE class_id IN ('00000000-0000-0000-0000-000073710001', '00000000-0000-0000-0000-000073710002'))
     OR NOT private.class_results_push_due('00000000-0000-0000-0000-000073710001')
     OR NOT private.class_results_push_due('00000000-0000-0000-0000-000073710002') THEN
    RAISE EXCEPTION 'FIXTURE the sweep classes must be due with no row';
  END IF;

  PERFORM private.retry_class_results_push('http://127.0.0.1:9/functions/v1', 'myk9-737-test-secret', 1);
  IF NOT EXISTS (SELECT 1 FROM private.class_results_push WHERE class_id = '00000000-0000-0000-0000-000073710001')
     OR EXISTS (SELECT 1 FROM private.class_results_push WHERE class_id = '00000000-0000-0000-0000-000073710002') THEN
    RAISE EXCEPTION 'FAIL a sweep limited to 1 did not queue exactly the first due class';
  END IF;

  PERFORM private.retry_class_results_push('http://127.0.0.1:9/functions/v1', 'myk9-737-test-secret');
  IF NOT EXISTS (SELECT 1 FROM private.class_results_push WHERE class_id = '00000000-0000-0000-0000-000073710002')
     OR pg_temp.posts_for('00000000-0000-0000-0000-000073710001') <> 1
     OR pg_temp.posts_for('00000000-0000-0000-0000-000073710002') <> 1 THEN
    RAISE EXCEPTION 'FAIL the next sweep did not pick up the rest, once each';
  END IF;
  RAISE NOTICE 'PASS the sweep is bounded per run and the next run takes the rest';
END;
$$;

-- ============================================================================
-- 8. Health.
-- ============================================================================

DO $$
DECLARE
  v_health jsonb;
BEGIN
  -- C: pending on its third attempt -> stuck too.
  UPDATE private.class_results_push SET attempts = 3
  WHERE class_id = '00000000-0000-0000-0000-0000007370c1';

  SET LOCAL ROLE service_role;
  v_health := public.class_results_push_health();
  RESET ROLE;

  IF (v_health ->> 'stuck')::int < 2 OR (v_health ->> 'failed')::int < 1 THEN
    RAISE EXCEPTION 'FAIL health did not count the stuck rows: %', v_health;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_health -> 'sample') s
                 WHERE s ->> 'class_name' = 'MYK9-737 B standard' AND s ->> 'status' = 'failed'
                   AND s ->> 'show_name' = 'MYK9-737 Standard Show')
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_health -> 'sample') s
                    WHERE s ->> 'class_name' = 'MYK9-737 C held' AND s ->> 'status' = 'pending') THEN
    RAISE EXCEPTION 'FAIL health did not name the stuck classes: %', v_health;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_health -> 'sample') s
             WHERE s ->> 'class_name' = 'MYK9-737 A default') THEN
    RAISE EXCEPTION 'FAIL health named a sent class';
  END IF;
  RAISE NOTICE 'PASS health names failed and 3+-attempt pending classes';
END;
$$;

-- A pending row whose first post was lost and whose retry never came (cron
-- missing or stopped) sits at attempts = 1: stuck once it has had no attempt
-- for 20 minutes, not before.
DO $$
DECLARE
  v_health jsonb;
BEGIN
  UPDATE public.classes SET status = 'completed'
  WHERE id = '00000000-0000-0000-0000-0000007370e1';

  SET LOCAL ROLE service_role;
  v_health := public.class_results_push_health();
  RESET ROLE;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_health -> 'sample') s
             WHERE s ->> 'class_name' = 'MYK9-737 E stalled') THEN
    RAISE EXCEPTION 'FAIL health named a fresh pending class: %', v_health;
  END IF;

  UPDATE private.class_results_push SET last_attempt_at = now() - interval '30 minutes'
  WHERE class_id = '00000000-0000-0000-0000-0000007370e1' AND status = 'pending' AND attempts = 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FIXTURE E did not queue a pending first attempt';
  END IF;

  SET LOCAL ROLE service_role;
  v_health := public.class_results_push_health();
  RESET ROLE;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_health -> 'sample') s
                 WHERE s ->> 'class_name' = 'MYK9-737 E stalled' AND (s ->> 'attempts')::int = 1) THEN
    RAISE EXCEPTION 'FAIL health did not name a pending class with no attempt for 30 minutes: %', v_health;
  END IF;
  RAISE NOTICE 'PASS health names a pending class whose retry has stalled (20 minutes, attempts 1)';
END;
$$;

-- ============================================================================
-- 9. Wiring.
-- ============================================================================

DO $$
DECLARE
  v_job record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_notify_class_results_push'
      AND tgrelid = 'public.classes'::regclass
      AND tgenabled <> 'D'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'FAIL trg_notify_class_results_push is missing or disabled on classes';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_notify_entry_scoring_push'
      AND tgrelid = 'public.entries'::regclass
  ) THEN
    RAISE EXCEPTION 'FAIL the per-entry scoring push trigger still exists';
  END IF;
  IF to_regprocedure('public.notify_entry_scoring_push()') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL public.notify_entry_scoring_push() still exists';
  END IF;

  -- The cron is scheduled only where push_webhook_secret existed when the
  -- migration ran (production does; the CI database does not).
  SELECT * INTO v_job FROM cron.job WHERE jobname = 'class-results-push-retry';
  IF FOUND THEN
    IF v_job.schedule <> '*/5 * * * *'
       OR v_job.command NOT LIKE '%private.retry_class_results_push(%'
       OR v_job.command NOT LIKE '%name = ''edge_function_base_url''%'
       OR v_job.command NOT LIKE '%name = ''push_webhook_secret''%' THEN
      RAISE EXCEPTION 'FAIL class-results-push-retry is mis-scheduled: % %', v_job.schedule, v_job.command;
    END IF;
    RAISE NOTICE 'PASS class-results-push-retry runs every five minutes with inline Vault reads';
  ELSE
    RAISE NOTICE 'SKIP class-results-push-retry is not scheduled here (no push_webhook_secret at migration time)';
  END IF;
  RAISE NOTICE 'PASS the results push is wired to classes and the per-entry push is gone';
END;
$$;

-- ============================================================================
-- 10. Backfill invariant: every class already due has a row.
-- ============================================================================

DO $$
DECLARE
  v_missing integer;
BEGIN
  SELECT count(*) INTO v_missing
  FROM public.classes c
  WHERE private.class_results_push_due(c.id)
    AND NOT EXISTS (SELECT 1 FROM private.class_results_push p WHERE p.class_id = c.id);
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'FAIL % due classes have no push row (backfill or trigger missed them)', v_missing;
  END IF;
  RAISE NOTICE 'PASS every due class has a push row';
END;
$$;

-- ============================================================================
-- 11. Grants.
-- ============================================================================

DO $$
DECLARE
  r text;
  f text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF has_table_privilege(r, 'private.class_results_push', 'SELECT')
       OR has_table_privilege(r, 'private.class_results_push', 'INSERT')
       OR has_table_privilege(r, 'private.class_results_push', 'UPDATE')
       OR has_table_privilege(r, 'private.class_results_push', 'DELETE') THEN
      RAISE EXCEPTION 'FAIL % holds a privilege on private.class_results_push', r;
    END IF;
    FOREACH f IN ARRAY ARRAY[
      'private.class_results_push_due(uuid)',
      'private.claim_class_results_push(uuid)',
      'private.post_class_results_push(uuid, text, text)',
      'private.retry_class_results_push(text, text, integer)',
      'private.class_results_push_announces(timestamptz, timestamptz, text, text)',
      'public.notify_class_results_push()'
    ] LOOP
      IF has_function_privilege(r, f, 'EXECUTE') THEN
        RAISE EXCEPTION 'FAIL % can execute %', r, f;
      END IF;
    END LOOP;
  END LOOP;

  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH f IN ARRAY ARRAY[
      'public.begin_class_results_push(uuid)',
      'public.finish_class_results_push(uuid, uuid, text, uuid[], text)',
      'public.class_results_push_health()',
      'public.class_results_push_audience(uuid)'
    ] LOOP
      IF has_function_privilege(r, f, 'EXECUTE') THEN
        RAISE EXCEPTION 'FAIL % can execute %', r, f;
      END IF;
    END LOOP;
  END LOOP;

  IF NOT has_function_privilege('service_role', 'public.begin_class_results_push(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.finish_class_results_push(uuid, uuid, text, uuid[], text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.class_results_push_health()', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.class_results_push_audience(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL service_role cannot execute the edge-function RPCs';
  END IF;
  RAISE NOTICE 'PASS no client role reaches the push table or functions; service_role reaches only the RPCs';
END;
$$;

ROLLBACK;
