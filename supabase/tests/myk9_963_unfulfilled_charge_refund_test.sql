-- MYK9-963 (migration 20261005013700): a paid cart checkout that created
-- NOTHING is queued as an 'unfulfilled_charge' refund request for its full
-- charge, and approved (or resolved) like every other request.
--
-- Properties asserted here:
--   U1  Shape and ACL: queue_unfulfilled_charge_refund is SECURITY DEFINER
--       with search_path '' and executable by service_role only; the kind
--       CHECK accepts 'unfulfilled_charge'.
--   U2  It refuses a missing intent, a non-positive amount and an unknown
--       reason, writing nothing.
--   U3  'queued' inserts one pending request: the amount given (the full
--       charge), the reason, the cart and show, and their ids in detail.
--   U4  A retry (lost response, redelivery) is 'already_queued': same row,
--       nothing new.
--   U5  A cart or show deleted before the call is stored as NULL, its id
--       kept in detail; the request is still queued.
--   U6  'delivered' when the session has an order or a fulfillment run;
--       'other_request' when it has a request of another kind. Neither
--       inserts anything.
--   U7  Approval: begin_refund_attempt claims it, and a settled refund
--       closes the request as refunded (the stripe-approve-refund path).
--   U8  Resolve without refund closes it (note required).
--   U9  Approval is refused ('fulfilled', no attempt) once the session has an
--       order, or a cart fulfillment run.
--   U10 Queue BEFORE fulfillment (Codex round 1 on #2758): once a session's
--       unfulfilled_charge request exists, begin_cart_fulfillment refuses it
--       ('not_claimable') on a cart that is still active on that session, and
--       writes no run; the cart stays as it was.
--   U11 Fulfillment BEFORE queue: begin_cart_fulfillment holds the cart and
--       writes the run; the queue then reports 'delivered' and inserts nothing.
--   Both calls take the cart's row lock first, so they serialize per cart and
--   one of these two orders is what any concurrent pair reduces to.
--   U12 (Codex round 2 on #2758) unfulfilled_charge THEN the abandoned-cart
--       claim: the claim is 'not_refundable', inserts nothing, and the cart
--       stays 'abandoned' (it moves only when the claim's own insert lands).
--   U13 abandoned-cart claim THEN unfulfilled_charge: the queue reports
--       'other_request'; one request, cart 'refund_pending'.
--   U14 THE INVARIANT, structurally: at most one LIVE request (status not
--       refunded / resolved_without_refund) per checkout session and per
--       payment intent, across every kind. A direct cross-kind insert is
--       refused (23505); a closed request does not count.
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

-- A fixture id: 00000000-0000-0000-0000-000000963<suffix>.
CREATE FUNCTION pg_temp.id(p_suffix text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $f$
  SELECT ('00000000-0000-0000-0000-000000963' || p_suffix)::uuid
$f$;

-- Queue one session with the webhook's arguments; returns the outcome row.
CREATE FUNCTION pg_temp.queue(p_session text, p_reason text, p_cart uuid, p_show uuid)
RETURNS TABLE (outcome text, refund_request_id uuid, request_status text,
               amount_cents integer, reason text, stripe_payment_intent_id text)
LANGUAGE sql AS $f$
  SELECT * FROM public.queue_unfulfilled_charge_refund(
    p_session, 'pi_' || p_session, 3210, p_reason, p_cart, p_show, '{"note": "x"}'::jsonb)
$f$;

-- ---------------------------------------------------------------------------
-- U1. Shape and ACL
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fn text := 'public.queue_unfulfilled_charge_refund(text, text, integer, text, uuid, uuid, jsonb)';
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT p.prosecdef || ' ' || array_to_string(p.proconfig, ',')
       FROM pg_proc p WHERE p.oid = v_fn::regprocedure),
    'true search_path=""', 'U1 queue_unfulfilled_charge_refund is SECURITY DEFINER, empty search_path');
  PERFORM pg_temp.expect_eq(
    has_function_privilege('anon', v_fn, 'EXECUTE') || ' '
      || has_function_privilege('authenticated', v_fn, 'EXECUTE') || ' '
      || has_function_privilege('service_role', v_fn, 'EXECUTE'),
    'false false true', 'U1 queue_unfulfilled_charge_refund is service_role only');
  PERFORM pg_temp.expect_eq(
    has_function_privilege('authenticated', 'public.begin_refund_attempt(uuid, uuid)', 'EXECUTE')
      || ' ' || has_function_privilege('service_role', 'public.begin_refund_attempt(uuid, uuid)', 'EXECUTE'),
    'false true', 'U1 begin_refund_attempt is still service_role only');
  PERFORM pg_temp.expect_eq(
    (SELECT pg_get_constraintdef(c.oid) LIKE '%unfulfilled_charge%'
       FROM pg_constraint c WHERE c.conname = 'refund_requests_kind_check')::text,
    'true', 'U1 the kind CHECK accepts unfulfilled_charge');
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures: exhibitor (people 963011, auth 963012), admin uid 963013, club,
-- draft shows 963101/963102, carts 963031 (active), 963032 (submitted),
-- 963033 (active on show 963102).
-- ---------------------------------------------------------------------------
INSERT INTO public.people (id, first_name, last_name, email)
VALUES (pg_temp.id('011'), 'MYK9-963', 'Exhibitor', 'myk9963-exh@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES (pg_temp.id('012'), '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'myk9963-exh@example.test', '', now(), now(), now(),
        '{}', '{}', false, false, false);

INSERT INTO public.exhibitor_profiles (person_id, auth_user_id)
SELECT pg_temp.id('011'), pg_temp.id('012')
WHERE NOT EXISTS (SELECT 1 FROM public.exhibitor_profiles WHERE auth_user_id = pg_temp.id('012'));

INSERT INTO public.clubs (id, name) VALUES (pg_temp.id('021'), 'MYK9-963 fixture club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
VALUES
  (pg_temp.id('101'), 'MYK9-963 Show', 'AKC', current_date + 30, current_date + 30, 'draft',
   pg_temp.id('021')),
  (pg_temp.id('102'), 'MYK9-963 Show B', 'AKC', current_date + 30, current_date + 30, 'draft',
   pg_temp.id('021'));

-- Carts carry a checkout session id, which only service_role may write.
SET LOCAL ROLE service_role;
INSERT INTO public.entry_carts (id, exhibitor_id, show_id, status, stripe_checkout_session_id)
SELECT pg_temp.id(v.suffix), ep.id, pg_temp.id(v.show), v.status, v.session
FROM public.exhibitor_profiles ep
CROSS JOIN (VALUES
  ('031', '101', 'active',    'cs_963_queue'),
  ('032', '101', 'submitted', 'cs_963_run'),
  ('033', '102', 'active',    'cs_963_late_run')
) AS v(suffix, show, status, session)
WHERE ep.auth_user_id = pg_temp.id('012');

-- ---------------------------------------------------------------------------
-- U2. Refusals write nothing
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_sqlstate(
  $$SELECT * FROM public.queue_unfulfilled_charge_refund('cs_963_bad', NULL, 100, 'no_cart')$$,
  '22023', 'U2 a missing payment intent is refused');
SELECT pg_temp.expect_sqlstate(
  $$SELECT * FROM public.queue_unfulfilled_charge_refund('cs_963_bad', 'pi_x', 0, 'no_cart')$$,
  '22023', 'U2 a zero amount is refused');
SELECT pg_temp.expect_sqlstate(
  $$SELECT * FROM public.queue_unfulfilled_charge_refund('cs_963_bad', 'pi_x', 100, 'whatever')$$,
  '22023', 'U2 an unknown reason is refused');
SELECT pg_temp.expect_eq(
  (SELECT count(*)::text FROM public.refund_requests WHERE stripe_checkout_session_id = 'cs_963_bad'),
  '0', 'U2 nothing was written');

-- ---------------------------------------------------------------------------
-- U3 / U4. Queued once; a retry finds the same request
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_q record;
  v_again record;
  v_row public.refund_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_q FROM pg_temp.queue('cs_963_queue', 'paid_amount_mismatch',
                                       pg_temp.id('031'), pg_temp.id('101'));
  PERFORM pg_temp.expect_eq(v_q.outcome || ' ' || v_q.request_status || ' ' || v_q.amount_cents,
    'queued pending 3210', 'U3 queued, pending, for the full charge');
  SELECT * INTO v_row FROM public.refund_requests WHERE id = v_q.refund_request_id;
  PERFORM pg_temp.expect_eq(
    v_row.kind || ' ' || v_row.reason || ' ' || v_row.stripe_payment_intent_id || ' '
      || (v_row.cart_id = pg_temp.id('031')) || ' ' || (v_row.show_id = pg_temp.id('101')),
    'unfulfilled_charge paid_amount_mismatch pi_cs_963_queue true true',
    'U3 the request carries its kind, reason, intent, cart and show');
  PERFORM pg_temp.expect_eq(
    (v_row.detail ->> 'note') || ' ' || (v_row.detail ->> 'cart_id'),
    'x ' || pg_temp.id('031')::text, 'U3 detail keeps the webhook detail and the cart id');

  SELECT * INTO v_again FROM pg_temp.queue('cs_963_queue', 'paid_amount_mismatch',
                                           pg_temp.id('031'), pg_temp.id('101'));
  PERFORM pg_temp.expect_eq(
    v_again.outcome || ' ' || (v_again.refund_request_id = v_q.refund_request_id),
    'already_queued true', 'U4 a retry is already_queued with the same request');
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM public.refund_requests
      WHERE stripe_checkout_session_id = 'cs_963_queue'),
    '1', 'U4 still one request for the session');
END;
$$;

-- ---------------------------------------------------------------------------
-- U5. A cart and show that no longer exist
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_q record;
  v_row public.refund_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_q FROM pg_temp.queue('cs_963_gone', 'no_cart', pg_temp.id('099'), pg_temp.id('199'));
  SELECT * INTO v_row FROM public.refund_requests WHERE id = v_q.refund_request_id;
  PERFORM pg_temp.expect_eq(
    v_q.outcome || ' ' || (v_row.cart_id IS NULL) || ' ' || (v_row.show_id IS NULL) || ' '
      || (v_row.detail ->> 'cart_id'),
    'queued true true ' || pg_temp.id('099')::text,
    'U5 a deleted cart/show is stored as NULL, its id kept in detail');
END;
$$;

-- ---------------------------------------------------------------------------
-- U6. Not queued when the session got something, or has another request
-- ---------------------------------------------------------------------------
INSERT INTO public.stripe_orders (stripe_payment_intent_id, stripe_checkout_session_id,
                                  amount_cents, status, order_type, show_id)
VALUES ('pi_cs_963_order', 'cs_963_order', 3210, 'succeeded', 'entry', pg_temp.id('101'));

INSERT INTO public.cart_fulfillments (stripe_checkout_session_id, cart_id, show_id, exhibitor_id,
                                      stripe_payment_intent_id)
SELECT 'cs_963_run', pg_temp.id('032'), pg_temp.id('101'), c.exhibitor_id, 'pi_cs_963_run'
FROM public.entry_carts c WHERE c.id = pg_temp.id('032');

INSERT INTO public.refund_requests (kind, stripe_checkout_session_id, stripe_payment_intent_id,
                                    amount_cents, reason)
VALUES ('abandoned_cart', 'cs_963_other', 'pi_cs_963_other', 3210, 'cart_abandoned');

SELECT pg_temp.expect_eq(
  (SELECT outcome FROM pg_temp.queue('cs_963_order', 'cart_not_claimable', NULL, NULL)),
  'delivered', 'U6 a session with an order is delivered');
SELECT pg_temp.expect_eq(
  (SELECT outcome FROM pg_temp.queue('cs_963_run', 'cart_not_claimable', pg_temp.id('032'), NULL)),
  'delivered', 'U6 a session with a fulfillment run is delivered');
SELECT pg_temp.expect_eq(
  (SELECT outcome FROM pg_temp.queue('cs_963_other', 'stale_checkout', NULL, NULL)),
  'other_request', 'U6 a session with another kind of request is other_request');
SELECT pg_temp.expect_eq(
  (SELECT count(*)::text FROM public.refund_requests
    WHERE kind = 'unfulfilled_charge'
      AND stripe_checkout_session_id IN ('cs_963_order', 'cs_963_run', 'cs_963_other')),
  '0', 'U6 none of them inserted a request');

-- ---------------------------------------------------------------------------
-- U7. Approval and settlement (stripe-approve-refund's RPC sequence)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_req uuid := (SELECT id FROM public.refund_requests
                  WHERE stripe_checkout_session_id = 'cs_963_queue');
  v_b record;
  v_r record;
  v_s record;
BEGIN
  SELECT * INTO v_b FROM public.begin_refund_attempt(v_req, pg_temp.id('013'));
  PERFORM pg_temp.expect_eq(v_b.outcome || ' ' || v_b.kind || ' ' || v_b.amount_cents,
    'claimed unfulfilled_charge 3210', 'U7 approval claims attempt 1 for the full charge');
  SELECT * INTO v_r FROM public.record_refund_attempt(v_b.attempt_id, v_b.attempt_version, 're_963');
  PERFORM pg_temp.expect_eq(v_r.outcome, 'recorded', 'U7 the Stripe refund id is recorded');
  SELECT * INTO v_s FROM public.settle_refund_attempt(v_b.attempt_id, v_r.attempt_version, 'succeeded');
  PERFORM pg_temp.expect_eq(v_s.outcome || ' ' || v_s.request_status, 'updated refunded',
    'U7 a settled refund closes the request as refunded');
END;
$$;

-- ---------------------------------------------------------------------------
-- U8. Resolve without refund
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_req uuid := (SELECT id FROM public.refund_requests
                  WHERE stripe_checkout_session_id = 'cs_963_gone');
  v_r record;
BEGIN
  SELECT * INTO v_r FROM public.resolve_refund_request_without_refund(v_req, pg_temp.id('013'), ' ');
  PERFORM pg_temp.expect_eq(v_r.outcome, 'note_required', 'U8 a note is required');
  SELECT * INTO v_r FROM public.resolve_refund_request_without_refund(
    v_req, pg_temp.id('013'), 'Entered by hand after the exhibitor confirmed.');
  PERFORM pg_temp.expect_eq(
    (SELECT status FROM public.refund_requests WHERE id = v_req),
    'resolved_without_refund', 'U8 the request resolves without a refund');
END;
$$;

-- ---------------------------------------------------------------------------
-- U9. Approval refused once the session got something
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_late_order uuid;
  v_late_run uuid;
  v_b record;
BEGIN
  SELECT refund_request_id INTO v_late_order
    FROM pg_temp.queue('cs_963_late_order', 'no_cart', NULL, NULL);
  SELECT refund_request_id INTO v_late_run
    FROM pg_temp.queue('cs_963_late_run', 'stale_checkout', pg_temp.id('033'), pg_temp.id('102'));

  INSERT INTO public.stripe_orders (stripe_payment_intent_id, stripe_checkout_session_id,
                                    amount_cents, status, order_type, show_id)
  VALUES ('pi_cs_963_late_order', 'cs_963_late_order', 3210, 'succeeded', 'entry', pg_temp.id('101'));
  INSERT INTO public.cart_fulfillments (stripe_checkout_session_id, cart_id, show_id, exhibitor_id,
                                        stripe_payment_intent_id)
  SELECT 'cs_963_late_run', c.id, c.show_id, c.exhibitor_id, 'pi_cs_963_late_run'
  FROM public.entry_carts c WHERE c.id = pg_temp.id('033');

  SELECT * INTO v_b FROM public.begin_refund_attempt(v_late_order, pg_temp.id('013'));
  PERFORM pg_temp.expect_eq(v_b.outcome, 'fulfilled', 'U9 an order since: approval refused');
  SELECT * INTO v_b FROM public.begin_refund_attempt(v_late_run, pg_temp.id('013'));
  PERFORM pg_temp.expect_eq(v_b.outcome, 'fulfilled', 'U9 a fulfillment run since: approval refused');
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM public.refund_request_attempts
      WHERE request_id IN (v_late_order, v_late_run)),
    '0', 'U9 no attempt was created');
