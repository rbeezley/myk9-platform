-- MYK9-997 (migration 20261004193700): the ledger tells club-funded refunds
-- from platform-funded ones, and platform income subtracts only the latter.
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
--   S1  financial_reconciliation_summary, the MYK9-997 worked example for one
--       club's show: order fees 700 + 350 + 140, refunds 5000 (club) + 200
--       (platform) + 2000 (club, on the order whose processing fee is not
--       captured).
--   S2  Scope: another club's show does not leak into this club's figures;
--       platform scope adds it.
--
-- The order-less full refund (a paid abandoned cart, a paid payment link with
-- no link row, refunded in full: owner rule 2026-10-04) is an edge-function
-- amount, covered by refundRequests.test.ts; nothing about it is in SQL.
--
-- Every show has a club (MYK9-1008 makes shows.club_id NOT NULL).
-- All fixtures roll back. Run with psql -X -v ON_ERROR_STOP=1 after migrations.

BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures: site and club admin (people 997010, auth 997100), club 997001
-- with show 997021, club 997002 with show 997022.
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
   '{}', '{}', false, false, false);

-- No auth_user_id here: is_site_admin() reads user_roles.auth_user_id, and the
-- auth.users insert above may already have linked a people row of its own.
INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  ('00000000-0000-0000-0000-000000997010', 'MYK9-997', 'Admin', 'myk9997-admin-p@example.test');

INSERT INTO public.user_roles (user_id, role_id, is_active, auth_user_id)
SELECT '00000000-0000-0000-0000-000000997010', r.id, true,
       '00000000-0000-0000-0000-000000997100'
  FROM public.roles r
 WHERE r.name = 'site_admin';

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
  club_funded bigint, pending_club_funded bigint
)
LANGUAGE sql AS $f$
  SELECT s.platform_fee_cents, s.processing_fee_cents, s.refunded_cents,
         s.pending_fee_refunded_cents, s.club_funded_refunded_cents,
         s.pending_fee_club_funded_refunded_cents
    FROM public.financial_reconciliation_summary(p_scope, p_club, p_show) AS s
$f$;

-- Platform-scope baseline BEFORE any refund, so S2 asserts deltas
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

RESET ROLE;

-- ---------------------------------------------------------------------------
-- S1-S2: the summary, as the site admin
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000997100', true);

-- S1: club 997001 (show 997021): orders A, B and D.
SELECT pg_temp.expect_eq(
  (SELECT s.platform_fee || '|' || s.processing || '|' || s.refunded || '|'
          || s.pending_refunded || '|' || s.club_funded || '|' || s.pending_club_funded
     FROM pg_temp.summary('club', '00000000-0000-0000-0000-000000997001', NULL) AS s),
  '1190|526|7200|2000|7000|2000',
  'S1 club scope: the club-funded share of the refunds');
SELECT pg_temp.expect_eq(
  (SELECT s.club_funded || '|' || s.pending_club_funded
     FROM pg_temp.summary('show', NULL, '00000000-0000-0000-0000-000000997021') AS s),
  '7000|2000', 'S1 show scope agrees');

-- The tie-out the client derives (financialSummary.ts derivePlatformIncome),
-- from these columns: available = (fee − pending fee) − processing −
-- (platform-funded − pending platform-funded); residual = pending fee −
-- pending platform-funded. (1190 − 140) − 526 − (200 − 0) = 324; 140 − 0 =
-- 140. The 7000 of club-funded refunds subtract from neither.
SELECT pg_temp.expect_eq(
  (SELECT ((s.platform_fee - 140) - s.processing
           - ((s.refunded - s.club_funded) - (s.pending_refunded - s.pending_club_funded)))
          || '|' || (140 - (s.pending_refunded - s.pending_club_funded))
     FROM pg_temp.summary('club', '00000000-0000-0000-0000-000000997001', NULL) AS s),
  '324|140', 'S1 worked example: available 324, residual 140');

-- S2: the other club sees only its own orders; platform scope adds both.
SELECT pg_temp.expect_eq(
  (SELECT s.refunded || '|' || s.club_funded
     FROM pg_temp.summary('club', '00000000-0000-0000-0000-000000997002', NULL) AS s),
  '1000|1000', 'S2 the other club: only its own club-funded refund');
SELECT pg_temp.expect_eq(
  (SELECT (a.club_funded - b.club_funded) || '|' || (a.refunded - b.refunded)
     FROM pg_temp.summary('platform', NULL, NULL) AS a, platform_before AS b),
  '8000|8200', 'S2 platform scope: both clubs');

RESET ROLE;

ROLLBACK;
