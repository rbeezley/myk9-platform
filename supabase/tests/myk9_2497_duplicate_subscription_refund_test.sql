-- MYK9-2497 (migration 20261128054100): a second premium subscription for a
-- customer who already holds a live one is queued as a 'duplicate_subscription'
-- refund request for its first invoice, keyed on the duplicate subscription.
--
-- Properties asserted here:
--   D1  Shape and ACL: queue_duplicate_subscription_refund is SECURITY DEFINER
--       with search_path '' and executable by service_role only; the kind
--       CHECK accepts 'duplicate_subscription'; the new column carries no
--       column-level grant and anon still has no table privilege.
--   D2  It refuses a missing subscription, session or intent and a
--       non-positive amount, writing nothing.
--   D3  'queued' inserts one pending request: the kind, the reason, the
--       duplicate subscription id, the duplicate's session and intent, and the
--       subscription id in detail.
--   D4  A retry is 'already_queued': same row, nothing new.
--   D5  THE KEY: the other completion event names the same duplicate under
--       another session id; it is 'already_queued' and the row keeps the
--       session it was queued with.
--   D6  Once that refund settled (refunded), a later call for the same
--       duplicate, under another session and intent, is still
--       'already_queued': no second request, ever.
--   D7  Structurally: a direct second 'duplicate_subscription' insert for the
--       same subscription is refused (23505), whatever its session or status.
--   D8  The shape CHECK: the kind requires a subscription id, and no other
--       kind may carry one (23514).
--   D9  'other_request' when another live request holds the payment intent:
--       nothing inserted.
--
-- All fixtures roll back. Run with psql -X -v ON_ERROR_STOP=1 after migrations.

BEGIN;

CREATE FUNCTION pg_temp.expect_eq(p_actual text, p_expected text, p_label text)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'FAIL %: got %, expected %', p_label, p_actual, p_expected;
  END IF;
  RAISE NOTICE 'PASS %', p_label;
END;
$f$;

CREATE FUNCTION pg_temp.expect_sqlstate(p_sql text, p_state text, p_label text)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> p_state THEN
      RAISE EXCEPTION 'FAIL %: SQLSTATE % (%), expected %', p_label, SQLSTATE, SQLERRM, p_state;
    END IF;
    RAISE NOTICE 'PASS % (%)', p_label, p_state;
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL %: succeeded, expected SQLSTATE %', p_label, p_state;
END;
$f$;

-- Queue the duplicate with the webhook's arguments; returns the outcome row.
CREATE FUNCTION pg_temp.queue(p_subscription text, p_session text, p_intent text)
RETURNS TABLE (outcome text, refund_request_id uuid, request_status text,
               amount_cents integer, stripe_payment_intent_id text,
               stripe_checkout_session_id text)
LANGUAGE sql AS $f$
  SELECT * FROM public.queue_duplicate_subscription_refund(
    p_subscription, p_session, p_intent, 499,
    '{"kept_subscription_id": "sub_2497_kept", "stripe_customer_id": "cus_2497"}'::jsonb)
$f$;

-- ---------------------------------------------------------------------------
-- D1. Shape and ACL
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fn text := 'public.queue_duplicate_subscription_refund(text, text, text, integer, jsonb)';
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT p.prosecdef || ' ' || array_to_string(p.proconfig, ',')
       FROM pg_proc p WHERE p.oid = v_fn::regprocedure),
    'true search_path=""', 'D1 queue_duplicate_subscription_refund is SECURITY DEFINER, empty search_path');
  PERFORM pg_temp.expect_eq(
    has_function_privilege('anon', v_fn, 'EXECUTE') || ' '
      || has_function_privilege('authenticated', v_fn, 'EXECUTE') || ' '
      || has_function_privilege('service_role', v_fn, 'EXECUTE'),
    'false false true', 'D1 queue_duplicate_subscription_refund is service_role only');
  PERFORM pg_temp.expect_eq(
    (SELECT pg_get_constraintdef(c.oid) LIKE '%duplicate_subscription%'
       FROM pg_constraint c WHERE c.conname = 'refund_requests_kind_check')::text,
    'true', 'D1 the kind CHECK accepts duplicate_subscription');
  PERFORM pg_temp.expect_eq(
    (SELECT (a.attacl IS NULL)::text FROM pg_attribute a
      WHERE a.attrelid = 'public.refund_requests'::regclass
        AND a.attname = 'stripe_subscription_id'),
    'true', 'D1 stripe_subscription_id has no column-level grant');
  PERFORM pg_temp.expect_eq(
    has_table_privilege('anon', 'public.refund_requests', 'SELECT') || ' '
      || has_column_privilege('anon', 'public.refund_requests', 'stripe_subscription_id', 'SELECT'),
    'false false', 'D1 anon still cannot read refund_requests or the new column');
