-- MYK9-968 (migration 20261004174300): a paid payment link resolves its
-- waitlist offers in the SAME transaction as its latch, order and refund
-- request (queue_payment_link_refund, p_paid_entry_ids).
--
-- Before the fix the webhook resolved the offers in a separate write after
-- the RPC returned. If the RPC committed but its response was lost, the
-- webhook threw before that write, and the redelivery took the replay-first
-- branch (an order or refund request exists), so the offer stayed open.
--
-- Properties asserted here:
--   W1  ONE call closes the link, records the order, queues the refund
--       request AND moves the paid entries' offers offered/expired ->
--       'accepted'. Its result is then discarded (the "lost response").
--   W2  The redelivery's read (p_session_id only) finds the request; the
--       offers are already resolved, with nothing left to replay.
--   W3  A repeat of the full call (a retry, or a duplicate delivery) is a
--       no-op: no second request, no second order, the link does not close
--       again, and the resolved offers are unchanged (status, updated_at,
--       version).
--   W4  Only open offers of PAID entries change: a declined offer of a paid
--       entry stays declined, and the offer of an entry the call did not
--       pay (an invalid entry being refunded) stays offered.
--   W5  Atomic: when the refund request cannot be written, the offers do
--       not resolve either (nor does the latch close).
--   W6  No paid entries (NULL or empty) touches no offer.
--   W7  The function stays SECURITY DEFINER with search_path '' and is
--       executable by service_role only.
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

-- One offer's status, by its fixture id suffix.
CREATE FUNCTION pg_temp.offer_status(p_id text)
RETURNS text LANGUAGE sql AS $f$
  SELECT w.status FROM public.waitlist_entries w
   WHERE w.id = ('00000000-0000-0000-0000-000000968' || p_id)::uuid
$f$;

-- ---------------------------------------------------------------------------
-- W7. Shape and ACL
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fn constant text :=
    'public.queue_payment_link_refund(text, uuid, text, text, integer, text, jsonb, uuid, jsonb, uuid[])';
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT p.prosecdef || ' ' || array_to_string(p.proconfig, ',')
       FROM pg_proc p WHERE p.oid = v_fn::regprocedure),
    'true search_path=""', 'W7 SECURITY DEFINER with an empty search_path');
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM pg_proc p
      WHERE p.proname = 'queue_payment_link_refund'
        AND p.pronamespace = 'public'::regnamespace),
    '1', 'W7 one signature only (the old one was dropped, no overload)');
  PERFORM pg_temp.expect_eq(
    has_function_privilege('anon', v_fn, 'EXECUTE') || ' '
      || has_function_privilege('authenticated', v_fn, 'EXECUTE') || ' '
      || has_function_privilege('service_role', v_fn, 'EXECUTE'),
    'false false true', 'W7 service_role only');
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures: exhibitor 968101 (people 968011), one draft show, one class,
-- five dogs, five pending entries promoted from five waitlist offers, and
-- three open payment links.
-- ---------------------------------------------------------------------------
INSERT INTO public.people (id, first_name, last_name, email)
VALUES ('00000000-0000-0000-0000-000000968011', 'MYK9-968', 'Exhibitor',
        'myk9968-exh@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES ('00000000-0000-0000-0000-000000968101', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'myk9968-exh@example.test', '', now(), now(), now(),
        '{}', '{}', false, false, false);

INSERT INTO public.exhibitor_profiles (person_id, auth_user_id)
SELECT '00000000-0000-0000-0000-000000968011', '00000000-0000-0000-0000-000000968101'
WHERE NOT EXISTS (SELECT 1 FROM public.exhibitor_profiles
                  WHERE auth_user_id = '00000000-0000-0000-0000-000000968101');

-- The show belongs to its own fixture club (MYK9-1008 makes shows.club_id
-- NOT NULL).
INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000968022', 'MYK9-968 fixture club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, status, club_id)
VALUES ('00000000-0000-0000-0000-000000968021', 'MYK9-968 Show', 'AKC',
        current_date + 30, current_date + 30, 'draft', '00000000-0000-0000-0000-000000968022');