END;
$$;


-- ---------------------------------------------------------------------------
-- U10 / U11 fixtures: shows 963103/963104 (one active cart each per
-- exhibitor), a trial and class on each, dog 963401, and one-line carts
-- 963034 (cs_963_u10) and 963035 (cs_963_u11), both active on their session.
-- ---------------------------------------------------------------------------
RESET ROLE;
INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
VALUES
  (pg_temp.id('103'), 'MYK9-963 Show C', 'AKC', current_date + 30, current_date + 30, 'draft',
   pg_temp.id('021')),
  (pg_temp.id('104'), 'MYK9-963 Show D', 'AKC', current_date + 30, current_date + 30, 'draft',
   pg_temp.id('021'));
INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type)
VALUES
  (pg_temp.id('203'), pg_temp.id('103'), 'MYK9-963 Trial C', current_date + 30, 'AKC', 'Scent Work'),
  (pg_temp.id('204'), pg_temp.id('104'), 'MYK9-963 Trial D', current_date + 30, 'AKC', 'Scent Work');
INSERT INTO public.classes (id, trial_id, name, element, level, status, status_source, entry_fee)
VALUES
  (pg_temp.id('303'), pg_temp.id('203'), 'MYK9-963 C', 'Container', 'Novice', 'upcoming', 'manual', 30),
  (pg_temp.id('304'), pg_temp.id('204'), 'MYK9-963 D', 'Container', 'Novice', 'upcoming', 'manual', 30);
INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
VALUES (pg_temp.id('401'), 'MYK9-963 Dog', 'D', 'Beagle', 'active', pg_temp.id('011'));

SET LOCAL ROLE service_role;
INSERT INTO public.entry_carts (id, exhibitor_id, show_id, status)
SELECT pg_temp.id(v.suffix), ep.id, pg_temp.id(v.show), 'active'
FROM public.exhibitor_profiles ep
CROSS JOIN (VALUES ('034', '103'), ('035', '104')) AS v(suffix, show)
WHERE ep.auth_user_id = pg_temp.id('012');
INSERT INTO public.entry_cart_items (id, cart_id, dog_id, class_id, entry_fee_cents)
VALUES
  (pg_temp.id('704'), pg_temp.id('034'), pg_temp.id('401'), pg_temp.id('303'), 3000),
  (pg_temp.id('705'), pg_temp.id('035'), pg_temp.id('401'), pg_temp.id('304'), 3000);
-- The session goes on AFTER the lines: every line insert severs it.
UPDATE public.entry_carts SET stripe_checkout_session_id = 'cs_963_u10' WHERE id = pg_temp.id('034');
UPDATE public.entry_carts SET stripe_checkout_session_id = 'cs_963_u11' WHERE id = pg_temp.id('035');

-- U10. Queue first: fulfillment is refused --------------------------------
DO $$
DECLARE
  v_b record;
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT outcome FROM pg_temp.queue('cs_963_u10', 'paid_amount_mismatch',
                                        pg_temp.id('034'), pg_temp.id('103'))),
    'queued', 'U10 the charge is queued while its cart is still active on the session');
  SELECT * INTO v_b FROM public.begin_cart_fulfillment(
    pg_temp.id('034'), 'cs_963_u10', 'pi_cs_963_u10',
    jsonb_build_object(pg_temp.id('704')::text, 3000));
  PERFORM pg_temp.expect_eq(v_b.outcome || ' ' || v_b.cart_status, 'not_claimable active',
    'U10 begin_cart_fulfillment refuses a session with an unfulfilled_charge request');
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM public.cart_fulfillments
      WHERE stripe_checkout_session_id = 'cs_963_u10')
      || ' ' || (SELECT status FROM public.entry_carts WHERE id = pg_temp.id('034')),
    '0 active', 'U10 no run was written and the cart is unchanged');
