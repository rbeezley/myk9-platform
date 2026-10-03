-- MYK9-876 + MYK9-874 (migration 20261003013900): refunds are never
-- automatic, and refund and fulfillment of one paid cart are mutually
-- exclusive through entry_carts.status.
--
-- Properties asserted here:
--   * ACL: anon and authenticated can execute none of the refund RPCs;
--     service_role can. anon holds no privilege on refund_requests or
--     refund_request_attempts; authenticated may SELECT both (RLS: site
--     admins) but never write.
--   * entry_carts.status accepts 'refund_pending' and still rejects junk.
--   * claim_abandoned_cart_refund on an abandoned cart that points at the paid
--     session: 'claimed', the cart moves to refund_pending, ONE request.
--   * TWO-DELIVERY INTERLEAVING: the second delivery of the same session gets
--     'already_pending' with the same request id (the webhook returns 2xx),
--     and the fulfillment claim (`status = 'active'`) then matches no row.
--   * The reverse order: an ACTIVE cart on the paid session is
--     'not_refundable' and fulfillment still wins it; a cart fulfilled first
--     (active -> submitted) is 'not_refundable', and so is an abandoned cart
--     pointing at ANOTHER session. None queues a request.
--   * The cart owner can neither set refund_pending nor move a cart out of it
--     (42501 from entry_carts_protect_status).
--   * request_refund_approval is idempotent per (session, kind) and refuses
--     the abandoned_cart kind (which must go through the cart claim).
--   * ATTEMPTS (Codex rounds 1-2 on #2689), as a table of event orderings,
--     each on its own request:
--       O1 no attempts -> pending; begin -> attempt 1, awaiting_stripe; begin
--          again -> 'resume' (no new attempt); success -> refunded; begin ->
--          'already_refunded', still one attempt.
--       O2 (Codex P1) attempt 1 fails -> failed with its reason; attempt 2
--          opens; a DELAYED success for attempt 1's refund changes attempt 1
--          only (attempt 2 keeps its own refund and status); the request is
--          refunded (money moved) and live_attempts reports 2; attempt 2's
--          later failure is recorded on attempt 2.
--       O3 (Codex P2) a DELAYED in-flight note from attempt 1's approval
--          after attempt 2 opened neither regresses attempt 1 nor touches
--          attempt 2; a different id for attempt 1 is
--          'attempt_has_other_refund'; recording attempt 1's refund on
--          attempt 2 is 'refund_on_other_attempt'.
--       O4 success then failure -> failed; a new attempt 2 can open.
--       O5 late failure of an OLD attempt after a newer one succeeded ->
--          request stays refunded.
--       O6 a reported 'pending' never regresses a settled attempt.
--       O7 settle for a refund no attempt owns -> 'not_found', no writes.
--       O8 a second pending attempt is refused by the index (23505).
--       O10 a canceled latest attempt reads failed with its status.
--       O9 abandoned cart fulfilled after all -> 'fulfilled', no attempt;
--          a still-held abandoned cart can be approved.
--
-- Two concurrent sessions cannot be driven from one psql script; the row
-- locks (FOR UPDATE on the cart and the request) serialise them, and each
-- ordering is asserted sequentially below.
--
-- All fixtures roll back. Run with psql -X -v ON_ERROR_STOP=1 after migrations.

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures: exhibitor 876101 (people 876011), admin uid 876102, a draft show.
-- ---------------------------------------------------------------------------
INSERT INTO public.people (id, first_name, last_name, email)
VALUES ('00000000-0000-0000-0000-000000876011', 'MYK9-876', 'Exhibitor',
        'myk9876-exh@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES ('00000000-0000-0000-0000-000000876101', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'myk9876-exh@example.test', '', now(), now(), now(),
        '{}', '{}', false, false, false);

INSERT INTO public.exhibitor_profiles (person_id, auth_user_id)
SELECT '00000000-0000-0000-0000-000000876011', '00000000-0000-0000-0000-000000876101'
WHERE NOT EXISTS (SELECT 1 FROM public.exhibitor_profiles
                  WHERE auth_user_id = '00000000-0000-0000-0000-000000876101');

INSERT INTO public.shows (id, name, organization, start_date, end_date, status)
VALUES ('00000000-0000-0000-0000-000000876021', 'MYK9-876 Show', 'AKC',
        current_date + 30, current_date + 30, 'draft');

-- Carts carry a checkout session id, which only service_role may write
-- (trg_entry_carts_protect_session_id).
SET LOCAL ROLE service_role;
INSERT INTO public.entry_carts (id, exhibitor_id, show_id, status, stripe_checkout_session_id)
SELECT v.id::uuid, ep.id, '00000000-0000-0000-0000-000000876021', v.status, v.session
FROM public.exhibitor_profiles ep
CROSS JOIN (VALUES
  ('00000000-0000-0000-0000-000000876031', 'abandoned', 'cs_876_abandoned'),
  ('00000000-0000-0000-0000-000000876032', 'active',    'cs_876_active'),
  ('00000000-0000-0000-0000-000000876033', 'abandoned', 'cs_876_current'),
  ('00000000-0000-0000-0000-000000876034', 'expired',   'cs_876_expired'),
  ('00000000-0000-0000-0000-000000876035', 'active',    'cs_876_live')
) AS v(id, status, session)
WHERE ep.auth_user_id = '00000000-0000-0000-0000-000000876101';
RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.entry_carts
      WHERE id::text LIKE '00000000-0000-0000-0000-00000087603%') <> 5 THEN
    RAISE EXCEPTION 'FIXTURE the five carts were not created';
  END IF;
