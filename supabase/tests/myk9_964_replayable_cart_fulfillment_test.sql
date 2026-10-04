-- MYK9-964 (migration 20261004214700): cart fulfillment is replayable and the
-- cart latch closes LAST, with the order and the cart_overflow refund request,
-- in one transaction.
--
-- One paid cart, five lines, worked by the webhook across three deliveries:
--   I1 class C1 (room)                         -> created_entry
--   I2 class C2 (full, no wait list)           -> denied
--   I3 class C3 (full, wait list)              -> waitlisted
--   I4 Finish Payment line for pending entry E4 -> paid_existing
--   I5 class C9 of ANOTHER show                -> failed (deterministic error)
--
-- Properties asserted here:
--   R1  Shape and ACL: the four RPCs are SECURITY DEFINER with search_path ''
--       and executable by service_role only; neither table grants anything
--       to anon or authenticated.
--   R2  begin_cart_fulfillment refuses a cart not on this session, and line
--       amounts that do not price exactly the cart's lines; 'begun' holds the
--       cart at 'fulfilling' and snapshots every line.
--   R3  A fulfilling cart is the webhook's: the owner cannot move it, and the
--       abandoned-cart refund claim cannot win it.
--   R4  LATCH LAST: complete_cart_fulfillment refuses while any line has no
--       recorded outcome, and writes nothing.
--   R5  Delivery 1 records every outcome, then dies before the latch.
--   R6  Capacity frees up. Delivery 2 resumes and REPLAYS: identical outcomes
--       and entry ids, no second entry, no entry for the denied line, no
--       second wait-list row, and the same unserved amount.
--   R7  The latch closes with the order and the cart_overflow request in one
--       call: cart submitted, run complete, one order, one request.
--   R8  Delivery 3 (after the latch) finds the run complete; a retry of the
--       latch call (a lost response) creates nothing new and returns the
--       same request.
--   R9  Guards: the order must carry exactly the recorded paid lines; a
--       refund needs an unserved line and cannot exceed the charge; a
--       paid_existing claim must be paid by this intent; a recorded outcome
--       never changes; a Finish Payment line is never created here.
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