INSERT INTO public.trials (id, show_id, name, date)
VALUES ('00000000-0000-0000-0000-000000968031', '00000000-0000-0000-0000-000000968021',
        'MYK9-968 Trial', current_date + 30);

INSERT INTO public.classes (id, trial_id, name, status, status_source)
VALUES ('00000000-0000-0000-0000-000000968041', '00000000-0000-0000-0000-000000968031',
        'MYK9-968 Class', 'upcoming', 'derived');

INSERT INTO public.dogs (id, call_name, breed, owner_id)
SELECT ('00000000-0000-0000-0000-00000096805' || n)::uuid, 'Dog ' || n, 'Border Collie',
       '00000000-0000-0000-0000-000000968011'
FROM generate_series(1, 5) AS n;

INSERT INTO public.dog_registrations (dog_id, organization, registration_number, registered_name)
SELECT ('00000000-0000-0000-0000-00000096805' || n)::uuid, 'AKC', 'SW968' || n, 'Dog ' || n || ' Formally'
FROM generate_series(1, 5) AS n;

SET LOCAL ROLE service_role;
INSERT INTO public.entries (id, class_id, trial_id, show_id, dog_id, payment_status, entry_status)
SELECT ('00000000-0000-0000-0000-00000096806' || n)::uuid,
       '00000000-0000-0000-0000-000000968041', '00000000-0000-0000-0000-000000968031',
       '00000000-0000-0000-0000-000000968021',
       ('00000000-0000-0000-0000-00000096805' || n)::uuid, 'pending', 'pending-payment'
FROM generate_series(1, 5) AS n;

-- Offers 071-075 promote into entries 061-065 (072 and 073 change state
-- after the links are created, below):
--   071 offered   (paid on link A)          072 expired (paid on link A)
--   073 declined  (paid on link A)          074 offered (NOT paid: link A's invalid entry)
--   075 offered   (paid on link B, whose refund write fails: W5)
INSERT INTO public.waitlist_entries (
  id, class_id, exhibitor_id, dog_id, position, status, offered_at, offer_expires_at,
  promoted_entry_id
)
SELECT ('00000000-0000-0000-0000-00000096807' || v.n)::uuid,
       '00000000-0000-0000-0000-000000968041', ep.id,
       ('00000000-0000-0000-0000-00000096805' || v.n)::uuid, v.n, v.status,
       now() - interval '1 day', now() + interval '1 day',
       ('00000000-0000-0000-0000-00000096806' || v.n)::uuid
FROM public.exhibitor_profiles ep
CROSS JOIN (VALUES (1, 'offered'), (2, 'offered'), (3, 'offered'), (4, 'offered'), (5, 'offered'))
  AS v(n, status)
WHERE ep.auth_user_id = '00000000-0000-0000-0000-000000968101';

INSERT INTO public.entry_payment_links (id, show_id, entry_ids, stripe_checkout_session_id, status, amount_cents)
VALUES
  ('00000000-0000-0000-0000-000000968081', '00000000-0000-0000-0000-000000968021',
   ARRAY['00000000-0000-0000-0000-000000968061', '00000000-0000-0000-0000-000000968062',
         '00000000-0000-0000-0000-000000968063', '00000000-0000-0000-0000-000000968064']::uuid[],
   'cs_968_link_a', 'open', 4000),
  ('00000000-0000-0000-0000-000000968082', '00000000-0000-0000-0000-000000968021',
   ARRAY['00000000-0000-0000-0000-000000968065']::uuid[], 'cs_968_link_b', 'open', 1000),
  ('00000000-0000-0000-0000-000000968083', '00000000-0000-0000-0000-000000968021',
   '{}', 'cs_968_link_c', 'open', 1000);
RESET ROLE;

-- A link is created only for an ACTIVE offer
-- (trg_entry_payment_links_require_active_waitlist_offer), so 072 lapses and
-- 073 is declined after their link was sent, as they would in life.
UPDATE public.waitlist_entries
   SET status = 'expired'
 WHERE id = '00000000-0000-0000-0000-000000968072';
UPDATE public.waitlist_entries
   SET status = 'declined'
 WHERE id = '00000000-0000-0000-0000-000000968073';

DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT string_agg(w.status, ',' ORDER BY w.id) FROM public.waitlist_entries w
      WHERE w.class_id = '00000000-0000-0000-0000-000000968041'),
    'offered,expired,declined,offered,offered',
    'FIXTURE five offers seeded in their starting states');