END;
$$;

CREATE FUNCTION pg_temp.expect_sqlstate(p_sql text, p_state text, p_label text)
RETURNS void
LANGUAGE plpgsql
AS $f$
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
  IF p_state <> 'ok' THEN
    RAISE EXCEPTION 'FAIL %: succeeded, expected SQLSTATE %', p_label, p_state;
  END IF;
  RAISE NOTICE 'PASS % (ok)', p_label;
END;
$f$;

-- ---------------------------------------------------------------------------
-- 1. ACL
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.claim_abandoned_cart_refund(uuid, text, text, integer, jsonb)',
    'public.request_refund_approval(text, text, text, integer, text, jsonb, uuid, uuid, uuid)',
    'public.begin_refund_attempt(uuid, uuid)',
    'public.record_refund_attempt(uuid, text, text, text)',
    'public.settle_refund_attempt(text, text, text)',
    'public.refund_attempt_next_status(text, text)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL a client role can execute %', v_fn;
    END IF;
    IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL service_role cannot execute %', v_fn;
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY ARRAY['public.refund_requests', 'public.refund_request_attempts'] LOOP
    IF has_table_privilege('anon', v_fn, 'SELECT')
       OR has_table_privilege('anon', v_fn, 'INSERT')
       OR has_table_privilege('anon', v_fn, 'UPDATE')
       OR has_table_privilege('anon', v_fn, 'DELETE') THEN
      RAISE EXCEPTION 'FAIL anon holds a privilege on %', v_fn;
    END IF;
    IF NOT has_table_privilege('authenticated', v_fn, 'SELECT')
       OR has_table_privilege('authenticated', v_fn, 'INSERT')
       OR has_table_privilege('authenticated', v_fn, 'UPDATE')
       OR has_table_privilege('authenticated', v_fn, 'DELETE') THEN
      RAISE EXCEPTION 'FAIL authenticated must read % and never write it', v_fn;
    END IF;
  END LOOP;
  IF has_function_privilege('anon', 'public.refund_requests_recompute_status()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.refund_requests_recompute_status()', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL a client role can execute the recompute trigger function';
  END IF;
  RAISE NOTICE 'PASS refund RPCs are service_role-only; anon has no table access';
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. The status CHECK
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
SELECT pg_temp.expect_sqlstate(
  $q$UPDATE public.entry_carts SET status = 'bogus'
     WHERE id = '00000000-0000-0000-0000-000000876034'$q$,
  '23514', 'entry_carts.status still rejects an unknown value');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 3. Two deliveries of one paid session on an abandoned cart
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_first record;
  v_second record;
  v_fulfilled int;
BEGIN
  SELECT * INTO v_first FROM public.claim_abandoned_cart_refund(
    '00000000-0000-0000-0000-000000876031', 'cs_876_abandoned', 'pi_876_abandoned', 4200);
  SELECT * INTO v_second FROM public.claim_abandoned_cart_refund(
    '00000000-0000-0000-0000-000000876031', 'cs_876_abandoned', 'pi_876_abandoned', 4200);

  IF v_first.outcome IS DISTINCT FROM 'claimed' THEN
    RAISE EXCEPTION 'FAIL the first delivery did not claim the abandoned cart (%)', v_first.outcome;
  END IF;
  IF v_second.outcome IS DISTINCT FROM 'already_pending'
     OR v_second.refund_request_id IS DISTINCT FROM v_first.refund_request_id THEN
    RAISE EXCEPTION 'FAIL the second delivery did not find the same pending request';
  END IF;
  IF (SELECT count(*) FROM public.refund_requests
      WHERE stripe_checkout_session_id = 'cs_876_abandoned') <> 1 THEN
    RAISE EXCEPTION 'FAIL two deliveries queued more than one refund';
  END IF;
  IF (SELECT status FROM public.entry_carts
      WHERE id = '00000000-0000-0000-0000-000000876031') <> 'refund_pending' THEN
    RAISE EXCEPTION 'FAIL the claimed cart is not refund_pending';
  END IF;

  -- The webhook's fulfillment claim, verbatim: it must now match nothing.
  UPDATE public.entry_carts SET status = 'submitted'
   WHERE id = '00000000-0000-0000-0000-000000876031' AND status = 'active';
  GET DIAGNOSTICS v_fulfilled = ROW_COUNT;
  IF v_fulfilled <> 0 THEN
    RAISE EXCEPTION 'FAIL a cart held for refund was claimed for fulfillment';
  END IF;
  RAISE NOTICE 'PASS two deliveries: one refund request, no fulfillment';
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Fulfillment first, and a cart on another session
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fulfilled int;
  v_outcome text;
BEGIN
  UPDATE public.entry_carts SET status = 'submitted'
   WHERE id = '00000000-0000-0000-0000-000000876032' AND status = 'active';
  GET DIAGNOSTICS v_fulfilled = ROW_COUNT;
  IF v_fulfilled <> 1 THEN
    RAISE EXCEPTION 'FIXTURE the active cart was not fulfilled';
  END IF;

  SELECT c.outcome INTO v_outcome FROM public.claim_abandoned_cart_refund(
    '00000000-0000-0000-0000-000000876032', 'cs_876_active', 'pi_876_active', 4200) AS c;
  IF v_outcome IS DISTINCT FROM 'not_refundable' THEN
    RAISE EXCEPTION 'FAIL a fulfilled cart was claimed for refund (%)', v_outcome;
  END IF;

  -- An ACTIVE cart on the paid session belongs to fulfillment: the refund
  -- claim must not take it, and fulfillment must still win afterwards.
  SELECT c.outcome INTO v_outcome FROM public.claim_abandoned_cart_refund(
    '00000000-0000-0000-0000-000000876035', 'cs_876_live', 'pi_876_live', 4200) AS c;
  IF v_outcome IS DISTINCT FROM 'not_refundable' THEN
    RAISE EXCEPTION 'FAIL an active cart was claimed for refund (%)', v_outcome;
  END IF;
  UPDATE public.entry_carts SET status = 'submitted'
   WHERE id = '00000000-0000-0000-0000-000000876035' AND status = 'active';
  GET DIAGNOSTICS v_fulfilled = ROW_COUNT;
  IF v_fulfilled <> 1 THEN
    RAISE EXCEPTION 'FAIL fulfillment lost an active cart to the refund claim';
  END IF;

  SELECT c.outcome INTO v_outcome FROM public.claim_abandoned_cart_refund(
    '00000000-0000-0000-0000-000000876033', 'cs_876_stale', 'pi_876_stale', 4200) AS c;
  IF v_outcome IS DISTINCT FROM 'not_refundable' THEN
    RAISE EXCEPTION 'FAIL a cart on another session was claimed for refund (%)', v_outcome;
  END IF;

  IF EXISTS (SELECT 1 FROM public.refund_requests
             WHERE stripe_checkout_session_id IN ('cs_876_active', 'cs_876_stale', 'cs_876_live')) THEN
    RAISE EXCEPTION 'FAIL a refund was queued for a non-refundable cart';
  END IF;
  IF (SELECT status FROM public.entry_carts
      WHERE id = '00000000-0000-0000-0000-000000876033') <> 'abandoned' THEN
    RAISE EXCEPTION 'FAIL a refused claim changed the cart';
  END IF;
  RAISE NOTICE 'PASS active, fulfilled and other-session carts are not_refundable';
END;
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 5. The owner cannot set or leave refund_pending
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000876101', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000876101","role":"authenticated"}', true);
SELECT pg_temp.expect_sqlstate(
  $q$UPDATE public.entry_carts SET status = 'refund_pending'
     WHERE id = '00000000-0000-0000-0000-000000876033'$q$,
  '42501', 'the owner cannot move their cart to refund_pending');