-- A fixture id: 00000000-0000-0000-0000-000000964<suffix>.
CREATE FUNCTION pg_temp.id(p_suffix text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $f$
  SELECT ('00000000-0000-0000-0000-000000964' || p_suffix)::uuid
$f$;

-- Every line's recorded outcome, in line order: item:outcome:entry:waitlist.
CREATE FUNCTION pg_temp.outcomes(p_session text)
RETURNS text LANGUAGE sql AS $f$
  SELECT string_agg(
           right(l.cart_item_id::text, 3) || ':' || COALESCE(l.outcome, '-') || ':'
             || COALESCE(right(l.entry_id::text, 12), '-') || ':'
             || COALESCE(right(l.waitlist_entry_id::text, 12), '-'),
           ' ' ORDER BY l.line_no)
    FROM public.cart_fulfillment_lines l
   WHERE l.stripe_checkout_session_id = p_session
$f$;

-- The amount the unserved lines were charged (what decideCartOverflowRefund
-- refunds the entry fees of), from the RECORDED outcomes.
CREATE FUNCTION pg_temp.unserved_cents(p_session text)
RETURNS text LANGUAGE sql AS $f$
  SELECT COALESCE(sum(l.line_amount_cents), 0)::text
    FROM public.cart_fulfillment_lines l
   WHERE l.stripe_checkout_session_id = p_session
     AND l.outcome IN ('waitlisted', 'denied', 'failed')
$f$;

-- The order the webhook passes (stripe-webhook cartFulfillment).
CREATE FUNCTION pg_temp.cart_order(p_intent text, p_entry_ids jsonb, p_amount integer)
RETURNS jsonb LANGUAGE sql AS $f$
  SELECT jsonb_build_object(
    'customer_id', NULL, 'stripe_payment_intent_id', p_intent, 'amount_cents', p_amount,
    'currency', 'usd', 'status', 'succeeded', 'order_type', 'entry',
    'entry_subtotal_cents', 6000, 'platform_fee_cents', 0, 'platform_fee_rate', 0,
    'stripe_processing_fee_cents', NULL, 'refunded_cents', 0, 'make_whole_refunded_cents', 0,
    'metadata', jsonb_build_object('entry_count', jsonb_array_length(p_entry_ids)),
    'show_id', '00000000-0000-0000-0000-000000964101', 'entry_ids', p_entry_ids,
    'paid_at', '2026-10-04T00:00:00Z')
$f$;

-- ---------------------------------------------------------------------------
-- R1. Shape and ACL
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.begin_cart_fulfillment(uuid, text, text, jsonb)',
    'public.fulfill_cart_line(text, uuid)',
    'public.record_cart_line_outcome(text, uuid, text, uuid, uuid, text)',
    'public.complete_cart_fulfillment(text, jsonb, integer, text, jsonb)'
  ] LOOP
    PERFORM pg_temp.expect_eq(
      (SELECT p.prosecdef || ' ' || array_to_string(p.proconfig, ',')
         FROM pg_proc p WHERE p.oid = v_fn::regprocedure),
      'true search_path=""', 'R1 ' || v_fn || ' is SECURITY DEFINER with an empty search_path');
    PERFORM pg_temp.expect_eq(
      has_function_privilege('anon', v_fn, 'EXECUTE') || ' '
        || has_function_privilege('authenticated', v_fn, 'EXECUTE') || ' '
        || has_function_privilege('service_role', v_fn, 'EXECUTE'),
      'false false true', 'R1 ' || v_fn || ' is service_role only');
  END LOOP;
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM unnest(ARRAY['public.cart_fulfillments', 'public.cart_fulfillment_lines']) t,
            unnest(ARRAY['anon', 'authenticated']) r,
            unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
      WHERE has_table_privilege(r, t, p)),
    '0', 'R1 no table privilege for anon or authenticated');
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures: exhibitor (people 964011, auth 964012), club, show 964101 and a
-- second show 964102, classes C1-C4 on 964101 and C9 on 964102, dogs
-- 964401-964405 plus filler dog 964409, and pending entry E4 (964504).
-- ---------------------------------------------------------------------------
INSERT INTO public.people (id, first_name, last_name, email)
VALUES (pg_temp.id('011'), 'MYK9-964', 'Exhibitor', 'myk9964-exh@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES (pg_temp.id('012'), '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'myk9964-exh@example.test', '', now(), now(), now(),
        '{}', '{}', false, false, false);

INSERT INTO public.exhibitor_profiles (person_id, auth_user_id)
SELECT pg_temp.id('011'), pg_temp.id('012')
WHERE NOT EXISTS (SELECT 1 FROM public.exhibitor_profiles WHERE auth_user_id = pg_temp.id('012'));

INSERT INTO public.clubs (id, name) VALUES (pg_temp.id('021'), 'MYK9-964 fixture club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date, pre_entry_fee,
                          default_judge_day_capacity)
VALUES
  (pg_temp.id('101'), 'MYK9-964 Show', 'AKC', current_date + 20, current_date + 21,
   pg_temp.id('021'), 'published', (current_date - 10)::timestamptz,
   (current_date + 10)::timestamptz, 30, 125),
  (pg_temp.id('102'), 'MYK9-964 Other Show', 'AKC', current_date + 20, current_date + 21,
   pg_temp.id('021'), 'published', (current_date - 10)::timestamptz,
   (current_date + 10)::timestamptz, 30, 125);

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type)
VALUES
  (pg_temp.id('201'), pg_temp.id('101'), 'MYK9-964 Trial', current_date + 20, 'AKC', 'Scent Work'),
  (pg_temp.id('202'), pg_temp.id('102'), 'MYK9-964 Other Trial', current_date + 20, 'AKC', 'Scent Work');

INSERT INTO public.classes (id, trial_id, name, element, level, status, status_source, entry_fee,
                            max_entries, allow_waitlist)
