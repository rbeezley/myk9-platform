-- MYK9-876 + MYK9-874 (migration 20261003013900): refunds are never
-- automatic, and refund and fulfillment of one paid cart are mutually
-- exclusive through entry_carts.status.
--
-- Properties asserted here:
--   * ACL: anon and authenticated can execute none of the four RPCs;
--     service_role can. anon holds no privilege on refund_requests;
--     authenticated may SELECT (RLS: site admins) but never write.
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
--   * claim_refund_request_approval: pending -> approved ('claimed'), a
--     repeat is 'resume', complete_refund_request stamps it once (a repeat
--     with the same refund is true, another refund id is false), and a later
--     approval is 'already_refunded'. An abandoned-cart request whose cart is
--     no longer refund_pending is refused as 'fulfilled' and stays pending.
--   * ASYNC LIFECYCLE (Codex P1 on #2689): an in-flight refund is noted on an
--     'approved' request without completing it; completing with a different
--     refund is refused; a failure of an OLD refund is stale; a failure of the
--     held refund moves the request to 'failed' (refund id cleared, reason
--     kept) and a new approval claims it again; a refund that succeeded and
--     later failed reopens a 'refunded' request too; the shape CHECK refuses
--     'refunded' without a refund id.
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
    'public.claim_refund_request_approval(uuid, uuid)',
    'public.complete_refund_request(uuid, text)',
    'public.note_refund_request_in_flight(uuid, text)',
    'public.fail_refund_request(uuid, text, text)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL a client role can execute %', v_fn;
    END IF;
    IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL service_role cannot execute %', v_fn;
    END IF;
  END LOOP;
  IF has_table_privilege('anon', 'public.refund_requests', 'SELECT')
     OR has_table_privilege('anon', 'public.refund_requests', 'INSERT')
     OR has_table_privilege('anon', 'public.refund_requests', 'UPDATE')
     OR has_table_privilege('anon', 'public.refund_requests', 'DELETE') THEN
    RAISE EXCEPTION 'FAIL anon holds a privilege on refund_requests';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.refund_requests', 'SELECT')
     OR has_table_privilege('authenticated', 'public.refund_requests', 'INSERT')
     OR has_table_privilege('authenticated', 'public.refund_requests', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.refund_requests', 'DELETE') THEN
    RAISE EXCEPTION 'FAIL authenticated must read refund_requests and never write it';
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
-- 7. Approval: once, resumable, never after fulfillment
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_id uuid;
  v_outcome text;
BEGIN
  SELECT r.id INTO v_id FROM public.refund_requests r
   WHERE r.stripe_checkout_session_id = 'cs_876_abandoned';

  SELECT c.outcome INTO v_outcome FROM public.claim_refund_request_approval(
    v_id, '00000000-0000-0000-0000-000000876102') AS c;
  IF v_outcome <> 'claimed' THEN
    RAISE EXCEPTION 'FAIL first approval was %, expected claimed', v_outcome;
  END IF;
  IF (SELECT status FROM public.refund_requests WHERE id = v_id) <> 'approved'
     OR (SELECT approved_by_auth_user_id FROM public.refund_requests WHERE id = v_id)
        IS DISTINCT FROM '00000000-0000-0000-0000-000000876102' THEN
    RAISE EXCEPTION 'FAIL the approval did not record status and approver';
  END IF;

  SELECT c.outcome INTO v_outcome FROM public.claim_refund_request_approval(
    v_id, '00000000-0000-0000-0000-000000876102') AS c;
  IF v_outcome <> 'resume' THEN
    RAISE EXCEPTION 'FAIL an unfinished approval was %, expected resume', v_outcome;
  END IF;

  IF public.complete_refund_request(v_id, 're_876_1') IS NOT TRUE
     OR public.complete_refund_request(v_id, 're_876_1') IS NOT TRUE
     OR public.complete_refund_request(v_id, 're_876_other') IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL complete_refund_request is not once-only';
  END IF;

  SELECT c.outcome INTO v_outcome FROM public.claim_refund_request_approval(
    v_id, '00000000-0000-0000-0000-000000876102') AS c;
  IF v_outcome <> 'already_refunded' THEN
    RAISE EXCEPTION 'FAIL a refunded request was %, expected already_refunded', v_outcome;
  END IF;
  RAISE NOTICE 'PASS approval claims once, resumes, and completes once';

  -- An abandoned-cart request whose cart left refund_pending (here: the
  -- webhook fulfilled it after all) must never be approved.
  PERFORM public.claim_abandoned_cart_refund(
    '00000000-0000-0000-0000-000000876034', 'cs_876_expired', 'pi_876_expired', 4200);
  SELECT r.id INTO v_id FROM public.refund_requests r
   WHERE r.stripe_checkout_session_id = 'cs_876_expired';
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'FIXTURE the expired cart was not claimed';
  END IF;
  UPDATE public.entry_carts SET status = 'submitted'
   WHERE id = '00000000-0000-0000-0000-000000876034';

  SELECT c.outcome INTO v_outcome FROM public.claim_refund_request_approval(
    v_id, '00000000-0000-0000-0000-000000876102') AS c;
  IF v_outcome <> 'fulfilled' THEN
    RAISE EXCEPTION 'FAIL approval of a fulfilled session was %, expected fulfilled', v_outcome;
  END IF;
  IF (SELECT status FROM public.refund_requests WHERE id = v_id) <> 'pending' THEN
    RAISE EXCEPTION 'FAIL a refused approval changed the request';
  END IF;
  RAISE NOTICE 'PASS approval refuses a session that was fulfilled';
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Asynchronous refunds stay retryable until Stripe reports success
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_id uuid;
  v_outcome text;
  v_row public.refund_requests%ROWTYPE;
BEGIN
  SELECT r.id INTO v_id FROM public.refund_requests r
   WHERE r.stripe_checkout_session_id = 'cs_876_overflow' AND r.kind = 'cart_overflow';

  SELECT c.outcome INTO v_outcome FROM public.claim_refund_request_approval(
    v_id, '00000000-0000-0000-0000-000000876102') AS c;
  IF v_outcome <> 'claimed' THEN
    RAISE EXCEPTION 'FIXTURE overflow approval was %', v_outcome;
  END IF;

  IF public.note_refund_request_in_flight(v_id, 're_876_p1') IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL an in-flight refund was not noted';
  END IF;
  SELECT * INTO v_row FROM public.refund_requests WHERE id = v_id;
  IF v_row.status <> 'approved' OR v_row.stripe_refund_id <> 're_876_p1'
     OR v_row.refunded_at IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL an in-flight refund marked the request refunded';
  END IF;

  IF public.complete_refund_request(v_id, 're_876_wrong') IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL a different refund completed a request waiting on re_876_p1';
  END IF;
  IF public.fail_refund_request(v_id, 're_876_old', 'failed: stale') IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL a failure of another refund reopened the request';
  END IF;

  IF public.fail_refund_request(v_id, 're_876_p1', 'failed: expired_or_canceled_card')
     IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL the held refund''s failure did not reopen the request';
  END IF;
  SELECT * INTO v_row FROM public.refund_requests WHERE id = v_id;
  IF v_row.status <> 'failed' OR v_row.stripe_refund_id IS NOT NULL
     OR v_row.last_failure <> 'failed: expired_or_canceled_card' THEN
    RAISE EXCEPTION 'FAIL a failed refund did not leave the request failed with its reason';
  END IF;

  SELECT c.outcome INTO v_outcome FROM public.claim_refund_request_approval(
    v_id, '00000000-0000-0000-0000-000000876102') AS c;
  IF v_outcome <> 'claimed'
     OR (SELECT status FROM public.refund_requests WHERE id = v_id) <> 'approved' THEN
    RAISE EXCEPTION 'FAIL a failed request could not be approved again (%)', v_outcome;
  END IF;

  IF public.complete_refund_request(v_id, 're_876_p2') IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL the retried refund did not complete';
  END IF;
  -- Two statements: a subquery in the same expression would read the snapshot
  -- taken before the function's UPDATE.
  IF public.fail_refund_request(v_id, 're_876_p2', 'failed: later') IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL a refund that failed after succeeding was refused';
  END IF;
  IF (SELECT status FROM public.refund_requests WHERE id = v_id) <> 'failed' THEN
    RAISE EXCEPTION 'FAIL a refund that failed after succeeding did not reopen the request';
  END IF;
  RAISE NOTICE 'PASS asynchronous refunds complete only on success and reopen on failure';
END;
$$;

SELECT pg_temp.expect_sqlstate(
  $q$UPDATE public.refund_requests SET status = 'refunded', refunded_at = now()
     WHERE stripe_checkout_session_id = 'cs_876_overflow'$q$,
  '23514', 'the shape CHECK refuses refunded without a refund id');
RESET ROLE;

ROLLBACK;