SELECT pg_temp.expect_sqlstate(
  $q$UPDATE public.entry_carts SET status = 'abandoned'
     WHERE id = '00000000-0000-0000-0000-000000876031'$q$,
  '42501', 'the owner cannot move their cart out of refund_pending');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- 6. request_refund_approval
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_first record;
  v_second record;
BEGIN
  SELECT * INTO v_first FROM public.request_refund_approval(
    'cart_overflow', 'cs_876_overflow', 'pi_876_overflow', 1500, 'partial_no_service_lines');
  SELECT * INTO v_second FROM public.request_refund_approval(
    'cart_overflow', 'cs_876_overflow', 'pi_876_overflow', 1500, 'partial_no_service_lines');
  IF v_first.created IS NOT TRUE OR v_second.created IS NOT FALSE
     OR v_first.refund_request_id IS DISTINCT FROM v_second.refund_request_id THEN
    RAISE EXCEPTION 'FAIL request_refund_approval is not idempotent per session and kind';
  END IF;
  RAISE NOTICE 'PASS request_refund_approval queues once per session and kind';
END;
$$;
SELECT pg_temp.expect_sqlstate(
  $q$SELECT public.request_refund_approval(
       'abandoned_cart', 'cs_876_x', 'pi_876_x', 100, 'cart_abandoned')$q$,
  '22023', 'request_refund_approval refuses the abandoned_cart kind');