END;
$$;

-- The order the webhook passes, as jsonb (paymentLinkOrder.ts).
CREATE FUNCTION pg_temp.link_order(p_intent text, p_entry_ids jsonb)
RETURNS jsonb LANGUAGE sql AS $f$
  SELECT jsonb_build_object(
    'customer_id', NULL, 'stripe_payment_intent_id', p_intent, 'amount_cents', 4000,
    'currency', 'usd', 'status', 'succeeded', 'order_type', 'entry',
    'entry_subtotal_cents', 3000, 'platform_fee_cents', 0, 'platform_fee_rate', 0,
    'stripe_processing_fee_cents', NULL, 'refunded_cents', 0, 'make_whole_refunded_cents', 0,
    'metadata', jsonb_build_object('entry_count', jsonb_array_length(p_entry_ids)),
    'show_id', '00000000-0000-0000-0000-000000968021', 'entry_ids', p_entry_ids,
    'paid_at', '2026-10-04T00:00:00Z')
$f$;

-- ---------------------------------------------------------------------------
-- W1-W4. Committed settlement, lost response, redelivery, repeat.
-- Link A paid entries 061-063; entry 064 is invalid and owed 1000 cents.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
SELECT * FROM public.queue_payment_link_refund(
  'cs_968_link_a', '00000000-0000-0000-0000-000000968081', 'open', 'pi_968_link_a', 1000,
  'partial_invalid_entries',
  '{"invalid_entry_ids": ["00000000-0000-0000-0000-000000968064"]}',
  '00000000-0000-0000-0000-000000968021',
  pg_temp.link_order('pi_968_link_a',
    '["00000000-0000-0000-0000-000000968061","00000000-0000-0000-0000-000000968062","00000000-0000-0000-0000-000000968063"]'),
  ARRAY['00000000-0000-0000-0000-000000968061', '00000000-0000-0000-0000-000000968062',
        '00000000-0000-0000-0000-000000968063']::uuid[]
) \g /dev/null
RESET ROLE;

CREATE TEMP TABLE offers_after_first ON COMMIT DROP AS
SELECT w.id, w.status, w.updated_at, w.version FROM public.waitlist_entries w
 WHERE w.class_id = '00000000-0000-0000-0000-000000968041';

DO $$
DECLARE
  v_read record;
BEGIN
  -- W1: everything the one call wrote, read back without its response.
  PERFORM pg_temp.expect_eq(
    (SELECT l.status FROM public.entry_payment_links l
      WHERE l.id = '00000000-0000-0000-0000-000000968081')
      || ' ' || (SELECT count(*) FROM public.stripe_orders o
                  WHERE o.stripe_checkout_session_id = 'cs_968_link_a')
      || ' ' || (SELECT count(*) FROM public.refund_requests r
                  WHERE r.stripe_checkout_session_id = 'cs_968_link_a'),
    'paid 1 1', 'W1 one call latched the link, recorded the order and queued the refund');
  PERFORM pg_temp.expect_eq(pg_temp.offer_status('071'), 'accepted',
    'W1 the same call resolved the paid entry''s offered offer');
  PERFORM pg_temp.expect_eq(pg_temp.offer_status('072'), 'accepted',
    'W1 the same call resolved the paid entry''s expired offer');

  -- W2: the redelivery only reads (paidSessionEntry.ts replay-first branch).
  SET LOCAL ROLE service_role;
  SELECT * INTO v_read FROM public.queue_payment_link_refund('cs_968_link_a');
  RESET ROLE;
  PERFORM pg_temp.expect_eq(
    v_read.link_closed || ' ' || v_read.created || ' '
      || v_read.request_status || ' ' || v_read.amount_cents,
    'false false pending 1000', 'W2 the redelivery read finds the queued request');
  PERFORM pg_temp.expect_eq(
    pg_temp.offer_status('071') || ',' || pg_temp.offer_status('072'), 'accepted,accepted',
    'W2 after the redelivery the offers are resolved, nothing to replay');

  -- W4: only open offers of paid entries changed.
  PERFORM pg_temp.expect_eq(pg_temp.offer_status('073'), 'declined',
    'W4 a declined offer of a paid entry stays declined');
  PERFORM pg_temp.expect_eq(pg_temp.offer_status('074'), 'offered',
    'W4 the offer of an unpaid (refunded) entry stays offered');
  PERFORM pg_temp.expect_eq(pg_temp.offer_status('075'), 'offered',
    'W4 another link''s offer is untouched');