END;
$$;

SET LOCAL ROLE service_role;

-- ---------------------------------------------------------------------------
-- D2. Refusals write nothing
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_sqlstate(
  $$SELECT * FROM public.queue_duplicate_subscription_refund(NULL, 'cs_2497_x', 'pi_2497_x', 499)$$,
  '22023', 'D2 a missing subscription is refused');
SELECT pg_temp.expect_sqlstate(
  $$SELECT * FROM public.queue_duplicate_subscription_refund('sub_2497_x', NULL, 'pi_2497_x', 499)$$,
  '22023', 'D2 a missing session is refused');
SELECT pg_temp.expect_sqlstate(
  $$SELECT * FROM public.queue_duplicate_subscription_refund('sub_2497_x', 'cs_2497_x', NULL, 499)$$,
  '22023', 'D2 a missing payment intent is refused');
SELECT pg_temp.expect_sqlstate(
  $$SELECT * FROM public.queue_duplicate_subscription_refund('sub_2497_x', 'cs_2497_x', 'pi_2497_x', 0)$$,
  '22023', 'D2 a zero amount is refused');
SELECT pg_temp.expect_eq(
  (SELECT count(*)::text FROM public.refund_requests WHERE stripe_subscription_id = 'sub_2497_x'),
  '0', 'D2 nothing was written');

-- ---------------------------------------------------------------------------
-- D3. Queued
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_eq(
  (SELECT outcome || ' ' || request_status || ' ' || amount_cents || ' '
          || stripe_checkout_session_id || ' ' || stripe_payment_intent_id
     FROM pg_temp.queue('sub_2497_dup', 'cs_2497_dup', 'pi_2497_dup')),
  'queued pending 499 cs_2497_dup pi_2497_dup', 'D3 the duplicate is queued for its first invoice');
SELECT pg_temp.expect_eq(
  (SELECT kind || ' ' || reason || ' ' || stripe_subscription_id || ' '
          || (detail ->> 'duplicate_subscription_id') || ' ' || (detail ->> 'kept_subscription_id')
     FROM public.refund_requests WHERE stripe_subscription_id = 'sub_2497_dup'),
  'duplicate_subscription duplicate_subscription sub_2497_dup sub_2497_dup sub_2497_kept',
  'D3 the row names the kind, the duplicate and the kept subscription');

-- ---------------------------------------------------------------------------
-- D4. A retry is already_queued
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_eq(
  (SELECT outcome FROM pg_temp.queue('sub_2497_dup', 'cs_2497_dup', 'pi_2497_dup')),
  'already_queued', 'D4 a retry is already_queued');

-- ---------------------------------------------------------------------------
-- D5. The other completion event: same duplicate, another session id
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_eq(
  (SELECT outcome || ' ' || stripe_checkout_session_id
     FROM pg_temp.queue('sub_2497_dup', 'cs_2497_kept', 'pi_2497_dup')),
  'already_queued cs_2497_dup', 'D5 the other event finds the request; it keeps its session');
