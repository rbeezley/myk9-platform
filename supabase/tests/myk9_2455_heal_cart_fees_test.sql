-- MYK9-2455 (migration 20261128031900): stripe-checkout heals a cart's drifted
-- line fees, its totals and its page link in ONE transaction, only under the
-- live checkout lease and only for the cart and page it read.
--
-- One exhibitor, one show:
--   cart 601 (active, page cs_test_2455_a): I1 stored 2000, authoritative 3000
--                                           I2 stored 2500, authoritative 2500
--   cart 611 (abandoned):                   I9 stored 1000 (another cart's line)
--
-- Properties asserted here:
--   F1  Shape and ACL: heal_cart_fees is SECURITY DEFINER with search_path ''
--       and executable by service_role only.
--   F2  A LEASE THAT EXPIRED MID-HEAL: the call is refused 'lease_lost' and
--       writes nothing; once a retry has claimed the cart, the first request's
--       lease is still refused and the retry's page stays linked.
--   F3  A MOVED CART: an updated_at that is not the one read is refused
--       'cart_changed'; lines that no longer add up to the subtotal being
--       written are refused the same way. Nothing written.
--   F4  A MOVED PAGE: a cart that links a different page than the one read
--       is refused 'session_moved'. Nothing written, the new link kept.
--   F5  ALL OR NOTHING: a line that is not in the cart raises after an
--       earlier line was written, and every line rolls back (the other cart's
--       line included). Malformed totals and a zero fee are refused.
--   F6  The heal: every line, the totals and the cleared page link, in one
--       call, and the lease is still this request's.
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

-- A fixture id: 00000000-0000-0000-0000-000002455<suffix>.
CREATE FUNCTION pg_temp.id(p_suffix text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $f$
  SELECT ('00000000-0000-0000-0000-000002455' || p_suffix)::uuid
$f$;

-- A cart's lines, totals and page: "701:2000 702:2500 | 4500/315/4815 | cs_x".
CREATE FUNCTION pg_temp.cart_state(p_cart uuid)
RETURNS text LANGUAGE sql AS $f$
  SELECT (SELECT string_agg(right(i.id::text, 3) || ':' || i.entry_fee_cents, ' '
                            ORDER BY right(i.id::text, 3))
            FROM public.entry_cart_items i WHERE i.cart_id = p_cart)
         || ' | ' || c.subtotal_cents || '/' || c.platform_fee_cents || '/' || c.total_cents
         || ' | ' || COALESCE(c.stripe_checkout_session_id, '-')
    FROM public.entry_carts c WHERE c.id = p_cart
$f$;

CREATE FUNCTION pg_temp.cart_stamp(p_cart uuid)
RETURNS timestamptz LANGUAGE sql AS $f$
  SELECT c.updated_at FROM public.entry_carts c WHERE c.id = p_cart
$f$;

CREATE FUNCTION pg_temp.claim(p_cart uuid, p_lease uuid)
RETURNS text LANGUAGE sql AS $f$
  SELECT c.outcome FROM public.claim_cart_checkout(p_cart, p_lease) c
$f$;

-- One healed line, as stripe-checkout's healCartFees sends it.
CREATE FUNCTION pg_temp.line(p_suffix text, p_cents integer)
RETURNS jsonb LANGUAGE sql AS $f$
  SELECT jsonb_build_object('item_id', pg_temp.id(p_suffix), 'entry_fee_cents', p_cents)
$f$;

-- heal_cart_fees on cart 601 with a 385 platform fee.
CREATE FUNCTION pg_temp.heal(p_lease uuid, p_stamp timestamptz, p_session text, p_lines jsonb,
                             p_subtotal integer)
RETURNS text LANGUAGE sql AS $f$
  SELECT public.heal_cart_fees(pg_temp.id('601'), p_lease, p_stamp, p_session, p_lines,
                               p_subtotal, 385, p_subtotal + 385)
$f$;

-- ---------------------------------------------------------------------------
-- F1. Shape and ACL
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fn text := 'public.heal_cart_fees(uuid, uuid, timestamptz, text, jsonb, integer, integer, integer)';
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT p.prosecdef || ' ' || array_to_string(p.proconfig, ',')
       FROM pg_proc p WHERE p.oid = v_fn::regprocedure),
    'true search_path=""', 'F1 heal_cart_fees is SECURITY DEFINER with an empty search_path');
  PERFORM pg_temp.expect_eq(
    has_function_privilege('anon', v_fn, 'EXECUTE') || ' '
      || has_function_privilege('authenticated', v_fn, 'EXECUTE') || ' '
      || has_function_privilege('service_role', v_fn, 'EXECUTE'),
    'false false true', 'F1 heal_cart_fees is service_role only');
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures: exhibitor (people 2455011, auth 2455012), club, show 2455101,
-- classes C1-C3, dogs 2455401-2455403.
-- ---------------------------------------------------------------------------
INSERT INTO public.people (id, first_name, last_name, email)
VALUES (pg_temp.id('011'), 'MYK9-2455', 'Exhibitor', 'myk92455-exh@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES (pg_temp.id('012'), '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'myk92455-exh@example.test', '', now(), now(), now(),
        '{}', '{}', false, false, false);