VALUES
  (pg_temp.id('301'), pg_temp.id('201'), 'MYK9-964 C1 room', 'Container', 'Novice', 'upcoming', 'manual', 30, NULL, false),
  (pg_temp.id('302'), pg_temp.id('201'), 'MYK9-964 C2 full', 'Interior', 'Novice', 'upcoming', 'manual', 30, 1, false),
  (pg_temp.id('303'), pg_temp.id('201'), 'MYK9-964 C3 full+wl', 'Exterior', 'Novice', 'upcoming', 'manual', 30, 1, true),
  (pg_temp.id('304'), pg_temp.id('201'), 'MYK9-964 C4 recovery', 'Buried', 'Novice', 'upcoming', 'manual', 30, NULL, false),
  (pg_temp.id('309'), pg_temp.id('202'), 'MYK9-964 C9 other show', 'Container', 'Novice', 'upcoming', 'manual', 30, NULL, false);

INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
SELECT pg_temp.id('4' || lpad(n::text, 2, '0')), 'MYK9-964 Dog ' || n, 'D' || n, 'Beagle',
       'active', pg_temp.id('011')
FROM unnest(ARRAY[1, 2, 3, 4, 5, 9]) AS n;
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
SELECT d.id, 'AKC', 'SR964' || right(d.id::text, 3), true
FROM public.dogs d
WHERE d.id IN (SELECT pg_temp.id('4' || lpad(n::text, 2, '0')) FROM unnest(ARRAY[1, 2, 3, 4, 5, 9]) AS n);

SET LOCAL ROLE service_role;
-- Fillers make C2 and C3 full; E4 awaits payment (the Finish Payment line).
INSERT INTO public.entries (id, class_id, trial_id, show_id, dog_id, payment_status, entry_status)
VALUES
  (pg_temp.id('502'), pg_temp.id('302'), pg_temp.id('201'), pg_temp.id('101'), pg_temp.id('409'), 'pending', 'submitted'),
  (pg_temp.id('503'), pg_temp.id('303'), pg_temp.id('201'), pg_temp.id('101'), pg_temp.id('409'), 'pending', 'submitted'),
  (pg_temp.id('504'), pg_temp.id('304'), pg_temp.id('201'), pg_temp.id('101'), pg_temp.id('404'), 'pending', 'pending-payment');

INSERT INTO public.entry_carts (id, exhibitor_id, show_id, status, expires_at)
SELECT pg_temp.id('601'), ep.id, pg_temp.id('101'), 'active', now() + interval '30 minutes'
FROM public.exhibitor_profiles ep WHERE ep.auth_user_id = pg_temp.id('012');

INSERT INTO public.entry_cart_items (id, cart_id, dog_id, class_id, entry_fee_cents, entry_id, created_at)
VALUES
  (pg_temp.id('701'), pg_temp.id('601'), pg_temp.id('401'), pg_temp.id('301'), 3000, NULL, now() - interval '5 minutes'),
  (pg_temp.id('702'), pg_temp.id('601'), pg_temp.id('402'), pg_temp.id('302'), 3000, NULL, now() - interval '4 minutes'),
  (pg_temp.id('703'), pg_temp.id('601'), pg_temp.id('403'), pg_temp.id('303'), 3000, NULL, now() - interval '3 minutes'),
  (pg_temp.id('704'), pg_temp.id('601'), pg_temp.id('404'), pg_temp.id('304'), 3000, pg_temp.id('504'), now() - interval '2 minutes'),
  (pg_temp.id('705'), pg_temp.id('601'), pg_temp.id('405'), pg_temp.id('309'), 3000, NULL, now() - interval '1 minute');

-- The session goes on AFTER the lines: every line insert severs it.
UPDATE public.entry_carts SET stripe_checkout_session_id = 'cs_test_964_a'
 WHERE id = pg_temp.id('601');
RESET ROLE;

