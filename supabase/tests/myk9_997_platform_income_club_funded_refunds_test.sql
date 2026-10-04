-- MYK9-997 (migration 20261004193700): platform income counts the service fee
-- kept on charges that recorded no order, and the ledger tells club-funded
-- refunds from platform-funded ones.
--
-- Properties asserted here:
--   C1  A refund booked club-funded rolls into BOTH refunded_cents and
--       club_funded_refunded_cents; one booked without the flag (the old
--       four-argument call, a dashboard refund) rolls into refunded_cents only.
--   C2  `club_funded` is an immutable refund fact: a redelivery that says
--       otherwise changes nothing.
--   C3  A make-whole refund is never club-funded, even when asked; the table
--       CHECK refuses a hand-written one.
--   C4  A club-funded refund that Stripe later FAILS leaves both totals.
--   K1  claim_abandoned_cart_refund lifts p_detail.charged_cents into the
--       request's charged_cents (and out of detail); a detail without it
--       records NULL; a charge below its refund, or a fractional one, is
--       refused.
--   K2  queue_payment_link_refund does the same on a no-link session; a
--       charge with no refund is refused.
--   K3  Both RPCs keep their signatures (one each, service_role only).
--   S1  financial_reconciliation_summary, the MYK9-997 worked example for one
--       club's show: order fees 700 + 350 + 140, refunds 5000 (club) + 200
--       (platform) + 2000 (club, on the order whose processing fee is not
--       captured), and the 210 fee kept on a paid abandoned cart. A request
--       whose session HAS an order, and one with no recorded charge, book
--       nothing.
--   S2  Scope: another club's show and the platform-only no-link session do
--       not leak into this club's figures; platform scope adds them.
--   R1  The kept fee is what the refunds that actually went out left behind
--       (Codex round 1 on #2741), one 3210 = 3000 + 210 abandoned cart per
--       show of club 997003:
--         P1 approved refund only (also booked in the ledger under its own
--            refund id, which must not count twice)          -> kept 210
--         P2 approved refund + a 210 dashboard top-up         -> kept 0
--         P3 pending request, nothing refunded yet            -> kept 210
--         P4 pending request, the whole charge refunded from
--            the dashboard                                    -> kept 0
--
-- Every show has a club (MYK9-1008 makes shows.club_id NOT NULL).
-- All fixtures roll back. Run with psql -X -v ON_ERROR_STOP=1 after migrations.

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures: site and club admin (people 997010, auth 997100), exhibitor (people
-- 997011, auth 997101), club 997001 with show 997021, club 997002 with show
-- 997022.
-- ---------------------------------------------------------------------------
INSERT INTO public.roles (name, description, is_system)
VALUES ('site_admin', 'MYK9-997 fixture', true),
       ('club_admin', 'MYK9-997 fixture', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  ('00000000-0000-0000-0000-000000997100', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9997-admin@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false),
  ('00000000-0000-0000-0000-000000997101', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'myk9997-exh@example.test', '', now(), now(), now(),
   '{}', '{}', false, false, false);

-- No auth_user_id here: is_site_admin() reads user_roles.auth_user_id, and the
-- auth.users insert above may already have linked a people row of its own.
INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000997010', 'MYK9-997', 'Admin', 'myk9997-admin-p@example.test'),
  ('00000000-0000-0000-0000-000000997011', 'MYK9-997', 'Exhibitor', 'myk9997-exh-p@example.test');

INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000997010', r.id, true,
       '00000000-0000-0000-0000-000000997100'
  FROM public.roles r
 WHERE r.name = 'site_admin';

INSERT INTO public.exhibitor_profiles (person_id, auth_user_id)
SELECT '00000000-0000-0000-0000-000000997011', '00000000-0000-0000-0000-000000997101'
WHERE NOT EXISTS (SELECT 1 FROM public.exhibitor_profiles
                  WHERE auth_user_id = '00000000-0000-0000-0000-000000997101');

INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000997001', 'MYK9-997 Club'),
       ('00000000-0000-0000-0000-000000997002', 'MYK9-997 Other Club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
VALUES
  ('00000000-0000-0000-0000-000000997021', 'MYK9-997 Show', 'AKC',
   current_date + 30, current_date + 30, 'draft', '00000000-0000-0000-0000-000000997001'),
  ('00000000-0000-0000-0000-000000997022', 'MYK9-997 Other Show', 'AKC',
   current_date + 30, current_date + 30, 'draft', '00000000-0000-0000-0000-000000997002');

-- The same person administers both clubs, so club and show scope authorize
-- (_financial_reconciliation_authorize: is_club_admin / can_manage_show).
INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id, club_id)
SELECT '00000000-0000-0000-0000-000000997010', r.id, true,
       '00000000-0000-0000-0000-000000997100', c.club_id
  FROM public.roles r
 CROSS JOIN (VALUES ('00000000-0000-0000-0000-000000997001'::uuid),
                    ('00000000-0000-0000-0000-000000997002'::uuid)) AS c(club_id)
 WHERE r.name = 'club_admin';

-- Orders. A and B have captured processing fees; D's is not captured yet.
-- E (other club) carries a club-funded refund; F (other club) one that fails.
-- M (other club) takes a make-whole refund.
INSERT INTO public.stripe_orders
  (stripe_payment_intent_id, stripe_checkout_session_id, show_id, status, order_type,
   amount_cents, entry_subtotal_cents, platform_fee_cents, platform_fee_rate,
   stripe_processing_fee_cents)
VALUES
  ('pi_997_a', 'cs_997_a', '00000000-0000-0000-0000-000000997021', 'succeeded', 'entry',
   10700, 10000, 700, 7.00, 341),
  ('pi_997_b', 'cs_997_b', '00000000-0000-0000-0000-000000997021', 'succeeded', 'entry',
   5350, 5000, 350, 7.00, 185),
  ('pi_997_d', 'cs_997_d', '00000000-0000-0000-0000-000000997021', 'succeeded', 'entry',
   2140, 2000, 140, 7.00, NULL),
  ('pi_997_e', 'cs_997_e', '00000000-0000-0000-0000-000000997022', 'succeeded', 'entry',
   3210, 3000, 210, 7.00, 123),
  ('pi_997_f', 'cs_997_f', '00000000-0000-0000-0000-000000997022', 'succeeded', 'entry',
   3210, 3000, 210, 7.00, 123),
  ('pi_997_m', 'cs_997_m', '00000000-0000-0000-0000-000000997022', 'succeeded', 'entry',
   3210, 3000, 210, 7.00, 123);

-- Carts carry a checkout session id, which only service_role may write.
-- C: the paid abandoned cart. X: abandoned, but its session has an order (A).
-- L: abandoned, claimed by the pre-MYK9-997 five-argument call.
SET LOCAL ROLE service_role;
INSERT INTO public.entry_carts (id, exhibitor_id, show_id, status, stripe_checkout_session_id)
SELECT v.id::uuid, ep.id, '00000000-0000-0000-0000-000000997021', 'abandoned', v.session
FROM public.exhibitor_profiles ep
CROSS JOIN (VALUES
  ('00000000-0000-0000-0000-000000997031', 'cs_997_c'),
  ('00000000-0000-0000-0000-000000997032', 'cs_997_a'),
  ('00000000-0000-0000-0000-000000997033', 'cs_997_l'),
  ('00000000-0000-0000-0000-000000997034', 'cs_997_low')
) AS v(id, session)
WHERE ep.auth_user_id = '00000000-0000-0000-0000-000000997101';
RESET ROLE;

-- R1 fixtures: club 997003, one show and one paid abandoned cart per case.
INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000997003', 'MYK9-997 Refund Club');
INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
SELECT ('00000000-0000-0000-0000-00000099704' || n)::uuid, 'MYK9-997 P' || n, 'AKC',
       current_date + 30, current_date + 30, 'draft', '00000000-0000-0000-0000-000000997003'
  FROM generate_series(1, 4) AS n;
INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id, club_id)
SELECT '00000000-0000-0000-0000-000000997010', r.id, true,
       '00000000-0000-0000-0000-000000997100', '00000000-0000-0000-0000-000000997003'
  FROM public.roles r
 WHERE r.name = 'club_admin';
SET LOCAL ROLE service_role;
INSERT INTO public.entry_carts (id, exhibitor_id, show_id, status, stripe_checkout_session_id)
SELECT ('00000000-0000-0000-0000-00000099705' || n)::uuid, ep.id,
       ('00000000-0000-0000-0000-00000099704' || n)::uuid, 'abandoned', 'cs_997_p' || n
  FROM public.exhibitor_profiles ep
 CROSS JOIN generate_series(1, 4) AS n
 WHERE ep.auth_user_id = '00000000-0000-0000-0000-000000997101';
RESET ROLE;

CREATE FUNCTION pg_temp.expect_eq(p_actual text, p_expected text, p_label text)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'FAIL %: got %, expected %', p_label, p_actual, p_expected;
  END IF;
  RAISE NOTICE 'PASS %', p_label;
END;
$f$;

CREATE FUNCTION pg_temp.order_refunds(p_intent text)
RETURNS text LANGUAGE sql AS $f$
  SELECT o.refunded_cents || '/' || o.club_funded_refunded_cents || '/'
         || o.make_whole_refunded_cents
    FROM public.stripe_orders o WHERE o.stripe_payment_intent_id = p_intent
$f$;

-- What financial_reconciliation_summary reports, as the site admin.
CREATE FUNCTION pg_temp.summary(p_scope text, p_club uuid, p_show uuid)
RETURNS TABLE (
  platform_fee bigint, processing bigint, refunded bigint, pending_refunded bigint,
  club_funded bigint, pending_club_funded bigint, kept_fee bigint, kept_count bigint
)
LANGUAGE sql AS $f$
  SELECT s.platform_fee_cents, s.processing_fee_cents, s.refunded_cents,
         s.pending_fee_refunded_cents, s.club_funded_refunded_cents,
         s.pending_fee_club_funded_refunded_cents, s.unfulfilled_charge_kept_fee_cents,
         s.unfulfilled_charge_count
    FROM public.financial_reconciliation_summary(p_scope, p_club, p_show) AS s
$f$;

-- Platform-scope baseline BEFORE any refund or request, so S2 asserts deltas
-- and stays correct on a database that already holds other rows.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000997100', true);
CREATE TEMP TABLE platform_before ON COMMIT DROP AS
  SELECT * FROM pg_temp.summary('platform', NULL, NULL);
RESET ROLE;

-- ---------------------------------------------------------------------------
-- C1-C4: the ledger (as the webhook writes it, service_role)
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;

-- C1: a secretary refund (club-funded) and a dashboard refund (old call).
SELECT * FROM public.record_order_refund_cents(
  p_payment_intent_id => 'pi_997_a', p_refund_id => 're_997_a1', p_amount_cents => 5000,
  p_kind => 'post_hoc', p_club_funded => true);
SELECT * FROM public.record_order_refund_cents(
  p_payment_intent_id => 'pi_997_b', p_refund_id => 're_997_b1', p_amount_cents => 200,
  p_kind => 'post_hoc');
SELECT * FROM public.record_order_refund_cents(
  p_payment_intent_id => 'pi_997_d', p_refund_id => 're_997_d1', p_amount_cents => 2000,
  p_kind => 'post_hoc', p_club_funded => true);
SELECT * FROM public.record_order_refund_cents(
  p_payment_intent_id => 'pi_997_e', p_refund_id => 're_997_e1', p_amount_cents => 1000,
  p_kind => 'post_hoc', p_club_funded => true);

SELECT pg_temp.expect_eq(pg_temp.order_refunds('pi_997_a'), '5000/5000/0',
  'C1 a club-funded refund rolls into refunded AND club-funded');
SELECT pg_temp.expect_eq(pg_temp.order_refunds('pi_997_b'), '200/0/0',
  'C1 an unflagged (dashboard) refund rolls into refunded only');

-- C2: a redelivery claiming the opposite changes nothing.
SELECT * FROM public.record_order_refund_cents(
  p_payment_intent_id => 'pi_997_a', p_refund_id => 're_997_a1', p_amount_cents => 5000,
  p_kind => 'post_hoc', p_club_funded => false);
SELECT * FROM public.record_order_refund_cents(
  p_payment_intent_id => 'pi_997_b', p_refund_id => 're_997_b1', p_amount_cents => 200,
  p_kind => 'post_hoc', p_club_funded => true);
SELECT pg_temp.expect_eq(pg_temp.order_refunds('pi_997_a'), '5000/5000/0',
  'C2 a redelivery cannot un-mark a club-funded refund');
SELECT pg_temp.expect_eq(pg_temp.order_refunds('pi_997_b'), '200/0/0',
  'C2 a redelivery cannot mark a platform-funded refund club-funded');

-- C3: make-whole is never club-funded.
SELECT * FROM public.record_order_refund_cents(
  p_payment_intent_id => 'pi_997_m', p_refund_id => 're_997_m1', p_amount_cents => 3000,
  p_kind => 'make_whole', p_club_funded => true);
SELECT pg_temp.expect_eq(pg_temp.order_refunds('pi_997_m'), '0/0/3000',
  'C3 a make-whole refund asked to be club-funded is booked make-whole only');
SELECT pg_temp.expect_eq(
  (SELECT r.club_funded::text FROM public.stripe_order_refunds r
    WHERE r.stripe_refund_id = 're_997_m1'),
  'false', 'C3 the make-whole ledger row is not club-funded');
DO $$
BEGIN
  BEGIN
    INSERT INTO public.stripe_order_refunds
      (stripe_refund_id, stripe_payment_intent_id, amount_cents, kind, club_funded)
    VALUES ('re_997_bad', 'pi_997_m', 1, 'make_whole', true);
    RAISE EXCEPTION 'FAIL C3 the CHECK accepted a club-funded make-whole row';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS C3 the CHECK refuses a club-funded make-whole row';
  END;
END;
$$;

-- C4: a club-funded refund Stripe later fails leaves both totals.
SELECT * FROM public.record_order_refund_cents(
  p_payment_intent_id => 'pi_997_f', p_refund_id => 're_997_f1', p_amount_cents => 3000,
  p_kind => 'post_hoc', p_club_funded => true);
SELECT pg_temp.expect_eq(pg_temp.order_refunds('pi_997_f'), '3000/3000/0',
  'C4 booked club-funded');
SELECT * FROM public.reverse_order_refund_cents('pi_997_f', 're_997_f1', 3000, 'post_hoc', 'failed');
SELECT pg_temp.expect_eq(pg_temp.order_refunds('pi_997_f'), '0/0/0',
  'C4 a failed club-funded refund leaves refunded AND club-funded');

-- ---------------------------------------------------------------------------
-- K1-K2: the charge on order-less refund requests
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_eq(
  (SELECT c.outcome FROM public.claim_abandoned_cart_refund(
     '00000000-0000-0000-0000-000000997031', 'cs_997_c', 'pi_997_c', 3000,
     '{"cart_id": "997031", "charged_cents": 3210}'::jsonb) AS c),
  'claimed', 'K1 the paid abandoned cart is claimed with its charge');
SELECT pg_temp.expect_eq(
  (SELECT r.charged_cents || ' ' || r.detail::text FROM public.refund_requests r
    WHERE r.stripe_checkout_session_id = 'cs_997_c'),
  '3210 {"cart_id": "997031"}', 'K1 the charge is lifted into the column, out of detail');
SELECT pg_temp.expect_eq(
  (SELECT c.outcome FROM public.claim_abandoned_cart_refund(
     '00000000-0000-0000-0000-000000997032', 'cs_997_a', 'pi_997_a', 10000,
     '{"charged_cents": 10700}'::jsonb) AS c),
  'claimed', 'K1 a cart whose session HAS an order is claimed too (S1 must not double-book it)');
SELECT pg_temp.expect_eq(
  (SELECT c.outcome FROM public.claim_abandoned_cart_refund(
     '00000000-0000-0000-0000-000000997033', 'cs_997_l', 'pi_997_l', 3000) AS c),
  'claimed', 'K1 a claim with no charge in its detail still works');
SELECT pg_temp.expect_eq(
  (SELECT COALESCE(r.charged_cents::text, 'null') FROM public.refund_requests r
    WHERE r.stripe_checkout_session_id = 'cs_997_l'),
  'null', 'K1 ...and records no charge');
DO $$
BEGIN
  BEGIN
    PERFORM public.claim_abandoned_cart_refund(
      '00000000-0000-0000-0000-000000997034', 'cs_997_low', 'pi_997_low', 3000,
      '{"charged_cents": 2999}'::jsonb);
    RAISE EXCEPTION 'FAIL K1 a charge below its refund was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS K1 a charge below its refund is refused';
  END;
  BEGIN
    PERFORM public.claim_abandoned_cart_refund(
      '00000000-0000-0000-0000-000000997034', 'cs_997_low', 'pi_997_low', 3000,
      '{"charged_cents": 3210.5}'::jsonb);
    RAISE EXCEPTION 'FAIL K1 a fractional charge was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS K1 a fractional charge is refused';
  END;
END;
$$;

SELECT pg_temp.expect_eq(
  (SELECT q.created::text FROM public.queue_payment_link_refund(
     p_session_id => 'cs_997_nolink', p_payment_intent_id => 'pi_997_nolink',
     p_amount_cents => 900, p_reason => 'no_link_record',
     p_detail => '{"invalid_entry_ids": [], "charged_cents": 963}'::jsonb) AS q),
  'true', 'K2 the no-link session queues its request');
SELECT pg_temp.expect_eq(
  (SELECT r.charged_cents || ' ' || (r.detail ? 'charged_cents')::text
     FROM public.refund_requests r
    WHERE r.stripe_checkout_session_id = 'cs_997_nolink'),
  '963 false', 'K2 ...with what Stripe charged, in the column only');
DO $$
BEGIN
  BEGIN
    PERFORM public.queue_payment_link_refund(
      p_session_id => 'cs_997_nolink2', p_detail => '{"charged_cents": 963}'::jsonb);
    RAISE EXCEPTION 'FAIL K2 a charge with no refund was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'PASS K2 a charge with no refund is refused';
  END;
END;
$$;

RESET ROLE;

-- K3: signatures unchanged, so no overload and no ACL drift.
SELECT pg_temp.expect_eq(
  (SELECT string_agg(p.proname || ':' || has_function_privilege('anon', p.oid, 'EXECUTE')
                     || has_function_privilege('authenticated', p.oid, 'EXECUTE')
                     || has_function_privilege('service_role', p.oid, 'EXECUTE'),
                     ',' ORDER BY p.proname)
     FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('claim_abandoned_cart_refund', 'queue_payment_link_refund',
                        'record_order_refund_cents')),
  'claim_abandoned_cart_refund:falsefalsetrue,queue_payment_link_refund:falsefalsetrue,'
    || 'record_order_refund_cents:falsefalsetrue',
  'K3 one signature each, service_role only');

-- ---------------------------------------------------------------------------
-- R1: the kept fee follows the refunds that actually went out
-- ---------------------------------------------------------------------------
-- The approval path (stripe-approve-refund, then settleAttemptFromStripe):
-- begin an attempt, attach its Stripe refund, settle it succeeded.
CREATE FUNCTION pg_temp.approve_and_settle(p_session text, p_refund text)
RETURNS text LANGUAGE plpgsql AS $f$
DECLARE
  v_request uuid;
  v_begin record;
  v_record record;
  v_settle record;
BEGIN
  SELECT r.id INTO v_request FROM public.refund_requests r
   WHERE r.stripe_checkout_session_id = p_session AND r.kind = 'abandoned_cart';
  SELECT * INTO v_begin
    FROM public.begin_refund_attempt(v_request, '00000000-0000-0000-0000-000000997100');
  SELECT * INTO v_record
    FROM public.record_refund_attempt(v_begin.attempt_id, v_begin.attempt_version, p_refund);
  SELECT * INTO v_settle
    FROM public.settle_refund_attempt(v_begin.attempt_id, v_record.attempt_version, 'succeeded');
  RETURN v_settle.request_status;
END;
$f$;

SET LOCAL ROLE service_role;
SELECT public.claim_abandoned_cart_refund(
         ('00000000-0000-0000-0000-00000099705' || n)::uuid, 'cs_997_p' || n, 'pi_997_p' || n,
         3000, '{"charged_cents": 3210}'::jsonb)
  FROM generate_series(1, 4) AS n;

-- P1: approved refund only. A webhook that ALSO books it in the ledger (under
-- the same refund id) must not count it twice.
SELECT pg_temp.expect_eq(pg_temp.approve_and_settle('cs_997_p1', 're_997_p1_approved'),
  'refunded', 'R1 P1 the approved refund settles');
SELECT * FROM public.record_order_refund_cents(
  p_payment_intent_id => 'pi_997_p1', p_refund_id => 're_997_p1_approved',
  p_amount_cents => 3000, p_kind => 'make_whole');

-- P2: approved refund, then a dashboard refund of the 210 that was left.
SELECT pg_temp.expect_eq(pg_temp.approve_and_settle('cs_997_p2', 're_997_p2_approved'),
  'refunded', 'R1 P2 the approved refund settles');
SELECT * FROM public.record_order_refund_cents(
  p_payment_intent_id => 'pi_997_p2', p_refund_id => 're_997_p2_dashboard',
  p_amount_cents => 210);

-- P3: nothing yet. P4: nothing approved, the whole charge refunded from the
-- dashboard.
SELECT * FROM public.record_order_refund_cents(
  p_payment_intent_id => 'pi_997_p4', p_refund_id => 're_997_p4_dashboard',
  p_amount_cents => 3210);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000997100', true);
SELECT pg_temp.expect_eq(
  (SELECT string_agg(s.kept_fee || '/' || s.kept_count, ' ' ORDER BY n)
     FROM generate_series(1, 4) AS n
    CROSS JOIN LATERAL pg_temp.summary(
      'show', NULL, ('00000000-0000-0000-0000-00000099704' || n)::uuid) AS s),
  '210/1 0/1 210/1 0/1',
  'R1 kept fee: approved only 210, approved + top-up 0, pending 210, dashboard-refunded 0');
SELECT pg_temp.expect_eq(
  (SELECT s.kept_fee || '/' || s.kept_count
     FROM pg_temp.summary('club', '00000000-0000-0000-0000-000000997003', NULL) AS s),
  '420/4', 'R1 the club total is the sum of what each charge actually kept');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- S1-S2: the summary, as the site admin
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000997100', true);

-- S1: club 997001 (show 997021): orders A, B, D and cart C.
SELECT pg_temp.expect_eq(
  (SELECT s.platform_fee || '|' || s.processing || '|' || s.refunded || '|'
          || s.pending_refunded || '|' || s.club_funded || '|' || s.pending_club_funded
          || '|' || s.kept_fee || '|' || s.kept_count
     FROM pg_temp.summary('club', '00000000-0000-0000-0000-000000997001', NULL) AS s),
  '1190|526|7200|2000|7000|2000|210|1',
  'S1 club scope: club-funded refunds and the kept fee on the abandoned cart');
SELECT pg_temp.expect_eq(
  (SELECT s.club_funded || '|' || s.kept_fee || '|' || s.kept_count
     FROM pg_temp.summary('show', NULL, '00000000-0000-0000-0000-000000997021') AS s),
  '7000|210|1', 'S1 show scope agrees');

-- The tie-out the client derives (financialSummary.ts derivePlatformIncome),
-- from these columns: available = (fee − pending fee) − processing −
-- (platform-funded − pending platform-funded); residual = pending fee −
-- pending platform-funded + kept fee. (1190 − 140) − 526 − (200 − 0) = 324;
-- 140 − 0 + 210 = 350; 324 + 350 = 1190 + 210 − 526 − 200.
SELECT pg_temp.expect_eq(
  (SELECT ((s.platform_fee - 140) - s.processing
           - ((s.refunded - s.club_funded) - (s.pending_refunded - s.pending_club_funded)))
          || '|' || (140 - (s.pending_refunded - s.pending_club_funded) + s.kept_fee)
     FROM pg_temp.summary('club', '00000000-0000-0000-0000-000000997001', NULL) AS s),
  '324|350', 'S1 worked example: available 324 and residual 350 tie out to 674');

-- S2: the other club sees only its own orders; platform scope adds the
-- no-link session (no show) and both clubs.
SELECT pg_temp.expect_eq(
  (SELECT s.refunded || '|' || s.club_funded || '|' || s.kept_fee || '|' || s.kept_count
     FROM pg_temp.summary('club', '00000000-0000-0000-0000-000000997002', NULL) AS s),
  '1000|1000|0|0', 'S2 the other club: its own club-funded refund, no kept fee');
SELECT pg_temp.expect_eq(
  (SELECT (a.club_funded - b.club_funded) || '|' || (a.kept_fee - b.kept_fee) || '|'
          || (a.kept_count - b.kept_count)
     FROM pg_temp.summary('platform', NULL, NULL) AS a, platform_before AS b),
  '8000|693|6',
  'S2 platform scope: every club plus the no-link session (210 + 63 + 420 from R1)');

RESET ROLE;

ROLLBACK;