-- ---------------------------------------------------------------------------
-- 7. Attempts: a table of event orderings (Codex rounds 1-2 on #2689)
-- ---------------------------------------------------------------------------
RESET ROLE;

-- A fresh cart_overflow request per ordering.
CREATE FUNCTION pg_temp.new_request(p_session text)
RETURNS uuid LANGUAGE sql AS $f$
  SELECT r.refund_request_id
    FROM public.request_refund_approval(
      'cart_overflow', p_session, 'pi_' || p_session, 1500, 'partial_no_service_lines') AS r
$f$;

CREATE FUNCTION pg_temp.begin_attempt(p_request uuid)
RETURNS TABLE (outcome text, attempt_id uuid, attempt_no integer) LANGUAGE sql AS $f$
  SELECT b.outcome, b.attempt_id, b.attempt_no
    FROM public.begin_refund_attempt(p_request, '00000000-0000-0000-0000-000000876102') AS b
$f$;

CREATE FUNCTION pg_temp.request_state(p_request uuid)
RETURNS text LANGUAGE sql AS $f$
  SELECT r.status || COALESCE(' | ' || r.last_failure, '')
    FROM public.refund_requests r WHERE r.id = p_request
$f$;

CREATE FUNCTION pg_temp.attempt_state(p_attempt uuid)
RETURNS text LANGUAGE sql AS $f$
  SELECT a.status || ' ' || COALESCE(a.stripe_refund_id, '-')
    FROM public.refund_request_attempts a WHERE a.id = p_attempt
$f$;

CREATE FUNCTION pg_temp.expect_eq(p_actual text, p_expected text, p_label text)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'FAIL %: got %, expected %', p_label, p_actual, p_expected;
  END IF;
  RAISE NOTICE 'PASS %', p_label;
END;
$f$;

SET LOCAL ROLE service_role;

-- O1 ------------------------------------------------------------------------
DO $$
DECLARE
  v_req uuid := pg_temp.new_request('cs_876_o1');
  v_a record;
  v_b record;
BEGIN
  PERFORM pg_temp.expect_eq(pg_temp.request_state(v_req), 'pending', 'O1 no attempts reads pending');
  SELECT * INTO v_a FROM pg_temp.begin_attempt(v_req);
  PERFORM pg_temp.expect_eq(v_a.outcome || ' #' || v_a.attempt_no, 'claimed #1', 'O1 first approval opens attempt 1');
  PERFORM pg_temp.expect_eq(pg_temp.request_state(v_req), 'awaiting_stripe', 'O1 an open attempt reads awaiting_stripe');
  SELECT * INTO v_b FROM pg_temp.begin_attempt(v_req);
  PERFORM pg_temp.expect_eq(v_b.outcome || ' ' || (v_b.attempt_id = v_a.attempt_id)::text, 'resume true',
    'O1 a second approval resumes the open attempt');
  PERFORM pg_temp.expect_eq(public.record_refund_attempt(v_a.attempt_id, 're_o1', 'succeeded'), 'recorded',
    'O1 the approval records its refund');
  PERFORM pg_temp.expect_eq(pg_temp.request_state(v_req), 'refunded', 'O1 success reads refunded');
  SELECT * INTO v_b FROM pg_temp.begin_attempt(v_req);
  PERFORM pg_temp.expect_eq(v_b.outcome, 'already_refunded', 'O1 approval after success is already_refunded');
  PERFORM pg_temp.expect_eq((SELECT count(*)::text FROM public.refund_request_attempts
                          WHERE request_id = v_req), '1', 'O1 no attempt opens after success');
END;
$$;

-- O2 (Codex P1) -------------------------------------------------------------
DO $$
DECLARE
  v_req uuid := pg_temp.new_request('cs_876_o2');
  v_a1 record;
  v_a2 record;
  v_s record;
BEGIN
  SELECT * INTO v_a1 FROM pg_temp.begin_attempt(v_req);
  PERFORM public.record_refund_attempt(v_a1.attempt_id, 're_o2_a', 'pending');
  SELECT * INTO v_s FROM public.settle_refund_attempt('re_o2_a', 'failed', 'expired_or_canceled_card');
  PERFORM pg_temp.expect_eq(v_s.outcome || ' ' || v_s.request_status, 'updated failed', 'O2 attempt 1 fails');
  PERFORM pg_temp.expect_eq(pg_temp.request_state(v_req), 'failed | failed: expired_or_canceled_card',
    'O2 the request carries attempt 1''s reason');

  SELECT * INTO v_a2 FROM pg_temp.begin_attempt(v_req);
  PERFORM pg_temp.expect_eq(v_a2.outcome || ' #' || v_a2.attempt_no, 'claimed #2', 'O2 retry opens attempt 2');
  PERFORM public.record_refund_attempt(v_a2.attempt_id, 're_o2_b', 'pending');

  -- The delayed success for the OLD refund.
  SELECT * INTO v_s FROM public.settle_refund_attempt('re_o2_a', 'succeeded');
  PERFORM pg_temp.expect_eq(pg_temp.attempt_state(v_a1.attempt_id), 'succeeded re_o2_a',
    'O2 a delayed success changes attempt 1 only');
  PERFORM pg_temp.expect_eq(pg_temp.attempt_state(v_a2.attempt_id), 'pending re_o2_b',
    'O2 attempt 2 keeps its own refund and status');
  PERFORM pg_temp.expect_eq(v_s.request_status || ' live=' || v_s.live_attempts, 'refunded live=2',
    'O2 the request is refunded and two live attempts are reported');

  SELECT * INTO v_s FROM public.settle_refund_attempt('re_o2_b', 'failed', 'lost_or_stolen_card');
  PERFORM pg_temp.expect_eq(pg_temp.attempt_state(v_a2.attempt_id), 'failed re_o2_b',
    'O2 attempt 2''s failure lands on attempt 2');
  PERFORM pg_temp.expect_eq(pg_temp.request_state(v_req), 'refunded', 'O2 a succeeded attempt keeps it refunded');
END;
$$;

-- O3 (Codex P2) -------------------------------------------------------------
DO $$
DECLARE
  v_req uuid := pg_temp.new_request('cs_876_o3');
  v_a1 record;
  v_a2 record;
BEGIN
  SELECT * INTO v_a1 FROM pg_temp.begin_attempt(v_req);
  PERFORM public.record_refund_attempt(v_a1.attempt_id, 're_o3_a', 'pending');
  PERFORM public.settle_refund_attempt('re_o3_a', 'failed', 'expired_or_canceled_card');
  SELECT * INTO v_a2 FROM pg_temp.begin_attempt(v_req);
  PERFORM public.record_refund_attempt(v_a2.attempt_id, 're_o3_b', 'pending');

  -- Approval 1's in-flight note arrives late.
  PERFORM pg_temp.expect_eq(public.record_refund_attempt(v_a1.attempt_id, 're_o3_a', 'pending'), 'recorded',
    'O3 a delayed note for attempt 1 is accepted for attempt 1 only');
  PERFORM pg_temp.expect_eq(pg_temp.attempt_state(v_a1.attempt_id), 'failed re_o3_a',
    'O3 the delayed note does not regress attempt 1');
  PERFORM pg_temp.expect_eq(pg_temp.attempt_state(v_a2.attempt_id), 'pending re_o3_b',
    'O3 the delayed note does not touch attempt 2');
  PERFORM pg_temp.expect_eq(public.record_refund_attempt(v_a1.attempt_id, 're_o3_x', 'pending'),
    'attempt_has_other_refund', 'O3 attempt 1 never takes a second refund id');
  PERFORM pg_temp.expect_eq(public.record_refund_attempt(v_a2.attempt_id, 're_o3_a', 'pending'),
    'refund_on_other_attempt', 'O3 attempt 1''s refund is refused on attempt 2');
  PERFORM pg_temp.expect_eq(pg_temp.request_state(v_req), 'awaiting_stripe', 'O3 the request waits on attempt 2');
END;
$$;

-- O4 success then failure ---------------------------------------------------
DO $$
DECLARE
  v_req uuid := pg_temp.new_request('cs_876_o4');
  v_a1 record;
  v_a2 record;
BEGIN
  SELECT * INTO v_a1 FROM pg_temp.begin_attempt(v_req);
  PERFORM public.record_refund_attempt(v_a1.attempt_id, 're_o4_a', 'succeeded');
  PERFORM pg_temp.expect_eq(pg_temp.request_state(v_req), 'refunded', 'O4 succeeded');
  PERFORM public.settle_refund_attempt('re_o4_a', 'failed', 'charge_for_pending_refund_disputed');
  PERFORM pg_temp.expect_eq(pg_temp.request_state(v_req), 'failed | failed: charge_for_pending_refund_disputed',
    'O4 a refund failing after success reopens the request');
  SELECT * INTO v_a2 FROM pg_temp.begin_attempt(v_req);
  PERFORM pg_temp.expect_eq(v_a2.outcome || ' #' || v_a2.attempt_no, 'claimed #2', 'O4 a new attempt can open');
END;
$$;

-- O5 late failure of an OLD attempt -----------------------------------------
DO $$
DECLARE
  v_req uuid := pg_temp.new_request('cs_876_o5');
  v_a1 record;
  v_a2 record;
BEGIN
  SELECT * INTO v_a1 FROM pg_temp.begin_attempt(v_req);
  PERFORM public.record_refund_attempt(v_a1.attempt_id, 're_o5_a', 'failed', 'unknown');
  SELECT * INTO v_a2 FROM pg_temp.begin_attempt(v_req);
  PERFORM public.record_refund_attempt(v_a2.attempt_id, 're_o5_b', 'succeeded');
  PERFORM public.settle_refund_attempt('re_o5_a', 'canceled');
  PERFORM pg_temp.expect_eq(pg_temp.attempt_state(v_a1.attempt_id), 'canceled re_o5_a', 'O5 the old attempt records it');
  PERFORM pg_temp.expect_eq(pg_temp.request_state(v_req), 'refunded', 'O5 the request stays refunded');
END;
$$;

-- O6 / O7 / O8 --------------------------------------------------------------
DO $$
DECLARE
  v_req uuid := pg_temp.new_request('cs_876_o6');
  v_a1 record;
  v_s record;
BEGIN
  SELECT * INTO v_a1 FROM pg_temp.begin_attempt(v_req);
  PERFORM public.record_refund_attempt(v_a1.attempt_id, 're_o6_a', 'succeeded');
  SELECT * INTO v_s FROM public.settle_refund_attempt('re_o6_a', 'pending');
  PERFORM pg_temp.expect_eq(v_s.outcome || ' ' || v_s.attempt_status, 'unchanged succeeded',
    'O6 a reported pending never regresses a settled attempt');

  SELECT * INTO v_s FROM public.settle_refund_attempt('re_o7_nobody', 'succeeded');
  PERFORM pg_temp.expect_eq(v_s.outcome, 'not_found', 'O7 a refund no attempt owns is not_found');
END;
$$;

-- O10 a CANCELED latest attempt reopens the request too ---------------------
DO $$
DECLARE
  v_req uuid := pg_temp.new_request('cs_876_o10');
  v_a1 record;
BEGIN
  SELECT * INTO v_a1 FROM pg_temp.begin_attempt(v_req);
  PERFORM public.record_refund_attempt(v_a1.attempt_id, 're_o10_a', 'pending');
  PERFORM public.settle_refund_attempt('re_o10_a', 'canceled');
  PERFORM pg_temp.expect_eq(pg_temp.request_state(v_req), 'failed | canceled: no reason given',
    'O10 a canceled refund reads failed with its status');
END;
$$;

DO $$
DECLARE
  v_req uuid := pg_temp.new_request('cs_876_o8');
BEGIN
  PERFORM pg_temp.begin_attempt(v_req);
  BEGIN
    INSERT INTO public.refund_request_attempts (request_id, attempt_no, approved_by_auth_user_id)
    VALUES (v_req, 2, '00000000-0000-0000-0000-000000876102');
    RAISE EXCEPTION 'FAIL O8 a second pending attempt was accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS O8 a second pending attempt is refused (23505)';
  END;
END;
$$;

-- O9 abandoned cart fulfilled after all -------------------------------------
DO $$
DECLARE
  v_req uuid;
  v_b record;
BEGIN
  PERFORM public.claim_abandoned_cart_refund(
    '00000000-0000-0000-0000-000000876034', 'cs_876_expired', 'pi_876_expired', 4200);
  SELECT r.id INTO v_req FROM public.refund_requests r
   WHERE r.stripe_checkout_session_id = 'cs_876_expired';
  IF v_req IS NULL THEN
    RAISE EXCEPTION 'FIXTURE the expired cart was not claimed';
  END IF;
  UPDATE public.entry_carts SET status = 'submitted'
   WHERE id = '00000000-0000-0000-0000-000000876034';
  SELECT * INTO v_b FROM pg_temp.begin_attempt(v_req);
  PERFORM pg_temp.expect_eq(v_b.outcome, 'fulfilled', 'O9 approval refuses a fulfilled session');
  PERFORM pg_temp.expect_eq((SELECT count(*)::text FROM public.refund_request_attempts
                          WHERE request_id = v_req), '0', 'O9 no attempt opens');

  -- The approval on the still-held abandoned cart from section 3 works.
  SELECT r.id INTO v_req FROM public.refund_requests r
   WHERE r.stripe_checkout_session_id = 'cs_876_abandoned';
  SELECT * INTO v_b FROM pg_temp.begin_attempt(v_req);
  PERFORM pg_temp.expect_eq(v_b.outcome, 'claimed', 'O9 a held abandoned cart can be approved');
END;
$$;
RESET ROLE;

ROLLBACK;