CREATE FUNCTION pg_temp.amounts()
RETURNS jsonb LANGUAGE sql AS $f$
  SELECT jsonb_object_agg(i.id::text, 3000)
    FROM public.entry_cart_items i WHERE i.cart_id = pg_temp.id('601')
$f$;

-- ---------------------------------------------------------------------------
-- R2. begin_cart_fulfillment
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
DO $$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.begin_cart_fulfillment(pg_temp.id('601'), 'cs_test_964_other',
    'pi_test_964_other', pg_temp.amounts());
  PERFORM pg_temp.expect_eq(r.outcome || ' ' || r.cart_status, 'not_claimable active',
    'R2 a session the cart does not hold is not claimable');
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM public.cart_fulfillments f
      WHERE f.stripe_checkout_session_id = 'cs_test_964_other'),
    '0', 'R2 not_claimable writes no run');
END;
$$;

SELECT pg_temp.expect_sqlstate(
  format($q$SELECT public.begin_cart_fulfillment(%L, 'cs_test_964_a', 'pi_test_964_a', %L)$q$,
         pg_temp.id('601'), pg_temp.amounts() - pg_temp.id('705')::text),
  '22023', 'R2 amounts missing a line are refused');
SELECT pg_temp.expect_sqlstate(
  format($q$SELECT public.begin_cart_fulfillment(%L, 'cs_test_964_a', 'pi_test_964_a', %L)$q$,
         pg_temp.id('601'), pg_temp.amounts() || jsonb_build_object(gen_random_uuid()::text, 100)),
  '22023', 'R2 an amount for a line the cart does not hold is refused');
SELECT pg_temp.expect_sqlstate(
  format($q$SELECT public.begin_cart_fulfillment(%L, 'cs_test_964_a', 'pi_test_964_a', %L)$q$,
         pg_temp.id('601'), pg_temp.amounts() || jsonb_build_object(pg_temp.id('701')::text, 29.5)),
  '22023', 'R2 a fractional amount is refused');

DO $$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.begin_cart_fulfillment(pg_temp.id('601'), 'cs_test_964_a',
    'pi_test_964_a', pg_temp.amounts());
  PERFORM pg_temp.expect_eq(
    r.outcome || ' ' || r.cart_status || ' '
      || (SELECT c.status FROM public.entry_carts c WHERE c.id = pg_temp.id('601')),
    'begun fulfilling fulfilling', 'R2 delivery 1 begins: the cart is held at fulfilling');
  PERFORM pg_temp.expect_eq(
    (SELECT string_agg(right(l.cart_item_id::text, 3) || '/' || l.line_amount_cents
                         || '/' || COALESCE(right(l.existing_entry_id::text, 3), '-'),
                       ' ' ORDER BY l.line_no)
       FROM public.cart_fulfillment_lines l
      WHERE l.stripe_checkout_session_id = 'cs_test_964_a'),
    '701/3000/- 702/3000/- 703/3000/- 704/3000/504 705/3000/-',
    'R2 every cart line is snapshotted in cart order with its amount');
END;
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- R3. A fulfilling cart is the webhook's
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_sqlstate(
  format($q$UPDATE public.entry_carts SET status = 'abandoned' WHERE id = %L$q$, pg_temp.id('601')),
  '42501', 'R3 a non-service-role caller cannot move a fulfilling cart');

SET LOCAL ROLE service_role;
DO $$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.claim_abandoned_cart_refund(pg_temp.id('601'), 'cs_test_964_a',
    'pi_test_964_a', 9000, '{}'::jsonb);
  PERFORM pg_temp.expect_eq(r.outcome, 'not_refundable',
    'R3 the abandoned-cart refund claim cannot win a fulfilling cart');
END;
$$;

-- ---------------------------------------------------------------------------
-- R4 + R5. Delivery 1: works every line, then dies before the latch.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.fulfill_cart_line('cs_test_964_a', pg_temp.id('701'));
  PERFORM pg_temp.expect_eq(r.outcome || ' ' || r.replayed, 'created_entry false',
    'R5 delivery 1: the line with room creates its entry');