END;
$$;

-- U11. Fulfillment first: the queue inserts nothing -----------------------
DO $$
DECLARE
  v_b record;
BEGIN
  SELECT * INTO v_b FROM public.begin_cart_fulfillment(
    pg_temp.id('035'), 'cs_963_u11', 'pi_cs_963_u11',
    jsonb_build_object(pg_temp.id('705')::text, 3000));
  PERFORM pg_temp.expect_eq(v_b.outcome, 'begun', 'U11 fulfillment begins first');
  PERFORM pg_temp.expect_eq(
    (SELECT outcome FROM pg_temp.queue('cs_963_u11', 'paid_amount_mismatch',
                                        pg_temp.id('035'), pg_temp.id('104'))),
    'delivered', 'U11 the queue then reports delivered');
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM public.refund_requests
      WHERE stripe_checkout_session_id = 'cs_963_u11'),
    '0', 'U11 and inserts no request');
END;
$$;


-- ---------------------------------------------------------------------------
-- U12-U14. One live refund obligation per session, across kinds
-- ---------------------------------------------------------------------------
INSERT INTO public.entry_carts (id, exhibitor_id, show_id, status, stripe_checkout_session_id)
SELECT pg_temp.id(v.suffix), ep.id, pg_temp.id('101'), 'abandoned', v.session
FROM public.exhibitor_profiles ep
CROSS JOIN (VALUES ('036', 'cs_963_u12'), ('037', 'cs_963_u13')) AS v(suffix, session)
WHERE ep.auth_user_id = pg_temp.id('012');

