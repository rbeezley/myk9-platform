-- MYK9-981 (migration 20261004031700): a closed abandoned-cart refund request
-- releases its cart and resolves its "awaiting approval" operator alert, and
-- the released cart never re-opens the refund claim.
--
-- Properties asserted here:
--   R1  An approved refund that settles 'succeeded' (settle_refund_attempt,
--       the path settleAttemptFromStripe drives) moves the cart
--       refund_pending -> abandoned and resolves the alert keyed
--       refund-request-<id>. Other alerts (a failed attempt on the same
--       request, another request's alert) stay open.
--   R2  IDEMPOTENCY after R1: a redelivered checkout.session.completed
--       (claim_abandoned_cart_refund again) is 'already_pending' with the SAME
--       request and its 'refunded' status; still ONE request for the session,
--       ONE attempt, the cart stays abandoned. Approving again is
--       'already_refunded' and opens no attempt. A replayed settle (Stripe
--       redelivers refund.updated) is 'unchanged'. The webhook's fulfillment
--       claim (`status = 'active'`) still matches nothing.
--   R3  Resolve without refund (an expired cart) does the same: the cart ends
--       'abandoned' (never 'expired', which stripe-checkout would reopen), the
--       alert resolves, a redelivery is 'already_pending' and approval is
--       'resolved' with no attempt.
--   R4  A refund Stripe fails AFTER reporting it succeeded reopens the request
--       (failed): the cart goes back to refund_pending, so the re-approval
--       opens attempt 2; its success releases the cart again.
--   R5  The cart is touched only while it still holds THIS request's session.
--   R6  A payment-link request has no cart: closing it resolves its alert.
--   R7  Closed by a non-service-role session (a person running SQL by hand):
--       the request write still lands; the cart is left as it was.
--   R8  (Codex P2 on #2717) An awaiting-approval alert INSERTED after its
--       request closed (a racing checkout redelivery) lands resolved; an open
--       request's alert and other sources/keys insert open. The two-session
--       interleavings are serialised by the request row lock (FOR SHARE in
--       the insert trigger against the closers' FOR UPDATE), which one psql
--       script cannot drive; this asserts the post-close insert ordering.
--
-- All fixtures roll back. Run with psql -X -v ON_ERROR_STOP=1 after migrations.

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures: exhibitor 981101 (people 981011), admin uid 981102, one draft
-- show. Every cart starts abandoned or expired, so
-- entry_carts_active_show_exhibitor_unique_idx (one ACTIVE cart per show and
-- exhibitor) never applies.
-- ---------------------------------------------------------------------------
INSERT INTO public.people (id, first_name, last_name, email)
VALUES ('00000000-0000-0000-0000-000000981011', 'MYK9-981', 'Exhibitor',
        'myk9981-exh@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES ('00000000-0000-0000-0000-000000981101', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'myk9981-exh@example.test', '', now(), now(), now(),
        '{}', '{}', false, false, false);

INSERT INTO public.exhibitor_profiles (person_id, auth_user_id)
SELECT '00000000-0000-0000-0000-000000981011', '00000000-0000-0000-0000-000000981101'
WHERE NOT EXISTS (SELECT 1 FROM public.exhibitor_profiles
                  WHERE auth_user_id = '00000000-0000-0000-0000-000000981101');

-- MYK9-1008: every show belongs to a club (shows.club_id NOT NULL); each
-- fixture show gets its own fixture club, reusing the show's id.
INSERT INTO public.clubs (id, name) VALUES ('00000000-0000-0000-0000-000000981021', 'MYK9-1008 fixture club ' || '00000000-0000-0000-0000-000000981021');
INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
VALUES ('00000000-0000-0000-0000-000000981021', 'MYK9-981 Show', 'AKC',
        current_date + 30, current_date + 30, 'draft', '00000000-0000-0000-0000-000000981021');

-- Carts carry a checkout session id, which only service_role may write.
SET LOCAL ROLE service_role;
INSERT INTO public.entry_carts (id, exhibitor_id, show_id, status, stripe_checkout_session_id)
SELECT v.id::uuid, ep.id, '00000000-0000-0000-0000-000000981021', v.status, v.session
FROM public.exhibitor_profiles ep
CROSS JOIN (VALUES
  ('00000000-0000-0000-0000-000000981031', 'abandoned', 'cs_981_refunded'),
  ('00000000-0000-0000-0000-000000981032', 'expired',   'cs_981_resolved'),
  ('00000000-0000-0000-0000-000000981033', 'abandoned', 'cs_981_reopened'),
  ('00000000-0000-0000-0000-000000981034', 'abandoned', 'cs_981_moved'),
  ('00000000-0000-0000-0000-000000981035', 'abandoned', 'cs_981_by_hand')
) AS v(id, status, session)
WHERE ep.auth_user_id = '00000000-0000-0000-0000-000000981101';
RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.entry_carts
      WHERE id::text LIKE '00000000-0000-0000-0000-00000098103%') <> 5 THEN
    RAISE EXCEPTION 'FIXTURE the five carts were not created';
  END IF;
END;
$$;

CREATE FUNCTION pg_temp.expect_eq(p_actual text, p_expected text, p_label text)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'FAIL %: got %, expected %', p_label, p_actual, p_expected;
  END IF;
  RAISE NOTICE 'PASS %', p_label;
END;
$f$;

-- What the webhook does on checkout.session.completed for an abandoned cart.
CREATE FUNCTION pg_temp.claim(p_cart text, p_session text)
RETURNS TABLE (outcome text, refund_request_id uuid, request_status text)
LANGUAGE sql AS $f$
  SELECT * FROM public.claim_abandoned_cart_refund(
    p_cart::uuid, p_session, 'pi_' || p_session, 4200)
$f$;

-- What ensureRefundRequestAlert writes (alertAdmin's operator_alerts row).
CREATE FUNCTION pg_temp.raise_alert(p_source text, p_dedupe text)
RETURNS void LANGUAGE sql AS $f$
  INSERT INTO public.operator_alerts (source, severity, title, dedupe_key)
  VALUES (p_source, 'error', 'MYK9-981 fixture alert', p_dedupe)
$f$;

CREATE FUNCTION pg_temp.alert_open(p_source text, p_dedupe text)
RETURNS text LANGUAGE sql AS $f$
  SELECT string_agg(CASE WHEN a.resolved_at IS NULL THEN 'open' ELSE 'resolved' END, ',')
    FROM public.operator_alerts a
   WHERE a.source = p_source AND a.dedupe_key = p_dedupe
$f$;

CREATE FUNCTION pg_temp.cart_status(p_cart text)
RETURNS text LANGUAGE sql AS $f$
  SELECT c.status FROM public.entry_carts c WHERE c.id = p_cart::uuid
$f$;

CREATE FUNCTION pg_temp.begin_attempt(p_request uuid)
RETURNS TABLE (outcome text, attempt_id uuid, attempt_no integer) LANGUAGE sql AS $f$
  SELECT b.outcome, b.attempt_id, b.attempt_no
    FROM public.begin_refund_attempt(p_request, '00000000-0000-0000-0000-000000981102') AS b
$f$;

-- settleAttemptFromStripe's two writes, each with the version it just read:
-- attach the refund id (once), then settle the status Stripe reports.
CREATE FUNCTION pg_temp.settle(p_attempt uuid, p_refund text, p_status text)
RETURNS TABLE (outcome text, request_status text)
LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM public.record_refund_attempt(
    p_attempt,
    (SELECT a.version FROM public.refund_request_attempts a WHERE a.id = p_attempt),
    p_refund);
  RETURN QUERY
    SELECT s.outcome, s.request_status FROM public.settle_refund_attempt(
      p_attempt,
      (SELECT a.version FROM public.refund_request_attempts a WHERE a.id = p_attempt),
      p_status,
      CASE WHEN p_status = 'failed' THEN 'charge_for_pending_refund_disputed' END) AS s;
END;
$f$;

-- ---------------------------------------------------------------------------
-- R1 + R2: refunded -> cart abandoned, alert resolved; a redelivery is a no-op
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_claim record;
  v_again record;
  v_a record;
  v_b record;
  v_s record;
  v_fulfilled int;
BEGIN
  SELECT * INTO v_claim FROM pg_temp.claim('00000000-0000-0000-0000-000000981031', 'cs_981_refunded');
  PERFORM pg_temp.expect_eq(v_claim.outcome || ' ' || pg_temp.cart_status('00000000-0000-0000-0000-000000981031'),
    'claimed refund_pending', 'R1 fixture: the paid abandoned cart is held for refund');
  PERFORM pg_temp.raise_alert('stripe-webhook', 'refund-request-' || v_claim.refund_request_id);
  PERFORM pg_temp.raise_alert('refund-settlement', 'refund-attempt-failed-re_981_other');
  PERFORM pg_temp.raise_alert('stripe-webhook', 'refund-request-00000000-0000-0000-0000-000000981999');

  SELECT * INTO v_a FROM pg_temp.begin_attempt(v_claim.refund_request_id);
  PERFORM pg_temp.expect_eq(v_a.outcome, 'claimed', 'R1 the held cart can be approved');
  PERFORM pg_temp.expect_eq(pg_temp.cart_status('00000000-0000-0000-0000-000000981031'),
    'refund_pending', 'R1 an approval in flight keeps the cart held');
  PERFORM pg_temp.expect_eq(
    pg_temp.alert_open('stripe-webhook', 'refund-request-' || v_claim.refund_request_id),
    'open', 'R1 an approval in flight keeps the alert open');

  SELECT * INTO v_s FROM pg_temp.settle(v_a.attempt_id, 're_981_refunded', 'succeeded');
  PERFORM pg_temp.expect_eq(v_s.outcome || ' ' || v_s.request_status, 'updated refunded',
    'R1 the refund settles succeeded');
  PERFORM pg_temp.expect_eq(pg_temp.cart_status('00000000-0000-0000-0000-000000981031'),
    'abandoned', 'R1 the refunded cart returns to abandoned');
  PERFORM pg_temp.expect_eq(
    pg_temp.alert_open('stripe-webhook', 'refund-request-' || v_claim.refund_request_id),
    'resolved', 'R1 the awaiting-approval alert resolves itself');
  PERFORM pg_temp.expect_eq(
    pg_temp.alert_open('refund-settlement', 'refund-attempt-failed-re_981_other') || ' '
      || pg_temp.alert_open('stripe-webhook', 'refund-request-00000000-0000-0000-0000-000000981999'),
    'open open', 'R1 other alerts stay open');

  -- R2: Stripe redelivers checkout.session.completed for the refunded session.
  SELECT * INTO v_again FROM pg_temp.claim('00000000-0000-0000-0000-000000981031', 'cs_981_refunded');
  PERFORM pg_temp.expect_eq(
    v_again.outcome || ' ' || (v_again.refund_request_id = v_claim.refund_request_id)::text
      || ' ' || v_again.request_status,
    'already_pending true refunded', 'R2 a redelivered claim finds the same, refunded request');
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM public.refund_requests
      WHERE stripe_checkout_session_id = 'cs_981_refunded'),
    '1', 'R2 the redelivery queues no second request');
  PERFORM pg_temp.expect_eq(pg_temp.cart_status('00000000-0000-0000-0000-000000981031'),
    'abandoned', 'R2 the redelivery leaves the cart abandoned (never refund_pending again)');
  PERFORM pg_temp.expect_eq(
    (SELECT r.status FROM public.refund_requests r WHERE r.id = v_claim.refund_request_id),
    'refunded', 'R2 the request stays refunded');

  SELECT * INTO v_b FROM pg_temp.begin_attempt(v_claim.refund_request_id);
  PERFORM pg_temp.expect_eq(v_b.outcome, 'already_refunded', 'R2 approving again is already_refunded');
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM public.refund_request_attempts
      WHERE request_id = v_claim.refund_request_id),
    '1', 'R2 no second refund attempt opens');

  -- Stripe redelivers refund.updated: the settle re-reads and writes nothing.
  SELECT * INTO v_s FROM pg_temp.settle(v_a.attempt_id, 're_981_refunded', 'succeeded');
  PERFORM pg_temp.expect_eq(v_s.outcome || ' ' || v_s.request_status, 'unchanged refunded',
    'R2 a replayed settle is unchanged');
  PERFORM pg_temp.expect_eq(pg_temp.cart_status('00000000-0000-0000-0000-000000981031'),
    'abandoned', 'R2 a replayed settle leaves the cart abandoned');
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM public.operator_alerts
      WHERE dedupe_key = 'refund-request-' || v_claim.refund_request_id),
    '1', 'R2 no new alert row for the closed request');

  -- The webhook's fulfillment claim, verbatim: it must still match nothing.
  UPDATE public.entry_carts SET status = 'submitted'
   WHERE id = '00000000-0000-0000-0000-000000981031' AND status = 'active';
  GET DIAGNOSTICS v_fulfilled = ROW_COUNT;
  PERFORM pg_temp.expect_eq(v_fulfilled::text, '0', 'R2 a refunded cart is never fulfilled');