END;
$$;

-- R4: the latch refuses while lines are unworked.
SELECT pg_temp.expect_sqlstate(
  format($q$SELECT public.complete_cart_fulfillment('cs_test_964_a', %L)$q$,
    pg_temp.cart_order('pi_test_964_a',
      (SELECT jsonb_agg(l.entry_id) FROM public.cart_fulfillment_lines l
        WHERE l.stripe_checkout_session_id = 'cs_test_964_a' AND l.entry_id IS NOT NULL), 15000)),
  '55000', 'R4 latch last: refused while a line has no recorded outcome');
DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT c.status FROM public.entry_carts c WHERE c.id = pg_temp.id('601'))
      || ' ' || (SELECT count(*) FROM public.stripe_orders o
                  WHERE o.stripe_checkout_session_id = 'cs_test_964_a')
      || ' ' || (SELECT (f.completed_at IS NULL)::text FROM public.cart_fulfillments f
                  WHERE f.stripe_checkout_session_id = 'cs_test_964_a'),
    'fulfilling 0 true', 'R4 the refused latch wrote nothing');
END;
$$;

SELECT pg_temp.expect_sqlstate(
  format($q$SELECT public.fulfill_cart_line('cs_test_964_a', %L)$q$, pg_temp.id('704')),
  '22023', 'R9 a Finish Payment line is never created by fulfill_cart_line');
SELECT pg_temp.expect_sqlstate(
  format($q$SELECT public.record_cart_line_outcome('cs_test_964_a', %L, 'paid_existing', %L, %L)$q$,
         pg_temp.id('704'), pg_temp.id('504'), pg_temp.id('504')),
  '22023', 'R9 paid_existing is refused for an entry this intent has not paid');

DO $$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.fulfill_cart_line('cs_test_964_a', pg_temp.id('702'));
  PERFORM pg_temp.expect_eq(r.outcome, 'denied', 'R5 delivery 1: the full class denies its line');
  SELECT * INTO r FROM public.fulfill_cart_line('cs_test_964_a', pg_temp.id('703'));
  PERFORM pg_temp.expect_eq(r.outcome || ' ' || (r.waitlist_entry_id IS NOT NULL),
    'waitlisted true', 'R5 delivery 1: the full class with a wait list wait-lists its line');
  BEGIN
    SELECT * INTO r FROM public.fulfill_cart_line('cs_test_964_a', pg_temp.id('705'));
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL R5 a deterministic create error escaped instead of being recorded: % (%)',
      SQLSTATE, SQLERRM;
  END;
  PERFORM pg_temp.expect_eq(r.outcome || ' ' || (r.error_message LIKE '23514:%'),
    'failed true', 'R5 delivery 1: a deterministic error is recorded as failed with its code');

  -- The webhook pays the Finish Payment entry in place, then records it.
  UPDATE public.entries
     SET payment_status = 'paid', payment_method = 'online',
         stripe_payment_intent_id = 'pi_test_964_a', entry_status = 'confirmed'
   WHERE id = pg_temp.id('504');
  SELECT * INTO r FROM public.record_cart_line_outcome('cs_test_964_a', pg_temp.id('704'),
    'paid_existing', pg_temp.id('504'), pg_temp.id('504'));
  PERFORM pg_temp.expect_eq(r.outcome || ' ' || r.replayed, 'paid_existing false',
    'R5 delivery 1: the Finish Payment line records paid_existing');
END;
$$;
RESET ROLE;

CREATE TEMP TABLE delivery1 ON COMMIT DROP AS
SELECT pg_temp.outcomes('cs_test_964_a') AS outcomes,
       pg_temp.unserved_cents('cs_test_964_a') AS unserved,
       (SELECT count(*) FROM public.waitlist_entries w
         WHERE w.class_id = pg_temp.id('303') AND w.dog_id = pg_temp.id('403')) AS waitlist_rows;