INSERT INTO public.exhibitor_profiles (person_id, auth_user_id)
SELECT pg_temp.id('011'), pg_temp.id('012')
WHERE NOT EXISTS (SELECT 1 FROM public.exhibitor_profiles WHERE auth_user_id = pg_temp.id('012'));

INSERT INTO public.clubs (id, name) VALUES (pg_temp.id('021'), 'MYK9-2455 fixture club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date, pre_entry_fee,
                          default_judge_day_capacity)
VALUES (pg_temp.id('101'), 'MYK9-2455 Show', 'AKC', current_date + 20, current_date + 21,
        pg_temp.id('021'), 'published', (current_date - 10)::timestamptz,
        (current_date + 10)::timestamptz, 30, 125);

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type)
VALUES (pg_temp.id('201'), pg_temp.id('101'), 'MYK9-2455 Trial', current_date + 20, 'AKC', 'Scent Work');

INSERT INTO public.classes (id, trial_id, name, element, level, status, status_source, entry_fee,
                            max_entries, allow_waitlist)
VALUES
  (pg_temp.id('301'), pg_temp.id('201'), 'MYK9-2455 C1', 'Container', 'Novice', 'upcoming', 'manual', 30, NULL, false),
  (pg_temp.id('302'), pg_temp.id('201'), 'MYK9-2455 C2', 'Interior', 'Novice', 'upcoming', 'manual', 25, NULL, false),
  (pg_temp.id('303'), pg_temp.id('201'), 'MYK9-2455 C3', 'Exterior', 'Novice', 'upcoming', 'manual', 10, NULL, false);

INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
SELECT pg_temp.id('4' || lpad(n::text, 2, '0')), 'MYK9-2455 Dog ' || n, 'D' || n, 'Beagle',
       'active', pg_temp.id('011')
FROM unnest(ARRAY[1, 2, 3]) AS n;
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
SELECT d.id, 'AKC', 'SR2455' || right(d.id::text, 3), true
FROM public.dogs d
WHERE d.id IN (SELECT pg_temp.id('4' || lpad(n::text, 2, '0')) FROM unnest(ARRAY[1, 2, 3]) AS n);

SET LOCAL ROLE service_role;
INSERT INTO public.entry_carts (id, exhibitor_id, show_id, status, expires_at,
                                subtotal_cents, platform_fee_cents, total_cents)
SELECT c.id, ep.id, pg_temp.id('101'), c.status, now() + interval '30 minutes', 4500, 315, 4815
FROM (VALUES (pg_temp.id('601'), 'active'), (pg_temp.id('611'), 'abandoned')) AS c (id, status)
CROSS JOIN public.exhibitor_profiles ep
WHERE ep.auth_user_id = pg_temp.id('012');

INSERT INTO public.entry_cart_items (id, cart_id, dog_id, class_id, entry_fee_cents)
VALUES
  (pg_temp.id('701'), pg_temp.id('601'), pg_temp.id('401'), pg_temp.id('301'), 2000),
  (pg_temp.id('702'), pg_temp.id('601'), pg_temp.id('402'), pg_temp.id('302'), 2500),
  (pg_temp.id('709'), pg_temp.id('611'), pg_temp.id('403'), pg_temp.id('303'), 1000);