-- U12. unfulfilled_charge first, then the abandoned-cart claim -------------
DO $$
DECLARE
  v_c record;
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT outcome FROM pg_temp.queue('cs_963_u12', 'paid_amount_mismatch',
                                        pg_temp.id('036'), pg_temp.id('101'))),
    'queued', 'U12 the charge is queued as unfulfilled_charge');
  SELECT * INTO v_c FROM public.claim_abandoned_cart_refund(
    pg_temp.id('036'), 'cs_963_u12', 'pi_cs_963_u12', 3210);
  PERFORM pg_temp.expect_eq(v_c.outcome, 'not_refundable',
    'U12 the abandoned-cart claim loses to the queued request');
  PERFORM pg_temp.expect_eq(
    (SELECT string_agg(kind, ',') FROM public.refund_requests
      WHERE stripe_checkout_session_id = 'cs_963_u12')
      || ' ' || (SELECT status FROM public.entry_carts WHERE id = pg_temp.id('036')),
    'unfulfilled_charge abandoned', 'U12 one request, and the cart did not move');
END;
$$;

-- U13. abandoned-cart claim first, then unfulfilled_charge -----------------
DO $$
DECLARE
  v_c record;
BEGIN
  SELECT * INTO v_c FROM public.claim_abandoned_cart_refund(
    pg_temp.id('037'), 'cs_963_u13', 'pi_cs_963_u13', 3210);
  PERFORM pg_temp.expect_eq(v_c.outcome, 'claimed', 'U13 the abandoned-cart claim lands first');
  PERFORM pg_temp.expect_eq(
    (SELECT outcome FROM pg_temp.queue('cs_963_u13', 'cart_not_claimable',
                                        pg_temp.id('037'), pg_temp.id('101'))),
    'other_request', 'U13 the queue then reports other_request');
  PERFORM pg_temp.expect_eq(
    (SELECT string_agg(kind, ',') FROM public.refund_requests
      WHERE stripe_checkout_session_id = 'cs_963_u13')
      || ' ' || (SELECT status FROM public.entry_carts WHERE id = pg_temp.id('037')),
    'abandoned_cart refund_pending', 'U13 one request, and the cart is held for it');