DO $$
BEGIN
  PERFORM pg_temp.expect_eq((SELECT unserved FROM delivery1), '9000',
    'R5 delivery 1: 9000 cents of lines went unserved (denied, waitlisted, failed)');
END;
$$;

-- ---------------------------------------------------------------------------
-- R6. Capacity frees up between deliveries; delivery 2 replays.
-- ---------------------------------------------------------------------------
UPDATE public.classes SET max_entries = 50 WHERE id IN (pg_temp.id('302'), pg_temp.id('303'));

SET LOCAL ROLE service_role;
DO $$
DECLARE
  r record;
  v_item uuid;
BEGIN
  SELECT * INTO r FROM public.begin_cart_fulfillment(pg_temp.id('601'), 'cs_test_964_a',
    'pi_test_964_a', '{}'::jsonb);
  PERFORM pg_temp.expect_eq(r.outcome || ' ' || r.cart_status, 'resumed fulfilling',
    'R6 delivery 2 resumes the run (the amounts it passes are not read again)');

  FOREACH v_item IN ARRAY ARRAY[pg_temp.id('701'), pg_temp.id('702'), pg_temp.id('703'), pg_temp.id('705')] LOOP
    BEGIN
      SELECT * INTO r FROM public.fulfill_cart_line('cs_test_964_a', v_item);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'FAIL R6 delivery 2 replay of line % raised % (%)',
        right(v_item::text, 3), SQLSTATE, SQLERRM;
    END;
    PERFORM pg_temp.expect_eq(r.replayed::text, 'true',
      'R6 delivery 2 replays line ' || right(v_item::text, 3) || ' (' || r.outcome || ')');
  END LOOP;
  SELECT * INTO r FROM public.record_cart_line_outcome('cs_test_964_a', pg_temp.id('704'),
    'failed', NULL, NULL, 'a different answer on the replay');
  PERFORM pg_temp.expect_eq(r.outcome || ' ' || r.replayed, 'paid_existing true',
    'R6 delivery 2 cannot overwrite the recorded Finish Payment outcome');
END;
$$;
RESET ROLE;

DO $$
BEGIN
  PERFORM pg_temp.expect_eq(pg_temp.outcomes('cs_test_964_a'), (SELECT outcomes FROM delivery1),
    'R6 identical outcomes and entry ids after capacity changed');
  PERFORM pg_temp.expect_eq(pg_temp.unserved_cents('cs_test_964_a'), (SELECT unserved FROM delivery1),
    'R6 identical unserved amount after capacity changed');
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM public.entries e
      WHERE e.stripe_payment_intent_id = 'pi_test_964_a' AND e.deleted_at IS NULL),
    '2', 'R6 exactly two paid entries (I1 created once, E4 paid in place)');
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM public.entries e
      WHERE e.dog_id = pg_temp.id('402') AND e.class_id = pg_temp.id('302')),
    '0', 'R6 the denied line got no entry although its class now has room');
  PERFORM pg_temp.expect_eq(
    (SELECT count(*) FROM public.waitlist_entries w
      WHERE w.class_id = pg_temp.id('303') AND w.dog_id = pg_temp.id('403'))::text,
    (SELECT waitlist_rows::text FROM delivery1),
    'R6 no second wait-list row for the wait-listed line');
END;
$$;

-- R6 positive control: C2 really has room now, so only the recorded outcome
-- kept the denied line denied.
SET LOCAL ROLE service_role;
DO $$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.create_online_paid_entry(
    pg_temp.id('405'), pg_temp.id('302'), NULL, 30, NULL, NULL, 'pi_test_964_control', now(),
    pg_temp.id('101'), pg_temp.id('201'),
    (SELECT ep.id FROM public.exhibitor_profiles ep WHERE ep.auth_user_id = pg_temp.id('012')),
    false);
  PERFORM pg_temp.expect_eq(r.outcome, 'created_entry',
    'R6 control: a fresh line in the denied line''s class is now accepted');