END;
$$;

-- ---------------------------------------------------------------------------
-- R3: resolved without refund (an EXPIRED cart)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_claim record;
  v_again record;
  v_r record;
  v_b record;
BEGIN
  SELECT * INTO v_claim FROM pg_temp.claim('00000000-0000-0000-0000-000000981032', 'cs_981_resolved');
  PERFORM pg_temp.expect_eq(v_claim.outcome, 'claimed', 'R3 fixture: the expired cart is held');
  PERFORM pg_temp.raise_alert('stripe-webhook', 'refund-request-' || v_claim.refund_request_id);

  SELECT * INTO v_r FROM public.resolve_refund_request_without_refund(
    v_claim.refund_request_id, '00000000-0000-0000-0000-000000981102', 'Entries fulfilled by hand');
  PERFORM pg_temp.expect_eq(v_r.outcome, 'resolved', 'R3 the request resolves without refund');
  PERFORM pg_temp.expect_eq(pg_temp.cart_status('00000000-0000-0000-0000-000000981032'),
    'abandoned', 'R3 the cart ends abandoned, not expired');
  PERFORM pg_temp.expect_eq(
    pg_temp.alert_open('stripe-webhook', 'refund-request-' || v_claim.refund_request_id),
    'resolved', 'R3 the alert resolves itself');

  SELECT * INTO v_again FROM pg_temp.claim('00000000-0000-0000-0000-000000981032', 'cs_981_resolved');
  PERFORM pg_temp.expect_eq(
    v_again.outcome || ' ' || (v_again.refund_request_id = v_claim.refund_request_id)::text
      || ' ' || v_again.request_status,
    'already_pending true resolved_without_refund', 'R3 a redelivered claim finds the resolved request');
  SELECT * INTO v_b FROM pg_temp.begin_attempt(v_claim.refund_request_id);
  PERFORM pg_temp.expect_eq(
    v_b.outcome || ' ' || (SELECT count(*) FROM public.refund_request_attempts
                            WHERE request_id = v_claim.refund_request_id)::text
      || ' ' || pg_temp.cart_status('00000000-0000-0000-0000-000000981032'),
    'resolved 0 abandoned', 'R3 approval is refused, no attempt, the cart stays abandoned');