SELECT pg_temp.expect_eq(
  (SELECT count(*)::text FROM public.refund_requests WHERE stripe_subscription_id = 'sub_2497_dup'),
  '1', 'D5 still one request for the duplicate');

-- ---------------------------------------------------------------------------
-- D6. After the refund settled, nothing new for the same duplicate
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_req uuid := (SELECT id FROM public.refund_requests WHERE stripe_subscription_id = 'sub_2497_dup');
  v_b record;
  v_r record;
  v_s record;
BEGIN
  SELECT * INTO v_b FROM public.begin_refund_attempt(v_req, '00000000-0000-0000-0000-000000249701');
  PERFORM pg_temp.expect_eq(v_b.outcome || ' ' || v_b.kind || ' ' || v_b.amount_cents,
    'claimed duplicate_subscription 499', 'D6 approval claims attempt 1');
  SELECT * INTO v_r FROM public.record_refund_attempt(v_b.attempt_id, v_b.attempt_version, 're_2497');
  SELECT * INTO v_s FROM public.settle_refund_attempt(v_b.attempt_id, v_r.attempt_version, 'succeeded');
  PERFORM pg_temp.expect_eq(v_s.request_status, 'refunded', 'D6 the settled refund closes the request');
END;
$$;
SELECT pg_temp.expect_eq(
  (SELECT outcome || ' ' || request_status
     FROM pg_temp.queue('sub_2497_dup', 'cs_2497_kept', 'pi_2497_other')),
  'already_queued refunded', 'D6 a later event for the settled duplicate queues nothing');
SELECT pg_temp.expect_eq(
  (SELECT count(*)::text FROM public.refund_requests WHERE stripe_subscription_id = 'sub_2497_dup'),
  '1', 'D6 still one request, ever');

-- ---------------------------------------------------------------------------
-- D7. The unique key, structurally
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_sqlstate(
  $$INSERT INTO public.refund_requests (kind, stripe_checkout_session_id,
      stripe_payment_intent_id, amount_cents, reason, stripe_subscription_id)
    VALUES ('duplicate_subscription', 'cs_2497_d7', 'pi_2497_d7', 499,
            'duplicate_subscription', 'sub_2497_dup')$$,
  '23505', 'D7 a second request for one duplicate subscription is refused');

-- ---------------------------------------------------------------------------
-- D8. The shape CHECK
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_sqlstate(
  $$INSERT INTO public.refund_requests (kind, stripe_checkout_session_id,
      stripe_payment_intent_id, amount_cents, reason)
    VALUES ('duplicate_subscription', 'cs_2497_d8', 'pi_2497_d8', 499, 'duplicate_subscription')$$,
  '23514', 'D8 the kind requires a subscription id');
SELECT pg_temp.expect_sqlstate(
  $$INSERT INTO public.refund_requests (kind, stripe_checkout_session_id,
      stripe_payment_intent_id, amount_cents, reason, stripe_subscription_id)
    VALUES ('unfulfilled_charge', 'cs_2497_d8b', 'pi_2497_d8b', 499, 'no_cart', 'sub_2497_d8b')$$,
  '23514', 'D8 no other kind carries a subscription id');

-- ---------------------------------------------------------------------------
-- D9. Another live request on the payment intent
-- ---------------------------------------------------------------------------
INSERT INTO public.refund_requests (kind, stripe_checkout_session_id,
    stripe_payment_intent_id, amount_cents, reason)
VALUES ('unfulfilled_charge', 'cs_2497_d9_other', 'pi_2497_d9', 499, 'no_cart');
SELECT pg_temp.expect_eq(
  (SELECT outcome FROM pg_temp.queue('sub_2497_d9', 'cs_2497_d9', 'pi_2497_d9')),
  'other_request', 'D9 another live request on the intent is other_request');
SELECT pg_temp.expect_eq(
  (SELECT count(*)::text FROM public.refund_requests WHERE stripe_subscription_id = 'sub_2497_d9'),
  '0', 'D9 nothing was inserted');

RESET ROLE;

ROLLBACK;