END;
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- R9. Guards on the latch call
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
SELECT pg_temp.expect_sqlstate(
  format($q$SELECT public.complete_cart_fulfillment('cs_test_964_a', %L)$q$,
    pg_temp.cart_order('pi_test_964_a', jsonb_build_array(pg_temp.id('504')), 15000)),
  '22023', 'R9 an order missing a recorded paid line is refused');
SELECT pg_temp.expect_sqlstate(
  format($q$SELECT public.complete_cart_fulfillment('cs_test_964_a', %L, 20000, 'partial_no_service_lines')$q$,
    pg_temp.cart_order('pi_test_964_a',
      (SELECT jsonb_agg(l.entry_id) FROM public.cart_fulfillment_lines l
        WHERE l.stripe_checkout_session_id = 'cs_test_964_a' AND l.entry_id IS NOT NULL), 15000)),
  '22023', 'R9 a refund above the charge is refused');
SELECT pg_temp.expect_sqlstate(
  format($q$SELECT public.complete_cart_fulfillment('cs_test_964_a', %L)$q$,
    pg_temp.cart_order('pi_test_964_other',
      (SELECT jsonb_agg(l.entry_id) FROM public.cart_fulfillment_lines l
        WHERE l.stripe_checkout_session_id = 'cs_test_964_a' AND l.entry_id IS NOT NULL), 15000)),
  '22023', 'R9 an order for another payment intent is refused');
SELECT pg_temp.expect_sqlstate(
  format($q$UPDATE public.cart_fulfillment_lines SET outcome = 'created_entry'
             WHERE stripe_checkout_session_id = 'cs_test_964_a' AND cart_item_id = %L$q$,
         pg_temp.id('702')),
  '42501', 'R9 a recorded outcome never changes');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- R7. The latch closes, with the order and the request, in one call.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
CREATE TEMP TABLE latch1 ON COMMIT DROP AS
SELECT * FROM public.complete_cart_fulfillment('cs_test_964_a',
  pg_temp.cart_order('pi_test_964_a',
    (SELECT jsonb_agg(l.entry_id) FROM public.cart_fulfillment_lines l
      WHERE l.stripe_checkout_session_id = 'cs_test_964_a' AND l.entry_id IS NOT NULL), 15000),
  8100, 'partial_no_service_lines',
  jsonb_build_object('denied_cart_item_ids', jsonb_build_array(pg_temp.id('702'))));
RESET ROLE;

DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT latch_closed || ' ' || cart_status || ' ' || order_created || ' ' || created
              || ' ' || request_status || ' ' || amount_cents || ' ' || reason FROM latch1),
    'true submitted true true pending 8100 partial_no_service_lines',
    'R7 one call closed the latch, recorded the order and queued the request');
  PERFORM pg_temp.expect_eq(
    (SELECT c.status FROM public.entry_carts c WHERE c.id = pg_temp.id('601'))
      || ' ' || (SELECT (f.completed_at IS NOT NULL)::text FROM public.cart_fulfillments f
                  WHERE f.stripe_checkout_session_id = 'cs_test_964_a')
      || ' ' || (SELECT count(*) FROM public.stripe_orders o
                  WHERE o.stripe_checkout_session_id = 'cs_test_964_a')
      || ' ' || (SELECT string_agg(r.kind || '/' || r.amount_cents || '/' || r.stripe_payment_intent_id
                                     || '/' || (r.cart_id = pg_temp.id('601'))
                                     || '/' || (r.show_id = pg_temp.id('101')), ',')
                   FROM public.refund_requests r
                  WHERE r.stripe_checkout_session_id = 'cs_test_964_a'),
    'submitted true 1 cart_overflow/8100/pi_test_964_a/true/true',
    'R7 cart submitted, run complete, one order, one cart_overflow request on the intent');
END;
$$;