-- The page goes on AFTER the lines: every line insert severs it.
UPDATE public.entry_carts SET stripe_checkout_session_id = 'cs_test_2455_a'
 WHERE id = pg_temp.id('601');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- F2. A lease that expired mid-heal
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_read timestamptz := pg_temp.cart_stamp(pg_temp.id('601'));
  v_before text := pg_temp.cart_state(pg_temp.id('601'));
BEGIN
  PERFORM pg_temp.expect_eq(v_before, '701:2000 702:2500 | 4500/315/4815 | cs_test_2455_a',
    'F2 the fixture cart is drifted and links its page');
  PERFORM pg_temp.expect_eq(pg_temp.claim(pg_temp.id('601'), pg_temp.id('901')), 'claimed',
    'F2 the first request claims the cart');

  -- The Stripe call outlives the 90-second lease (one transaction keeps now()
  -- fixed, so expiry is modelled by moving lease_until into the past).
  UPDATE public.cart_checkout_leases SET lease_until = now() - interval '1 second'
   WHERE cart_id = pg_temp.id('601');
  PERFORM pg_temp.expect_eq(
    pg_temp.heal(pg_temp.id('901'), v_read, 'cs_test_2455_a',
                 jsonb_build_array(pg_temp.line('701', 3000)), 5500),
    'lease_lost', 'F2 a heal on an expired lease is refused');
  PERFORM pg_temp.expect_eq(pg_temp.cart_state(pg_temp.id('601')), v_before,
    'F2 and writes nothing');

  -- The exhibitor's retry claims the cart and links its own page.
  PERFORM pg_temp.expect_eq(pg_temp.claim(pg_temp.id('601'), pg_temp.id('902')), 'claimed',
    'F2 the retry claims the cart once the lease ran out');
  UPDATE public.entry_carts SET stripe_checkout_session_id = 'cs_test_2455_retry'
   WHERE id = pg_temp.id('601');
  PERFORM pg_temp.expect_eq(
    pg_temp.heal(pg_temp.id('901'), v_read, 'cs_test_2455_a',
                 jsonb_build_array(pg_temp.line('701', 3000)), 5500),
    'lease_lost', 'F2 the first request''s heal is still refused');
  PERFORM pg_temp.expect_eq(pg_temp.cart_state(pg_temp.id('601')),
    '701:2000 702:2500 | 4500/315/4815 | cs_test_2455_retry',
    'F2 and the retry''s page stays linked');
  PERFORM pg_temp.expect_eq(
    (SELECT l.lease_id::text FROM public.cart_checkout_leases l WHERE l.cart_id = pg_temp.id('601')),
    pg_temp.id('902')::text, 'F2 the lease is the retry''s');
END;
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- F3, F4. A moved cart, a moved page
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_read timestamptz := pg_temp.cart_stamp(pg_temp.id('601'));
  v_before text;
BEGIN
  -- Back to the first page under the retry's live lease 902.
  UPDATE public.entry_carts SET stripe_checkout_session_id = 'cs_test_2455_a'
   WHERE id = pg_temp.id('601');
  v_before := pg_temp.cart_state(pg_temp.id('601'));

  -- One transaction keeps updated_at at now(); a read taken before an edit is
  -- modelled as an earlier stamp.
  PERFORM pg_temp.expect_eq(
    pg_temp.heal(pg_temp.id('902'), v_read - interval '1 second', 'cs_test_2455_a',
                 jsonb_build_array(pg_temp.line('701', 3000)), 5500),
    'cart_changed', 'F3 a heal on a stale read of the cart is refused');
  PERFORM pg_temp.expect_eq(pg_temp.cart_state(pg_temp.id('601')), v_before,
    'F3 and writes nothing');

  -- A line added or removed while no page was linked leaves updated_at alone.
  -- Modelled here as a subtotal (5500) the healed lines do not add up to (5000).
  PERFORM pg_temp.expect_eq(
    pg_temp.heal(pg_temp.id('902'), v_read, 'cs_test_2455_a',
                 jsonb_build_array(pg_temp.line('701', 2500)), 5500),
    'cart_changed', 'F3 lines that do not add up to the subtotal are refused');
  PERFORM pg_temp.expect_eq(pg_temp.cart_state(pg_temp.id('601')), v_before,
    'F3 and write nothing');

  PERFORM pg_temp.expect_eq(
    pg_temp.heal(pg_temp.id('902'), v_read, 'cs_test_2455_old',
                 jsonb_build_array(pg_temp.line('701', 3000)), 5500),
    'session_moved', 'F4 a heal for a page the cart no longer links is refused');
  PERFORM pg_temp.expect_eq(
    pg_temp.heal(pg_temp.id('902'), v_read, NULL,
                 jsonb_build_array(pg_temp.line('701', 3000)), 5500),
    'session_moved', 'F4 a heal that read no page is refused once a page is linked');
  PERFORM pg_temp.expect_eq(pg_temp.cart_state(pg_temp.id('601')), v_before,
    'F4 and writes nothing: the linked page stays');