END;
$$;

-- ---------------------------------------------------------------------------
-- R4: Stripe fails a refund it had reported succeeded
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_claim record;
  v_a1 record;
  v_a2 record;
  v_s record;
BEGIN
  SELECT * INTO v_claim FROM pg_temp.claim('00000000-0000-0000-0000-000000981033', 'cs_981_reopened');
  SELECT * INTO v_a1 FROM pg_temp.begin_attempt(v_claim.refund_request_id);
  PERFORM pg_temp.settle(v_a1.attempt_id, 're_981_reopened_a', 'succeeded');
  PERFORM pg_temp.expect_eq(pg_temp.cart_status('00000000-0000-0000-0000-000000981033'),
    'abandoned', 'R4 fixture: the refunded cart is released');

  SELECT * INTO v_s FROM pg_temp.settle(v_a1.attempt_id, 're_981_reopened_a', 'failed');
  PERFORM pg_temp.expect_eq(v_s.request_status || ' ' || pg_temp.cart_status('00000000-0000-0000-0000-000000981033'),
    'failed refund_pending', 'R4 a refund failing after success holds the cart again');

  SELECT * INTO v_a2 FROM pg_temp.begin_attempt(v_claim.refund_request_id);
  PERFORM pg_temp.expect_eq(v_a2.outcome || ' #' || v_a2.attempt_no, 'claimed #2',
    'R4 the re-approval opens attempt 2');
  PERFORM pg_temp.settle(v_a2.attempt_id, 're_981_reopened_b', 'succeeded');
  PERFORM pg_temp.expect_eq(pg_temp.cart_status('00000000-0000-0000-0000-000000981033'),
    'abandoned', 'R4 attempt 2''s success releases the cart again');