END;
$$;

-- U14. The index: a direct cross-kind insert is refused --------------------
SELECT pg_temp.expect_sqlstate(
  $$INSERT INTO public.refund_requests (kind, stripe_checkout_session_id,
      stripe_payment_intent_id, amount_cents, reason)
    VALUES ('cart_overflow', 'cs_963_u13', 'pi_cs_963_u13', 100, 'partial_no_service_lines')$$,
  '23505', 'U14 a second live request for one session is refused, whatever its kind');
SELECT pg_temp.expect_sqlstate(
  $$INSERT INTO public.refund_requests (kind, stripe_checkout_session_id,
      stripe_payment_intent_id, amount_cents, reason)
    VALUES ('entry_payment_link', 'cs_963_u14_other', 'pi_cs_963_u13', 100, 'no_link_record')$$,
  '23505', 'U14 a second live request for one payment intent is refused');
DO $$
BEGIN
  -- cs_963_queue's unfulfilled_charge request was refunded in U7: closed
  -- requests do not count, so another kind may be queued beside it.
  INSERT INTO public.refund_requests (kind, stripe_checkout_session_id,
      stripe_payment_intent_id, amount_cents, reason)
  VALUES ('cart_overflow', 'cs_963_queue', 'pi_cs_963_queue', 100, 'partial_no_service_lines');
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM public.refund_requests
      WHERE stripe_checkout_session_id = 'cs_963_queue'),
    '2', 'U14 a closed request does not block a live one');
END;
$$;

RESET ROLE;

ROLLBACK;