END;
$$;

-- W3: the full call again (a retry after the lost response, or a duplicate).
DO $$
DECLARE
  v_again record;
BEGIN
  SET LOCAL ROLE service_role;
  SELECT * INTO v_again FROM public.queue_payment_link_refund(
    'cs_968_link_a', '00000000-0000-0000-0000-000000968081', 'open', 'pi_968_link_a', 1000,
    'partial_invalid_entries', '{}', '00000000-0000-0000-0000-000000968021',
    pg_temp.link_order('pi_968_link_a', '[]'),
    ARRAY['00000000-0000-0000-0000-000000968061', '00000000-0000-0000-0000-000000968062',
          '00000000-0000-0000-0000-000000968063']::uuid[]);
  RESET ROLE;
  PERFORM pg_temp.expect_eq(
    v_again.link_closed || ' ' || v_again.order_created || ' ' || v_again.created,
    'false false false', 'W3 a repeat closes nothing and creates no order or request');
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM public.refund_requests r
      WHERE r.stripe_checkout_session_id = 'cs_968_link_a'),
    '1', 'W3 still one refund request');
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM public.stripe_orders o
      WHERE o.stripe_checkout_session_id = 'cs_968_link_a'),
    '1', 'W3 still one order');
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM public.waitlist_entries w
       JOIN offers_after_first f ON f.id = w.id
      WHERE (w.status, w.updated_at, w.version) IS DISTINCT FROM (f.status, f.updated_at, f.version)),
    '0', 'W3 the repeat left every offer unchanged (status, updated_at, version)');
END;
$$;

-- ---------------------------------------------------------------------------
-- W5. Atomic: a refund that cannot be written (no reason, 23502) rolls back
-- the offer resolution with the latch.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
SELECT pg_temp.expect_sqlstate(
  $q$SELECT public.queue_payment_link_refund(
       'cs_968_link_b', '00000000-0000-0000-0000-000000968082', 'open', 'pi_968_link_b', 1000,
       NULL, '{}', '00000000-0000-0000-0000-000000968021', NULL,
       ARRAY['00000000-0000-0000-0000-000000968065']::uuid[])$q$,
  '23502', 'W5 a request that cannot be written fails the whole call');
RESET ROLE;
DO $$
BEGIN
  PERFORM pg_temp.expect_eq(pg_temp.offer_status('075'), 'offered',
    'W5 the offer did not resolve without its request');
  PERFORM pg_temp.expect_eq(
    (SELECT l.status FROM public.entry_payment_links l
      WHERE l.id = '00000000-0000-0000-0000-000000968082'),
    'open', 'W5 nor did the latch close');
END;
$$;

-- ---------------------------------------------------------------------------
-- W6. No paid entries: NULL and empty touch no offer.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  SET LOCAL ROLE service_role;
  PERFORM public.queue_payment_link_refund(
    'cs_968_link_c', '00000000-0000-0000-0000-000000968083', 'open');
  PERFORM public.queue_payment_link_refund(
    'cs_968_link_c', NULL, NULL, NULL, NULL, NULL, '{}', NULL, NULL, '{}'::uuid[]);
  RESET ROLE;
  PERFORM pg_temp.expect_eq(
    pg_temp.offer_status('074') || ',' || pg_temp.offer_status('075'), 'offered,offered',
    'W6 a call without paid entries resolves no offer');
END;
$$;

ROLLBACK;