END;
$$;

-- ---------------------------------------------------------------------------
-- R5: a cart that no longer holds the request's session is not touched
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_claim record;
  v_a record;
BEGIN
  SELECT * INTO v_claim FROM pg_temp.claim('00000000-0000-0000-0000-000000981034', 'cs_981_moved');
  SELECT * INTO v_a FROM pg_temp.begin_attempt(v_claim.refund_request_id);
  UPDATE public.entry_carts SET stripe_checkout_session_id = 'cs_981_elsewhere'
   WHERE id = '00000000-0000-0000-0000-000000981034';
  PERFORM pg_temp.settle(v_a.attempt_id, 're_981_moved', 'succeeded');
  PERFORM pg_temp.expect_eq(pg_temp.cart_status('00000000-0000-0000-0000-000000981034'),
    'refund_pending', 'R5 a cart on another session is left as it is');
END;
$$;

-- ---------------------------------------------------------------------------
-- R6: a payment-link request (no cart) resolves its alert
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_req uuid;
  v_a record;
BEGIN
  SELECT r.refund_request_id INTO v_req FROM public.queue_payment_link_refund(
    'cs_981_link', NULL, NULL, 'pi_cs_981_link', 1500, 'no_link_record') AS r;
  PERFORM pg_temp.raise_alert('stripe-webhook', 'refund-request-' || v_req);
  SELECT * INTO v_a FROM pg_temp.begin_attempt(v_req);
  PERFORM pg_temp.settle(v_a.attempt_id, 're_981_link', 'succeeded');
  PERFORM pg_temp.expect_eq(pg_temp.alert_open('stripe-webhook', 'refund-request-' || v_req),
    'resolved', 'R6 a refunded payment-link request resolves its alert');