END;
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- F5. All or nothing
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
SELECT pg_temp.expect_sqlstate(
  format($q$SELECT pg_temp.heal(%L, %L, 'cs_test_2455_a', %L, 5500)$q$,
         pg_temp.id('902'), pg_temp.cart_stamp(pg_temp.id('601')),
         jsonb_build_array(pg_temp.line('701', 3000), pg_temp.line('709', 1500))),
  'P0002', 'F5 a line from another cart raises after the first line was written');
SELECT pg_temp.expect_eq(pg_temp.cart_state(pg_temp.id('601')),
  '701:2000 702:2500 | 4500/315/4815 | cs_test_2455_a',
  'F5 every line of the cart rolls back, and its totals and page are untouched');
SELECT pg_temp.expect_eq(pg_temp.cart_state(pg_temp.id('611')),
  '709:1000 | 4500/315/4815 | -', 'F5 the other cart''s line is untouched');

SELECT pg_temp.expect_sqlstate(
  format($q$SELECT public.heal_cart_fees(%L, %L, %L, 'cs_test_2455_a', %L, 5500, 385, 5000)$q$,
         pg_temp.id('601'), pg_temp.id('902'), pg_temp.cart_stamp(pg_temp.id('601')),
         jsonb_build_array(pg_temp.line('701', 3000))),
  '22023', 'F5 a total that is not subtotal plus fee is refused');
SELECT pg_temp.expect_sqlstate(
  format($q$SELECT pg_temp.heal(%L, %L, 'cs_test_2455_a', %L, 2500)$q$,
         pg_temp.id('902'), pg_temp.cart_stamp(pg_temp.id('601')),
         jsonb_build_array(pg_temp.line('701', 0))),
  '22023', 'F5 a zero fee is never healed onto a line');
SELECT pg_temp.expect_sqlstate(
  format($q$SELECT pg_temp.heal(%L, %L, 'cs_test_2455_a', '[]'::jsonb, 4500)$q$,
         pg_temp.id('902'), pg_temp.cart_stamp(pg_temp.id('601'))),
  '22023', 'F5 a heal with no lines is refused');
SELECT pg_temp.expect_eq(pg_temp.cart_state(pg_temp.id('601')),
  '701:2000 702:2500 | 4500/315/4815 | cs_test_2455_a', 'F5 none of them wrote anything');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- F6. The heal
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    pg_temp.heal(pg_temp.id('902'), pg_temp.cart_stamp(pg_temp.id('601')), 'cs_test_2455_a',
                 jsonb_build_array(pg_temp.line('701', 3000)), 5500),
    'healed', 'F6 the live lease heals the cart it read');
  PERFORM pg_temp.expect_eq(pg_temp.cart_state(pg_temp.id('601')),
    '701:3000 702:2500 | 5500/385/5885 | -',
    'F6 every line, the totals and the cleared page link are written together');
  PERFORM pg_temp.expect_eq(
    (SELECT c.status FROM public.entry_carts c WHERE c.id = pg_temp.id('601')),
    'active', 'F6 the cart stays active');
  PERFORM pg_temp.expect_eq(
    (SELECT l.lease_id::text FROM public.cart_checkout_leases l WHERE l.cart_id = pg_temp.id('601')),
    pg_temp.id('902')::text, 'F6 the lease is still this request''s');
  PERFORM pg_temp.expect_eq(public.end_cart_checkout(pg_temp.id('601'), pg_temp.id('902'))::text,
    'true', 'F6 the checkout ends');
END;
$$;
RESET ROLE;

ROLLBACK;
