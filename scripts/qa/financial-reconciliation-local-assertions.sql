-- EXECUTABLE assertions for the MYK9-54 financial SQL (MYK9-54).
--
-- Every existing test for these migrations reads them as TEXT. Three review
-- rounds found bugs that only EXECUTION catches (a dropped WITH keyword, an
-- ambiguous column reference that fails at call time, a non-re-runnable
-- CREATE OR REPLACE). This file actually calls the functions and checks the
-- accounting contract. Run via scripts/qa/run-financial-sql-tests.sh.

\set ON_ERROR_STOP on

-- ── Seed ───────────────────────────────────────────────────────────────────
-- club c1 owns shows s1 + s2; club c2 owns s3.
INSERT INTO public.shows (id, name, club_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Show One',   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'Show Two',   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('33333333-3333-3333-3333-333333333333', 'Show Three', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- Orders. All on show s1 except O10 (show s3), which proves scope filtering.
INSERT INTO public.stripe_orders
  (stripe_payment_intent_id, show_id, status, order_type, amount_cents,
   entry_subtotal_cents, platform_fee_cents, platform_fee_rate,
   stripe_processing_fee_cents, refunded_cents, make_whole_refunded_cents, created_at)
VALUES
  -- O1 well-formed, ties out
  ('pi_o1', '11111111-1111-1111-1111-111111111111', 'succeeded', 'entry',
   10700, 10000,  700, 7.00,  350,     0,    0, '2026-07-01'),
  -- O2 processing fee PENDING (NULL) — must be a count, never summed as 0
  ('pi_o2', '11111111-1111-1111-1111-111111111111', 'succeeded', 'entry',
   21400, 20000, 1400, 7.00, NULL,     0,    0, '2026-07-02'),
  -- O3 cart-overflow make-whole: ties out as subtotal + fee + make_whole
  ('pi_o3', '11111111-1111-1111-1111-111111111111', 'succeeded', 'entry',
   16050, 10000,  700, 7.00,  500,     0, 5350, '2026-07-03'),
  -- O4 POST-HOC refund: a real platform loss
  ('pi_o4', '11111111-1111-1111-1111-111111111111', 'refunded',  'entry',
   10700, 10000,  700, 7.00,  350, 10700,    0, '2026-07-04'),
  -- O5 legacy: subtotal snapshot missing
  ('pi_o5', '11111111-1111-1111-1111-111111111111', 'succeeded', 'entry',
    5000,  NULL,  700, 7.00,  100,     0,    0, '2026-07-05'),
  -- O6 legacy: fee snapshot missing (the OTHER column)
  ('pi_o6', '11111111-1111-1111-1111-111111111111', 'succeeded', 'entry',
    3000,  3000, NULL, NULL, NULL,     0,    0, '2026-07-06'),
  -- O7 one-time 'payment' order: real money, but NOT entry accounting
  ('pi_o7', '11111111-1111-1111-1111-111111111111', 'succeeded', 'payment',
    2500,  NULL, NULL, NULL,  100,     0,    0, '2026-07-07'),
  -- O8 pending: outside the (succeeded, refunded) population entirely
  ('pi_o8', '11111111-1111-1111-1111-111111111111', 'pending',   'entry',
   99999, 99999,    0, 0.00,    0,     0,    0, '2026-07-08'),
  -- O9 DELIBERATELY CORRUPTED: amount <> subtotal + fee + make_whole.
  -- Makes the tie-out falsifiable rather than an identity.
  ('pi_o9', '11111111-1111-1111-1111-111111111111', 'succeeded', 'entry',
   12000, 10000,  700, 7.00,  400,     0,    0, '2026-07-09'),
  -- O10 different club/show: must not leak into the s1 or club-a totals
  ('pi_o10', '33333333-3333-3333-3333-333333333333', 'succeeded', 'entry',
    1000,   900,  100, 10.00,  50,     0,    0, '2026-07-10');

-- Payouts. s1 has a failed row SUPERSEDED by a live completed row; s2 has a
-- failed row with NO live row (genuinely outstanding); s3 is another club.
INSERT INTO public.show_payouts (show_id, amount_cents, status, created_at) VALUES
  ('11111111-1111-1111-1111-111111111111', 5000, 'failed',    '2026-07-01T00:00:00Z'),
  ('11111111-1111-1111-1111-111111111111', 9000, 'completed', '2026-07-02T00:00:00Z'),
  -- s2 failed TWICE with no live row: the cron leaves the old failed row and
  -- inserts a new one per retry, and the live-row unique index only bounds
  -- NON-failed rows, so neither is superseded. Only the LATEST attempt is the
  -- outstanding liability — summing both would count the same owed money twice.
  ('22222222-2222-2222-2222-222222222222', 2500, 'failed',    '2026-07-01T00:00:00Z'),
  ('22222222-2222-2222-2222-222222222222', 3000, 'failed',    '2026-07-03T00:00:00Z'),
  ('33333333-3333-3333-3333-333333333333', 7000, 'pending',   '2026-07-01T00:00:00Z');

-- ── Assertions ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  s        record;
  n        bigint;
  r        record;
  bad      text;
  s1 CONSTANT uuid := '11111111-1111-1111-1111-111111111111';
  s2 CONSTANT uuid := '22222222-2222-2222-2222-222222222222';
  ca CONSTANT uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
BEGIN

RAISE NOTICE '[1] summary executes at all (ambiguous-column class)';
-- A RETURNS TABLE output column that collides with a CTE column raises
-- "column reference ... is ambiguous" only when the function is CALLED.
SELECT * INTO s FROM public.financial_reconciliation_summary('show', NULL, s1);
PERFORM public.test_true(s IS NOT NULL, 'summary returned a row');

RAISE NOTICE '[2] show-scope entry accounting';
-- Population: O1..O6, O9 (succeeded/refunded AND order_type = entry).
PERFORM public.test_eq(s.order_count,          7, 'order_count');
PERFORM public.test_eq(s.gross_charged_cents,  10700 + 21400 + 16050 + 10700 + 5000 + 3000 + 12000,
                       'gross_charged_cents');
PERFORM public.test_eq(s.entry_subtotal_cents, 10000 + 20000 + 10000 + 10000 + 3000 + 10000,
                       'entry_subtotal_cents');
PERFORM public.test_eq(s.platform_fee_cents,   700 + 1400 + 700 + 700 + 700 + 700,
                       'platform_fee_cents');

RAISE NOTICE '[3] NULL processing fee is a pending COUNT, never summed as 0';
PERFORM public.test_eq(s.processing_fee_cents, 350 + 500 + 350 + 100 + 400, 'processing_fee_cents');
PERFORM public.test_eq(s.processing_fee_pending_count, 2, 'processing_fee_pending_count');

RAISE NOTICE '[4] refund split: make_whole excluded from post-hoc loss';
PERFORM public.test_eq(s.refunded_cents,            10700, 'refunded_cents (post-hoc loss)');
PERFORM public.test_eq(s.make_whole_refunded_cents,  5350, 'make_whole_refunded_cents');
PERFORM public.test_true(s.refunded_cents <> s.refunded_cents + s.make_whole_refunded_cents,
                         'make_whole not folded into post-hoc');

RAISE NOTICE '[5] snapshot_missing counts a NULL in EITHER column';
PERFORM public.test_eq(s.snapshot_missing_count, 2, 'snapshot_missing_count (O5 subtotal, O6 fee)');

RAISE NOTICE '[6] entry-only scoping: order_type = payment lands in non_entry_*';
PERFORM public.test_eq(s.non_entry_order_count, 1, 'non_entry_order_count');
PERFORM public.test_eq(s.non_entry_gross_cents, 2500, 'non_entry_gross_cents');

RAISE NOTICE '[7] failed-payout supersession';
-- show s1: failed 5000 superseded by a live completed 9000 -> excluded.
PERFORM public.test_eq(s.payout_count,            2, 's1 payout_count');
PERFORM public.test_eq(s.payout_completed_cents,  9000, 's1 payout_completed_cents');
PERFORM public.test_eq(s.payout_failed_cents,     0, 's1 superseded failed excluded');
PERFORM public.test_eq(s.payout_failed_count,     0, 's1 superseded failed count');
-- show s2: failed 3000 with NO live row -> genuinely outstanding.
SELECT * INTO s FROM public.financial_reconciliation_summary('show', NULL, s2);
-- s2 holds TWO failed attempts (2500 then 3000) and no live row. Only the LATEST
-- counts: 3000, not 5500. Summing every historical attempt would report the same
-- owed money once per retry (Codex round-6 finding).
PERFORM public.test_eq(s.payout_failed_cents, 3000, 's2 only the LATEST failed attempt counts');
PERFORM public.test_eq(s.payout_failed_count,    1, 's2 repeated failures counted once');
PERFORM public.test_eq(s.payout_count,           2, 's2 both attempts still visible in payout_count');

RAISE NOTICE '[8] club scope rolls up its shows and excludes other clubs';
SELECT * INTO s FROM public.financial_reconciliation_summary('club', ca, NULL);
PERFORM public.test_eq(s.order_count, 7, 'club order_count (O10 belongs to club b)');
-- s1 holds 2 rows and s2 holds 2 (both failed attempts stay visible in the raw
-- count; only the LATEST counts toward the failed LIABILITY, asserted next).
PERFORM public.test_eq(s.payout_count, 4, 'club payout_count (s1 x2 + s2 x2)');
PERFORM public.test_eq(s.payout_failed_cents, 3000, 'club failed = s2 only');
SELECT * INTO s FROM public.financial_reconciliation_summary('platform', NULL, NULL);
PERFORM public.test_eq(s.order_count, 8, 'platform order_count includes O10');
PERFORM public.test_eq(s.payout_pending_cents, 7000, 'platform pending (club b s3)');

RAISE NOTICE '[9] tie-out is FALSIFIABLE';
-- Well-formed rows must tie out; the deliberately corrupted O9 must NOT.
SELECT string_agg(o.stripe_payment_intent_id, ',' ORDER BY o.stripe_payment_intent_id)
  INTO bad
FROM public.financial_reconciliation_orders('show', NULL, s1, 1000) f
JOIN public.stripe_orders o ON o.id = f.order_id
WHERE f.entry_subtotal_cents IS NOT NULL
  AND f.platform_fee_cents IS NOT NULL
  AND f.amount_cents <> f.entry_subtotal_cents + f.platform_fee_cents + f.make_whole_refunded_cents;
PERFORM public.test_true(bad = 'pi_o9',
  format('exactly the corrupted order fails tie-out (got %s)', COALESCE(bad, '<none>')));

RAISE NOTICE '[10] detail rows describe the same population as the aggregates';
SELECT count(*) INTO n FROM public.financial_reconciliation_orders('show', NULL, s1, 1000);
PERFORM public.test_eq(n, 7, 'detail row count == summary order_count');

RAISE NOTICE '[11] refund LEDGER: one row per Stripe refund, totals DERIVED';
-- Signature: (payment_intent, refund_id, amount_cents, kind).
-- pi_o1 is a 10700 order; refunds stay below that so it is not fully refunded yet.
SELECT * INTO r FROM public.record_order_refund_cents('pi_o1', 're_a', 1000, 'post_hoc');
PERFORM public.test_eq(r.post_hoc_cents,  1000, 'first delivery books post-hoc');
PERFORM public.test_eq(r.make_whole_cents,   0, 'first delivery make_whole');
PERFORM public.test_true(NOT r.fully_refunded, 'partial refund is not fully_refunded');
-- DUPLICATE BOOKING: an upsert of the same primary key, so the totals cannot move.
SELECT * INTO r FROM public.record_order_refund_cents('pi_o1', 're_a', 1000, 'post_hoc');
PERFORM public.test_eq(r.post_hoc_cents, 1000, 'duplicate booking is a no-op (PK upsert)');
-- Two DISTINCT refunds are two rows and simply SUM — no cumulative-total guess.
SELECT * INTO r FROM public.record_order_refund_cents('pi_o1', 're_b', 600, 'make_whole');
PERFORM public.test_eq(r.make_whole_cents, 600, 'make-whole booked to its own column');
PERFORM public.test_eq(r.post_hoc_cents,  1000, 'post-hoc untouched by a make-whole booking');
-- KIND PRECEDENCE: the later charge.refunded sweep books every refund it sees as
-- post_hoc. It must NOT demote a refund the make-whole writer already claimed.
SELECT * INTO r FROM public.record_order_refund_cents('pi_o1', 're_b', 600, 'post_hoc');
PERFORM public.test_eq(r.make_whole_cents, 600, 'kind is never overwritten by a redelivery');
PERFORM public.test_eq(r.post_hoc_cents,  1000, 'post-hoc not inflated by the re-sweep');
-- A refund id is REQUIRED: there is no unkeyed/legacy path left to abuse.
SELECT count(*) INTO n FROM public.record_order_refund_cents('pi_o1', NULL, 2000, 'make_whole');
PERFORM public.test_eq(n, 0, 'NULL refund id books nothing');
SELECT o.make_whole_refunded_cents INTO n FROM public.stripe_orders o
 WHERE o.stripe_payment_intent_id = 'pi_o1';
PERFORM public.test_eq(n, 600, 'the refused unkeyed call changed nothing');
-- Full refund promotes succeeded -> refunded.
SELECT * INTO r FROM public.record_order_refund_cents('pi_o5', 're_c', 5000, 'post_hoc');
PERFORM public.test_true(r.fully_refunded, 'refund covering the full amount sets fully_refunded');
PERFORM public.test_true(r.order_status = 'refunded', 'full refund promotes status to refunded');

RAISE NOTICE '[12] ADVERSARIAL replay: the four sequences that broke the counters';

-- (A) reverse then REDELIVERED booking. Under the old monotonic counters:
--     charge.refunded(10700) -> post_hoc 10700; refund.failed -> 0; the
--     redelivered charge.refunded re-booked 10700 and silently UNDID the
--     reversal. Now `failed` is a terminal STATE on the row, so it stays.
SELECT * INTO r FROM public.record_order_refund_cents('pi_o4', 're_f1', 10700, 'post_hoc');
PERFORM public.test_eq(r.post_hoc_cents, 10700, 'A: refund booked');
SELECT * INTO r FROM public.reverse_order_refund_cents('pi_o4', 're_f1', 10700);
PERFORM public.test_true(r.reversed, 'A: first reversal applies');
PERFORM public.test_eq(r.post_hoc_cents, 0, 'A: failed refund no longer counts');
PERFORM public.test_true(r.order_status = 'succeeded',
  format('A: fully-refunded order DEMOTED back to succeeded (got %s)', r.order_status));
SELECT * INTO r FROM public.record_order_refund_cents('pi_o4', 're_f1', 10700, 'post_hoc');
PERFORM public.test_eq(r.post_hoc_cents, 0, 'A: REDELIVERED booking must STAY reversed');
PERFORM public.test_true(r.order_status = 'succeeded', 'A: redelivery does not re-promote');
-- Duplicate reversal: nothing left to flip, totals unchanged.
SELECT * INTO r FROM public.reverse_order_refund_cents('pi_o4', 're_f1', 10700);
PERFORM public.test_true(NOT r.reversed, 'A: duplicate refund.failed is a no-op');
PERFORM public.test_eq(r.post_hoc_cents, 0, 'A: duplicate reversal does not double-subtract');

-- (B) make-whole reverse then RE-BOOK. The old reversal deleted the refund id
--     from make_whole_refund_ids — destroying the very dedupe key — so the
--     redelivered booking added the amount right back.
SELECT * INTO r FROM public.record_order_refund_cents('pi_o3', 're_mw_o3', 500, 'make_whole');
PERFORM public.test_eq(r.make_whole_cents, 500, 'B: make-whole booked');
SELECT * INTO r FROM public.reverse_order_refund_cents('pi_o3', 're_mw_o3', 500);
PERFORM public.test_true(r.reversed, 'B: make-whole reversal applies');
PERFORM public.test_eq(r.make_whole_cents, 0, 'B: failed make-whole no longer counts');
PERFORM public.test_eq(r.post_hoc_cents,   0, 'B: post-hoc untouched by a make-whole failure');
SELECT * INTO r FROM public.record_order_refund_cents('pi_o3', 're_mw_o3', 500, 'make_whole');
PERFORM public.test_eq(r.make_whole_cents, 0, 'B: RE-BOOK after reversal must stay reversed');

-- (C) the unkeyed make-whole path that debited the wrong column and burned the
--     reversal key is GONE: a NULL id books nothing (asserted in [11]) and a
--     reversal without an id flips nothing.
SELECT count(*) INTO n FROM public.reverse_order_refund_cents('pi_o1', NULL, 100);
PERFORM public.test_eq(n, 0, 'C: NULL refund id reverses nothing');

-- (D) reverse a refund this ledger NEVER booked. The old path applied it anyway
--     (debiting post_hoc, floored at 0) and permanently burned the key.
SELECT count(*) INTO n FROM public.reverse_order_refund_cents('pi_o9', 're_never_booked', 999999);
PERFORM public.test_eq(n, 0, 'D: an order with no ledger rows is not touched at all');
SELECT count(*) INTO n FROM public.stripe_order_refunds f
 WHERE f.stripe_refund_id = 're_never_booked';
PERFORM public.test_eq(n, 0, 'D: a reversal never INVENTS a ledger row');
-- Cross-intent: a real refund id must not be reversed through the wrong intent.
SELECT count(*) INTO n FROM public.reverse_order_refund_cents('pi_o1', 're_f1', 10700);
PERFORM public.test_eq(n, 1, 'D: wrong-intent reversal still recomputes its own order');
SELECT f.state INTO bad FROM public.stripe_order_refunds f WHERE f.stripe_refund_id = 're_a';
PERFORM public.test_true(bad = 'succeeded', 'D: an unrelated refund row is untouched');

-- (E) refund.failed arriving BEFORE the booking event (Stripe guarantees no
--     ordering). It must reverse nothing, the later booking is honest, and the
--     redelivered failure settles it.
SELECT count(*) INTO n FROM public.reverse_order_refund_cents('pi_o6', 're_ooo', 3000);
PERFORM public.test_eq(n, 0, 'E: out-of-order failure before booking changes nothing');
SELECT * INTO r FROM public.record_order_refund_cents('pi_o6', 're_ooo', 3000, 'post_hoc');
PERFORM public.test_eq(r.post_hoc_cents, 3000, 'E: the later booking is honest');
PERFORM public.test_true(r.order_status = 'refunded', 'E: booking promotes to refunded');
SELECT * INTO r FROM public.reverse_order_refund_cents('pi_o6', 're_ooo', 3000);
PERFORM public.test_true(r.reversed, 'E: the redelivered failure settles it');
PERFORM public.test_eq(r.post_hoc_cents, 0, 'E: totals fall back to zero');
PERFORM public.test_true(r.order_status = 'succeeded', 'E: and the status demotes');

-- (F) a failed refund's row is RETAINED, not deleted, so the history stays
--     auditable and the terminal state survives every redelivery.
SELECT count(*) INTO n FROM public.stripe_order_refunds f WHERE f.state = 'failed';
PERFORM public.test_true(n >= 3, format('F: failed rows retained for audit (got %s)', n));

-- (G) refunded_at is DERIVED from the same condition as the status, so it is set
--     IFF fully refunded and can never be cleared out from under a full refund
--     nor left dangling on a partial one (the old reversal cleared it on orders
--     that were never full).
SELECT * INTO r FROM public.record_order_refund_cents('pi_o2', 're_partial', 1000, 'post_hoc');
PERFORM public.test_true(NOT r.fully_refunded, 'G: a 1000 refund on 21400 is partial');
SELECT count(*) INTO n
  FROM public.stripe_orders o
  JOIN (SELECT DISTINCT f.order_id AS oid FROM public.stripe_order_refunds f
         WHERE f.order_id IS NOT NULL) led ON led.oid = o.id
 WHERE (o.refunded_at IS NOT NULL)
   <> (COALESCE(o.amount_cents, 0) > 0
       AND o.make_whole_refunded_cents + o.refunded_cents >= o.amount_cents);
PERFORM public.test_eq(n, 0, 'G: refunded_at IS NOT NULL IFF fully refunded, on every order');

RAISE NOTICE '[12b] authorization RAISEs rather than returning an empty $0';
BEGIN
  SET LOCAL test.authorized = 'off';
  SELECT count(*) INTO n FROM public.financial_reconciliation_summary('platform', NULL, NULL);
  RAISE EXCEPTION 'FAIL unauthorized platform summary returned % rows instead of raising', n;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE '  ok  unauthorized platform scope raises 42501';
END;
BEGIN
  SET LOCAL test.authorized = 'off';
  PERFORM count(*) FROM public.financial_reconciliation_orders('show', NULL, s1, 10);
  RAISE EXCEPTION 'FAIL unauthorized orders detail did not raise';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE '  ok  unauthorized show scope raises 42501';
END;
BEGIN
  -- SET LOCAL is transaction-scoped, so flip it back explicitly.
  SET LOCAL test.authorized = 'on';
  PERFORM count(*) FROM public.financial_reconciliation_summary('platform', NULL, NULL);
  RAISE NOTICE '  ok  authorized caller still returns rows';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE EXCEPTION 'FAIL authorized caller was rejected';
END;
BEGIN
  PERFORM count(*) FROM public.financial_reconciliation_summary('club', NULL, NULL);
  RAISE EXCEPTION 'FAIL club scope without a club id did not raise';
EXCEPTION WHEN null_value_not_allowed THEN
  RAISE NOTICE '  ok  club scope without a club id raises 22004';
END;

END;
$$;

-- [13] PII: the reconciliation output column set must carry no customer identity.
DO $$
DECLARE
  leaked text;
BEGIN
  SELECT string_agg(DISTINCT c, ', ') INTO leaked
  FROM (
    SELECT unnest(p.proargnames) AS c
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.proname LIKE 'financial_reconciliation_%'
  ) cols
  WHERE c ~* '(customer|email|phone|address|first_name|last_name|full_name|handler|owner|dog|person|user_id|metadata|entry_ids|receipt)';
  PERFORM public.test_true(leaked IS NULL,
    format('reconciliation outputs carry no PII (leaked: %s)', COALESCE(leaked, 'none')));
END;
$$;

SELECT 'ALL FINANCIAL SQL ASSERTIONS PASSED' AS result;