END;
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- R7: closed outside service_role (SQL by hand): the request write lands
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
CREATE TEMP TABLE r7 ON COMMIT DROP AS
  SELECT c.refund_request_id AS id
    FROM pg_temp.claim('00000000-0000-0000-0000-000000981035', 'cs_981_by_hand') AS c;
GRANT ALL ON r7 TO PUBLIC;
RESET ROLE;
DO $$
DECLARE
  v_r record;
BEGIN
  SELECT * INTO v_r FROM public.resolve_refund_request_without_refund(
    (SELECT id FROM r7), '00000000-0000-0000-0000-000000981102', 'Closed by hand');
  PERFORM pg_temp.expect_eq(v_r.outcome, 'resolved', 'R7 the request resolves outside service_role');
  PERFORM pg_temp.expect_eq(pg_temp.cart_status('00000000-0000-0000-0000-000000981035'),
    'refund_pending', 'R7 the cart is left as it was (entry_carts_protect_status)');
END;
$$;

-- ---------------------------------------------------------------------------
-- R8 (Codex P2 on #2717): the redelivery race. A checkout redelivery read the
-- request while it was open, the request then closed, and only now does the
-- redelivery insert its awaiting-approval alert (alertAdmin's plain INSERT).
-- It must land resolved. An open request's alert, and alerts of other
-- sources or keys, still insert open.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_closed uuid;
  v_open uuid;
BEGIN
  SELECT r.id INTO v_closed FROM public.refund_requests r
   WHERE r.stripe_checkout_session_id = 'cs_981_refunded';
  -- The closure already resolved this key's alert (R1), so it is out of the
  -- dedupe index and a late insert is accepted as a new row.
  PERFORM pg_temp.raise_alert('stripe-webhook', 'refund-request-' || v_closed);
  PERFORM pg_temp.expect_eq(
    pg_temp.alert_open('stripe-webhook', 'refund-request-' || v_closed),
    'resolved,resolved', 'R8 an alert inserted after the request closed lands resolved');

  SELECT r.refund_request_id INTO v_open FROM public.queue_payment_link_refund(
    'cs_981_link_open', NULL, NULL, 'pi_cs_981_link_open', 1500, 'no_link_record') AS r;
  PERFORM pg_temp.raise_alert('stripe-webhook', 'refund-request-' || v_open);
  PERFORM pg_temp.expect_eq(
    pg_temp.alert_open('stripe-webhook', 'refund-request-' || v_open),
    'open', 'R8 an open request''s alert inserts open');

  PERFORM pg_temp.raise_alert('refund-settlement', 'refund-request-double-live-' || v_closed);
  PERFORM pg_temp.raise_alert('refund-settlement', 'refund-request-' || v_closed);
  PERFORM pg_temp.expect_eq(
    pg_temp.alert_open('refund-settlement', 'refund-request-double-live-' || v_closed) || ' '
      || pg_temp.alert_open('refund-settlement', 'refund-request-' || v_closed),
    'open open', 'R8 alerts of other sources and keys insert open');
END;
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- ACL: the trigger functions are not callable by a client role
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.refund_requests_sync_closure()',
    'public.operator_alerts_refund_request_closed()'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL a client role can execute %', v_fn;
    END IF;
  END LOOP;
  RAISE NOTICE 'PASS the MYK9-981 trigger functions are not client-callable';
END;
$$;

ROLLBACK;