-- ---------------------------------------------------------------------------
-- R8. After the latch: delivery 3 and a retried latch call.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
DO $$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.begin_cart_fulfillment(pg_temp.id('601'), 'cs_test_964_a',
    'pi_test_964_a', pg_temp.amounts());
  PERFORM pg_temp.expect_eq(r.outcome || ' ' || r.cart_status, 'completed submitted',
    'R8 a delivery after the latch finds the run complete');

  BEGIN
    SELECT * INTO r FROM public.complete_cart_fulfillment('cs_test_964_a',
      pg_temp.cart_order('pi_test_964_a',
        (SELECT jsonb_agg(l.entry_id) FROM public.cart_fulfillment_lines l
          WHERE l.stripe_checkout_session_id = 'cs_test_964_a' AND l.entry_id IS NOT NULL), 15000),
      8100, 'partial_no_service_lines', '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL R8 the retried latch call raised % (%)', SQLSTATE, SQLERRM;
  END;
  PERFORM pg_temp.expect_eq(
    r.latch_closed || ' ' || r.order_created || ' ' || r.created || ' '
      || (r.refund_request_id = (SELECT refund_request_id FROM latch1)),
    'false false false true', 'R8 a retried latch call creates nothing and returns the same request');
END;
$$;
RESET ROLE;

DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT count(*) FROM public.stripe_orders o WHERE o.stripe_checkout_session_id = 'cs_test_964_a')
      || ' ' || (SELECT count(*) FROM public.refund_requests r
                  WHERE r.stripe_checkout_session_id = 'cs_test_964_a')
      || ' ' || (SELECT count(*) FROM public.entries e
                  WHERE e.stripe_payment_intent_id = 'pi_test_964_a'),
    '1 1 2', 'R8 still one order, one request, two paid entries');
END;
$$;

-- ---------------------------------------------------------------------------
-- R9. A refund needs an unserved line (a second, fully served cart).
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
INSERT INTO public.entry_carts (id, exhibitor_id, show_id, status, expires_at)
SELECT pg_temp.id('602'), ep.id, pg_temp.id('101'), 'active', now() + interval '30 minutes'
FROM public.exhibitor_profiles ep WHERE ep.auth_user_id = pg_temp.id('012');
INSERT INTO public.entry_cart_items (id, cart_id, dog_id, class_id, entry_fee_cents)
VALUES (pg_temp.id('711'), pg_temp.id('602'), pg_temp.id('402'), pg_temp.id('301'), 3000);
UPDATE public.entry_carts SET stripe_checkout_session_id = 'cs_test_964_b' WHERE id = pg_temp.id('602');

DO $$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.begin_cart_fulfillment(pg_temp.id('602'), 'cs_test_964_b',
    'pi_test_964_b', jsonb_build_object(pg_temp.id('711')::text, 3000));
  SELECT * INTO r FROM public.fulfill_cart_line('cs_test_964_b', pg_temp.id('711'));
  PERFORM pg_temp.expect_eq(r.outcome, 'created_entry', 'R9 fixture: the second cart''s line is served');
END;
$$;

SELECT pg_temp.expect_sqlstate(
  format($q$SELECT public.complete_cart_fulfillment('cs_test_964_b', %L, 100, 'partial_no_service_lines')$q$,
    pg_temp.cart_order('pi_test_964_b',
      (SELECT jsonb_agg(l.entry_id) FROM public.cart_fulfillment_lines l
        WHERE l.stripe_checkout_session_id = 'cs_test_964_b' AND l.entry_id IS NOT NULL), 3000)),
  '22023', 'R9 a refund for a fully served cart is refused');

DO $$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.complete_cart_fulfillment('cs_test_964_b',
    pg_temp.cart_order('pi_test_964_b',
      (SELECT jsonb_agg(l.entry_id) FROM public.cart_fulfillment_lines l
        WHERE l.stripe_checkout_session_id = 'cs_test_964_b' AND l.entry_id IS NOT NULL), 3000));
  PERFORM pg_temp.expect_eq(
    r.latch_closed || ' ' || r.cart_status || ' ' || r.order_created || ' '
      || (r.refund_request_id IS NULL),
    'true submitted true true', 'R9 a fully served cart latches with its order and no request');
END;
$$;
RESET ROLE;

ROLLBACK;
