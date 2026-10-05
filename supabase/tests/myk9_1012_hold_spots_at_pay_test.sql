-- MYK9-1012 (migration 20261004235300): a cart holds its class spots from the
-- Pay click until its Stripe page expires, and a held spot counts as taken.
--
-- Two exhibitors, one show:
--   Ann  cart 601: A1 -> C1 (the last spot, no wait list)
--                  A2 -> C2 (the last spot, wait list on; dog W waits there)
--                  A3 -> C4 (no class limit; judge J's day takes one dog)
--   Bea  cart 611: B1 -> C1 (the same last spot)
--                  B2 -> C3 (no limit)
--
-- Properties asserted here:
--   H1  Shape and ACL: the RPCs are SECURITY DEFINER with search_path '' and
--       service_role only; the table grants nothing to anon or authenticated
--       and forces RLS.
--   H2  THE RACE: Ann's Pay holds all three spots under the show, class and
--       judge-day locks (held by this backend once the call returns). Bea's Pay
--       for the same last spot is refused BEFORE any charge, names B1, holds
--       nothing (B2 included: all or nothing) and writes no wait-list row.
--   H3  HOLDS COUNT AS TAKEN: class_entry_availability, the judge day,
--       evaluate_entry_capacity (self-service and organizer) and the wait-list
--       promotion all count Ann's holds; leaving out Ann's own account gives
--       her the spots back. The client reads: Bea sees C1 full, Ann does not.
--   H4  Bea's cart reconcile drops her line in the held no-wait-list class as
--       'full'; Ann's own holds never drop Ann's lines.
--   H5  attach ties the holds to the session the cart links and sets their
--       expiry to the session's: the hold ends with the page, not later.
--   H6  PAID WITH A HOLD: every line of Ann's paid cart is entered, each hold
--       converts, nothing is unserved and the latch closes with no
--       cart_overflow refund request.
--   H7  An expired hold no longer counts: the spot is free again.
--   H8  Release: a new Pay replaces the retired page's holds, a link moving off the
--       session releases that session's holds, a closed cart releases all, a
--       deleted line takes its hold with it, and checkout_failed releases.
--   H9  Guards: no hold on a cart that is not active, or with an expiry
--       outside the next 24 hours; attach refuses a session the cart does
--       not link.
--   H10 ATTEMPT OWNERSHIP (Codex P1 on #2755): two Pay attempts on one cart
--       both hold before either records its page. The loser's cleanup and an
--       earlier attempt's late failure give back only their own holds; the
--       winner's page keeps its spots. attach never adopts another attempt's
--       holds, and an unattached hold lives at most 5 minutes.
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

-- A fixture id: 00000000-0000-0000-0000-000001012<suffix>.
CREATE FUNCTION pg_temp.id(p_suffix text)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $f$
  SELECT ('00000000-0000-0000-0000-000001012' || p_suffix)::uuid
$f$;

-- True when THIS backend holds the advisory lock taken as
-- pg_advisory_xact_lock(hashtext(p_key)). A bigint key shows in pg_locks as
-- classid = high 32 bits, objid = low 32 bits (unsigned), objsubid 1.
CREATE FUNCTION pg_temp.locked(p_key text) RETURNS boolean
LANGUAGE sql AS $f$
  WITH k AS (SELECT hashtext(p_key)::bigint AS key)
  SELECT EXISTS (
    SELECT 1 FROM pg_locks l, k
    WHERE l.locktype = 'advisory'
      AND l.pid = pg_backend_pid()
      AND l.objsubid = 1
      AND l.classid::bigint = ((k.key >> 32) & 4294967295)
      AND l.objid::bigint = (k.key & 4294967295)
  );
$f$;

-- A cart's live holds: item:session-or-dash, in line order.
CREATE FUNCTION pg_temp.live_holds(p_cart uuid)
RETURNS text LANGUAGE sql AS $f$
  SELECT COALESCE(string_agg(right(h.cart_item_id::text, 3) || ':'
                               || COALESCE(h.stripe_checkout_session_id, '-'),
                             ' ' ORDER BY right(h.cart_item_id::text, 3)), '')
    FROM public.cart_spot_holds h
   WHERE h.cart_id = p_cart AND h.released_at IS NULL AND h.expires_at > now()
$f$;

-- ---------------------------------------------------------------------------
-- H1. Shape and ACL
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.hold_cart_spots(uuid, uuid, timestamptz, text, text)',
    'public.attach_cart_spot_holds(uuid, uuid, text, timestamptz)',
    'public.release_cart_spot_holds(uuid, uuid, text)',
    'public.held_spot_count(uuid[], uuid)',
    'public.class_entry_availability(uuid[], uuid)',
    'public.class_judge_day_capacity(uuid[], uuid)',
    'public.get_judge_day_capacity_live(uuid, uuid, date, uuid)'
  ] LOOP
    PERFORM pg_temp.expect_eq(
      (SELECT p.prosecdef || ' ' || array_to_string(p.proconfig, ',')
         FROM pg_proc p WHERE p.oid = v_fn::regprocedure),
      'true search_path=""', 'H1 ' || v_fn || ' is SECURITY DEFINER with an empty search_path');
    PERFORM pg_temp.expect_eq(
      has_function_privilege('anon', v_fn, 'EXECUTE') || ' '
        || has_function_privilege('authenticated', v_fn, 'EXECUTE') || ' '
        || has_function_privilege('service_role', v_fn, 'EXECUTE'),
      'false false true', 'H1 ' || v_fn || ' is service_role only');
  END LOOP;
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM unnest(ARRAY['anon', 'authenticated']) r,
            unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
      WHERE has_table_privilege(r, 'public.cart_spot_holds', p)),
    '0', 'H1 no table privilege for anon or authenticated');
  PERFORM pg_temp.expect_eq(
    (SELECT c.relrowsecurity || ' ' || c.relforcerowsecurity FROM pg_class c
      WHERE c.oid = 'public.cart_spot_holds'::regclass),
    'true true', 'H1 RLS is enabled and forced on cart_spot_holds');
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
INSERT INTO public.people (id, first_name, last_name, email)
VALUES
  (pg_temp.id('011'), 'Ann', 'MYK9-1012', 'myk91012-ann@example.test'),
  (pg_temp.id('021'), 'Bea', 'MYK9-1012', 'myk91012-bea@example.test'),
  (pg_temp.id('031'), 'Jo', 'Judge', 'myk91012-judge@example.test');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
)
VALUES
  (pg_temp.id('012'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'myk91012-ann@example.test', '', now(), now(), now(), '{}', '{}', false, false, false),
  (pg_temp.id('022'), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'myk91012-bea@example.test', '', now(), now(), now(), '{}', '{}', false, false, false);

INSERT INTO public.exhibitor_profiles (person_id, auth_user_id)
SELECT p.person_id, p.auth_user_id
FROM (VALUES (pg_temp.id('011'), pg_temp.id('012')), (pg_temp.id('021'), pg_temp.id('022')))
  AS p (person_id, auth_user_id)
WHERE NOT EXISTS (SELECT 1 FROM public.exhibitor_profiles ep WHERE ep.auth_user_id = p.auth_user_id);

INSERT INTO public.clubs (id, name) VALUES (pg_temp.id('041'), 'MYK9-1012 fixture club');

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status,
                          entry_open_date, entry_close_date, pre_entry_fee,
                          default_judge_day_capacity)
VALUES (pg_temp.id('101'), 'MYK9-1012 Show', 'AKC', current_date + 20, current_date + 21,
        pg_temp.id('041'), 'published', (current_date - 10)::timestamptz,
        (current_date + 10)::timestamptz, 30, 125);

INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type)
VALUES (pg_temp.id('201'), pg_temp.id('101'), 'MYK9-1012 Trial', current_date + 20, 'AKC', 'Scent Work');

INSERT INTO public.classes (id, trial_id, name, element, level, status, status_source, entry_fee,
                            max_entries, allow_waitlist)
VALUES
  (pg_temp.id('301'), pg_temp.id('201'), 'MYK9-1012 C1 last spot', 'Container', 'Novice', 'upcoming', 'manual', 30, 1, false),
  (pg_temp.id('302'), pg_temp.id('201'), 'MYK9-1012 C2 last spot+wl', 'Interior', 'Novice', 'upcoming', 'manual', 30, 1, true),
  (pg_temp.id('303'), pg_temp.id('201'), 'MYK9-1012 C3 open', 'Exterior', 'Novice', 'upcoming', 'manual', 30, NULL, false),
  (pg_temp.id('304'), pg_temp.id('201'), 'MYK9-1012 C4 judge day', 'Buried', 'Novice', 'upcoming', 'manual', 30, NULL, false),
  (pg_temp.id('305'), pg_temp.id('201'), 'MYK9-1012 C5 one spot', 'Container', 'Advanced', 'upcoming', 'manual', 30, 1, false);

-- Judge Jo's day takes one dog.
INSERT INTO public.judge_assignments (person_id, show_id, trial_id, class_id, status,
                                      day_capacity_override)
VALUES (pg_temp.id('031'), pg_temp.id('101'), pg_temp.id('201'), pg_temp.id('304'), 'confirmed', 1);

INSERT INTO public.dogs (id, name, call_name, breed, status, owner_id)
SELECT pg_temp.id(d.suffix), 'MYK9-1012 Dog ' || d.suffix, 'D' || d.suffix, 'Beagle', 'active', d.owner
FROM (VALUES ('401', pg_temp.id('011')), ('402', pg_temp.id('011')), ('403', pg_temp.id('011')),
             ('404', pg_temp.id('011')), ('411', pg_temp.id('021')), ('412', pg_temp.id('021')),
             ('413', pg_temp.id('021')), ('421', pg_temp.id('021'))) AS d (suffix, owner);
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
SELECT d.id, 'AKC', 'SR1012' || right(d.id::text, 3), true
FROM public.dogs d
WHERE d.id IN (SELECT pg_temp.id(s) FROM unnest(ARRAY['401', '402', '403', '404', '411', '412', '413', '421']) s);

SET LOCAL ROLE service_role;
INSERT INTO public.entry_carts (id, exhibitor_id, show_id, status, expires_at)
SELECT c.id, ep.id, pg_temp.id('101'), 'active', now() + interval '30 minutes'
FROM (VALUES (pg_temp.id('601'), pg_temp.id('012')), (pg_temp.id('611'), pg_temp.id('022'))) AS c (id, auth_id)
JOIN public.exhibitor_profiles ep ON ep.auth_user_id = c.auth_id;

INSERT INTO public.entry_cart_items (id, cart_id, dog_id, class_id, entry_fee_cents, created_at)
VALUES
  (pg_temp.id('701'), pg_temp.id('601'), pg_temp.id('401'), pg_temp.id('301'), 3000, now() - interval '9 minutes'),
  (pg_temp.id('702'), pg_temp.id('601'), pg_temp.id('402'), pg_temp.id('302'), 3000, now() - interval '8 minutes'),
  (pg_temp.id('703'), pg_temp.id('601'), pg_temp.id('403'), pg_temp.id('304'), 3000, now() - interval '7 minutes'),
  (pg_temp.id('711'), pg_temp.id('611'), pg_temp.id('411'), pg_temp.id('301'), 3000, now() - interval '6 minutes'),
  (pg_temp.id('712'), pg_temp.id('611'), pg_temp.id('412'), pg_temp.id('303'), 3000, now() - interval '5 minutes');

-- Dog W waits in C2.
INSERT INTO public.waitlist_entries (id, class_id, exhibitor_id, dog_id, position, joined_via)
SELECT pg_temp.id('801'), pg_temp.id('302'), ep.id, pg_temp.id('421'), 1, 'online'
FROM public.exhibitor_profiles ep WHERE ep.auth_user_id = pg_temp.id('022');
RESET ROLE;

-- ---------------------------------------------------------------------------
-- H2. The race for the last spot
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    (pg_temp.locked('showcapacity:' || pg_temp.id('101'))
      OR pg_temp.locked(pg_temp.id('301')::text)
      OR pg_temp.locked('judgeday:' || pg_temp.id('031') || ':' || (current_date + 20)::text))::text,
    'false', 'H2 fixture: no capacity lock is held before the Pay clicks');
END;
$$;

SET LOCAL ROLE service_role;
DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT string_agg(right(r.cart_item_id::text, 3) || ':' || r.outcome, ' ' ORDER BY r.cart_item_id)
       FROM public.hold_cart_spots(pg_temp.id('601'), pg_temp.id('901'), now() + interval '40 minutes') r),
    '701:held 702:held 703:held', 'H2 Ann''s Pay holds every line');
END;
$$;
RESET ROLE;

DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    pg_temp.locked('showcapacity:' || pg_temp.id('101'))::text || ' '
      || pg_temp.locked(pg_temp.id('301')::text)::text || ' '
      || pg_temp.locked('judgeday:' || pg_temp.id('031') || ':' || (current_date + 20)::text)::text,
    'true true true',
    'H2 the hold took the show, class and judge-day locks, kept until commit');
END;
$$;

SET LOCAL ROLE service_role;
DO $$
DECLARE
  r record;
  v_rows integer;
BEGIN
  SELECT count(*) INTO v_rows FROM public.hold_cart_spots(pg_temp.id('611'), pg_temp.id('911'), now() + interval '40 minutes');
  SELECT * INTO r FROM public.hold_cart_spots(pg_temp.id('611'), pg_temp.id('911'), now() + interval '40 minutes');
  PERFORM pg_temp.expect_eq(
    v_rows || ' ' || r.outcome || ' ' || right(r.cart_item_id::text, 3) || ' '
      || right(r.class_id::text, 3) || ' ' || right(r.dog_id::text, 3) || ' '
      || r.allow_waitlist || ' ' || COALESCE(r.denial_reason, '-'),
    '1 refused 711 301 411 false -',
    'H2 Bea''s Pay for the same last spot is refused before payment, naming B1');
  PERFORM pg_temp.expect_eq(pg_temp.live_holds(pg_temp.id('611')), '',
    'H2 all or nothing: Bea holds nothing, not even B2 in the open class');
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM public.waitlist_entries w WHERE w.dog_id = pg_temp.id('411')),
    '0', 'H2 the refusal writes no wait-list row');
  PERFORM pg_temp.expect_eq(pg_temp.live_holds(pg_temp.id('601')), '701:- 702:- 703:-',
    'H2 Ann still holds her three spots');
END;
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- H3. Holds count as taken
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_all text;
  v_ann text;
  r record;
BEGIN
  SELECT string_agg(right(a.class_id::text, 3) || ':' || a.entry_count || ':' || a.class_full || ':'
                      || COALESCE(a.judge_day_available::text, '-') || ':'
                      || COALESCE(a.self_service_block, '-'), ' ' ORDER BY a.class_id)
    INTO v_all
    FROM public.class_entry_availability(ARRAY[pg_temp.id('301'), pg_temp.id('302'), pg_temp.id('304')]) a;
  PERFORM pg_temp.expect_eq(v_all, '301:1:true:-:full 302:1:true:-:- 304:1:false:0:full',
    'H3 class_entry_availability counts the held spots: C1 full, C2 full (wait list), C4''s day full');

  SELECT string_agg(right(a.class_id::text, 3) || ':' || a.entry_count || ':' || a.class_full || ':'
                      || COALESCE(a.judge_day_available::text, '-') || ':'
                      || COALESCE(a.self_service_block, '-'), ' ' ORDER BY a.class_id)
    INTO v_ann
    FROM public.class_entry_availability(ARRAY[pg_temp.id('301'), pg_temp.id('302'), pg_temp.id('304')],
                                         pg_temp.id('012')) a;
  PERFORM pg_temp.expect_eq(v_ann, '301:0:false:-:- 302:0:false:-:- 304:0:false:1:-',
    'H3 leaving out Ann''s own account gives her the spots back');

  SELECT * INTO r FROM public.get_judge_day_capacity_live(pg_temp.id('031'), pg_temp.id('101'), current_date + 20);
  PERFORM pg_temp.expect_eq(r.confirmed_count || ' ' || r.available_spots, '1 0',
    'H3 the judge day counts the held spot as taken');

  SELECT * INTO r FROM public.evaluate_entry_capacity(pg_temp.id('301'), pg_temp.id('412'), NULL, NULL, 'self_service', false);
  PERFORM pg_temp.expect_eq(r.outcome, 'denied', 'H3 a self-service entry into the held last spot is denied');
  SELECT * INTO r FROM public.evaluate_entry_capacity(pg_temp.id('304'), pg_temp.id('412'), NULL, NULL, 'organizer', false);
  PERFORM pg_temp.expect_eq(r.outcome, 'denied', 'H3 an organizer entry into the held judge day is denied too');
END;
$$;

SELECT pg_temp.expect_sqlstate(
  format('SELECT public.promote_waitlist_entry_internal(%L)', pg_temp.id('801')),
  'P0001', 'H3 the wait list is not offered a spot a cart holds');

-- The client reads, as Bea and as Ann.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', pg_temp.id('022')::text, true);
SELECT set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', pg_temp.id('022')), true);
DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT a.class_full || ' ' || a.entry_count FROM public.get_show_class_availability(pg_temp.id('101')) a
      WHERE a.class_id = pg_temp.id('301')),
    'true 1', 'H3 Bea''s wizard sees the held last spot as Full');
  PERFORM pg_temp.expect_eq(
    (SELECT d.class_full || ' ' || d.class_remaining FROM public.get_show_class_judge_day_availability(pg_temp.id('101')) d
      WHERE d.class_id = pg_temp.id('301')),
    'true 0', 'H3 Bea''s cart sees no spot left in C1');
  PERFORM pg_temp.expect_eq(
    (SELECT d.day_remaining::text FROM public.get_show_class_judge_day_availability(pg_temp.id('101')) d
      WHERE d.class_id = pg_temp.id('304')),
    '0', 'H3 Bea''s cart sees no spot left on the judge''s day');
END;
$$;

SELECT set_config('request.jwt.claim.sub', pg_temp.id('012')::text, true);
SELECT set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', pg_temp.id('012')), true);
DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT a.class_full || ' ' || a.entry_count FROM public.get_show_class_availability(pg_temp.id('101')) a
      WHERE a.class_id = pg_temp.id('301')),
    'false 0', 'H3 Ann''s own hold never shows her own spot as Full');
  PERFORM pg_temp.expect_eq(
    (SELECT d.class_remaining || ' ' FROM public.get_show_class_judge_day_availability(pg_temp.id('101')) d
      WHERE d.class_id = pg_temp.id('301'))
      || (SELECT d.day_remaining FROM public.get_show_class_judge_day_availability(pg_temp.id('101')) d
           WHERE d.class_id = pg_temp.id('304')),
    '1 1', 'H3 Ann''s cart still sees her held spots as hers');
END;
$$;

-- ---------------------------------------------------------------------------
-- H4. The cart reconcile
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM public.reconcile_cart_closed_classes(pg_temp.id('601'))),
    '0', 'H4 Ann''s own holds never drop Ann''s lines');
END;
$$;
SELECT set_config('request.jwt.claim.sub', pg_temp.id('022')::text, true);
SELECT set_config('request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', pg_temp.id('022')), true);
DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT string_agg(right(r.item_id::text, 3) || ':' || r.reason, ' ')
       FROM public.reconcile_cart_closed_classes(pg_temp.id('611')) r),
    '711:full', 'H4 Bea''s line in the held no-wait-list class is dropped as full');
END;
$$;
RESET ROLE;

-- ---------------------------------------------------------------------------
-- H5. attach: the hold ends with the page
-- ---------------------------------------------------------------------------
SET LOCAL ROLE service_role;
SELECT pg_temp.expect_sqlstate(
  format($q$SELECT public.attach_cart_spot_holds(%L, %L, 'cs_test_1012_a', now() + interval '31 minutes')$q$,
         pg_temp.id('601'), pg_temp.id('901')),
  '55000', 'H9 attach refuses a session the cart does not link');

UPDATE public.entry_carts SET stripe_checkout_session_id = 'cs_test_1012_a'
 WHERE id = pg_temp.id('601');

DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT string_agg(DISTINCT (h.expires_at = now() + interval '5 minutes')::text, ',')
       FROM public.cart_spot_holds h
      WHERE h.cart_id = pg_temp.id('601') AND h.released_at IS NULL),
    'true', 'H5 before its page exists a hold lives 5 minutes, not the 40 asked for');
  PERFORM pg_temp.expect_eq(
    public.attach_cart_spot_holds(pg_temp.id('601'), pg_temp.id('901'), 'cs_test_1012_a',
                                  now() + interval '31 minutes')::text,
    '3', 'H5 attach ties all three holds to the session');
  PERFORM pg_temp.expect_eq(
    (SELECT string_agg(DISTINCT (h.expires_at = now() + interval '31 minutes')::text, ',')
       FROM public.cart_spot_holds h
      WHERE h.cart_id = pg_temp.id('601') AND h.released_at IS NULL),
    'true', 'H5 every hold now expires exactly when the page does');
  PERFORM pg_temp.expect_eq(pg_temp.live_holds(pg_temp.id('601')),
    '701:cs_test_1012_a 702:cs_test_1012_a 703:cs_test_1012_a', 'H5 the holds name the session');
END;
$$;

-- ---------------------------------------------------------------------------
-- H6. Paid with a hold: every dog entered, no overflow refund
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_item uuid;
  v_outcomes text := '';
BEGIN
  SELECT * INTO r FROM public.begin_cart_fulfillment(pg_temp.id('601'), 'cs_test_1012_a',
    'pi_test_1012_a',
    (SELECT jsonb_object_agg(i.id::text, 3000) FROM public.entry_cart_items i
      WHERE i.cart_id = pg_temp.id('601')));
  PERFORM pg_temp.expect_eq(r.outcome, 'begun', 'H6 the paid cart begins fulfillment');
  PERFORM pg_temp.expect_eq(pg_temp.live_holds(pg_temp.id('601')),
    '701:cs_test_1012_a 702:cs_test_1012_a 703:cs_test_1012_a',
    'H6 a fulfilling cart keeps its holds until each line converts');

  FOREACH v_item IN ARRAY ARRAY[pg_temp.id('701'), pg_temp.id('702'), pg_temp.id('703')] LOOP
    SELECT * INTO r FROM public.fulfill_cart_line('cs_test_1012_a', v_item);
    v_outcomes := v_outcomes || right(v_item::text, 3) || ':' || r.outcome || ' ';
  END LOOP;
  PERFORM pg_temp.expect_eq(v_outcomes, '701:created_entry 702:created_entry 703:created_entry ',
    'H6 every held line is entered: the last spots, the wait-list class and the full judge day');
  PERFORM pg_temp.expect_eq(
    (SELECT string_agg(h.release_reason, ',' ORDER BY h.cart_item_id) FROM public.cart_spot_holds h
      WHERE h.cart_id = pg_temp.id('601') AND h.stripe_checkout_session_id = 'cs_test_1012_a'),
    'converted,converted,converted', 'H6 each hold converted into its entry');
  PERFORM pg_temp.expect_eq(
    (SELECT COALESCE(sum(l.line_amount_cents), 0)::text FROM public.cart_fulfillment_lines l
      WHERE l.stripe_checkout_session_id = 'cs_test_1012_a'
        AND l.outcome IN ('waitlisted', 'denied', 'failed')),
    '0', 'H6 nothing went unserved');
  PERFORM pg_temp.expect_eq(
    (SELECT a.entry_count || ':' || a.class_full FROM public.class_entry_availability(ARRAY[pg_temp.id('301')]) a),
    '1:true', 'H6 the spot passed from the hold to the entry, counted once');

  PERFORM public.complete_cart_fulfillment('cs_test_1012_a', jsonb_build_object(
    'customer_id', NULL, 'stripe_payment_intent_id', 'pi_test_1012_a', 'amount_cents', 9000,
    'currency', 'usd', 'status', 'succeeded', 'order_type', 'entry',
    'entry_subtotal_cents', 9000, 'platform_fee_cents', 0, 'platform_fee_rate', 0,
    'stripe_processing_fee_cents', NULL, 'refunded_cents', 0, 'make_whole_refunded_cents', 0,
    'metadata', jsonb_build_object('entry_count', 3), 'show_id', pg_temp.id('101'),
    'entry_ids', (SELECT jsonb_agg(l.entry_id) FROM public.cart_fulfillment_lines l
                   WHERE l.stripe_checkout_session_id = 'cs_test_1012_a'),
    'paid_at', '2026-10-04T00:00:00Z'));
  PERFORM pg_temp.expect_eq(
    (SELECT c.status FROM public.entry_carts c WHERE c.id = pg_temp.id('601')) || ' '
      || (SELECT count(*) FROM public.refund_requests q
           WHERE q.stripe_checkout_session_id = 'cs_test_1012_a'),
    'submitted 0', 'H6 the latch closes with no cart_overflow refund request');
END;
$$;

-- ---------------------------------------------------------------------------
-- H7. An expired hold no longer counts
-- ---------------------------------------------------------------------------
INSERT INTO public.entry_cart_items (id, cart_id, dog_id, class_id, entry_fee_cents, created_at)
VALUES (pg_temp.id('713'), pg_temp.id('611'), pg_temp.id('413'), pg_temp.id('305'), 3000, now());

DO $$
DECLARE
  r record;
BEGIN
  PERFORM pg_temp.expect_eq(
    (SELECT string_agg(right(h.cart_item_id::text, 3) || ':' || h.outcome, ' ' ORDER BY h.cart_item_id)
       FROM public.hold_cart_spots(pg_temp.id('611'), pg_temp.id('912'), now() + interval '31 minutes') h),
    '712:held 713:held', 'H7 Bea holds C3 and C5''s one spot');
  PERFORM pg_temp.expect_eq(
    (SELECT a.class_full::text FROM public.class_entry_availability(ARRAY[pg_temp.id('305')]) a),
    'true', 'H7 while the hold lives, C5 is full');

  -- The Stripe page (and so the hold) expired.
  UPDATE public.cart_spot_holds h SET expires_at = now() - interval '1 second'
   WHERE h.cart_id = pg_temp.id('611') AND h.released_at IS NULL;

  PERFORM pg_temp.expect_eq(
    (SELECT a.entry_count || ':' || a.class_full FROM public.class_entry_availability(ARRAY[pg_temp.id('305')]) a)
      || ' ' || public.held_spot_count(ARRAY[pg_temp.id('305')]),
    '0:false 0', 'H7 the expired hold releases the spot');
  SELECT * INTO r FROM public.evaluate_entry_capacity(pg_temp.id('305'), pg_temp.id('404'), NULL, NULL, 'self_service', false);
  PERFORM pg_temp.expect_eq(r.outcome, 'available', 'H7 another exhibitor can take the freed spot');
END;
$$;

-- ---------------------------------------------------------------------------
-- H8. Release paths
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM public.hold_cart_spots(pg_temp.id('611'), pg_temp.id('913'), now() + interval '31 minutes');
  PERFORM pg_temp.expect_eq(pg_temp.live_holds(pg_temp.id('611')), '712:- 713:-',
    'H8 a new Pay holds both lines again: the expired holds no longer count');
END;
$$;

UPDATE public.entry_carts SET stripe_checkout_session_id = 'cs_test_1012_b'
 WHERE id = pg_temp.id('611');
SELECT public.attach_cart_spot_holds(pg_temp.id('611'), pg_temp.id('913'), 'cs_test_1012_b',
                                     now() + interval '31 minutes');
DO $$
BEGIN
  -- The next Pay retires page b (resolveCheckoutSession expired it) and names it.
  PERFORM public.hold_cart_spots(pg_temp.id('611'), pg_temp.id('914'), now() + interval '31 minutes',
                                 NULL, 'cs_test_1012_b');
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM public.cart_spot_holds h
      WHERE h.cart_id = pg_temp.id('611') AND h.stripe_checkout_session_id = 'cs_test_1012_b'
        AND h.release_reason = 'replaced'),
    '2', 'H8 a new Pay releases the retired page''s holds');
  PERFORM pg_temp.expect_eq(pg_temp.live_holds(pg_temp.id('611')), '712:- 713:-',
    'H8 and holds the lines afresh for its own page');
END;
$$;

UPDATE public.entry_carts SET stripe_checkout_session_id = 'cs_test_1012_c'
 WHERE id = pg_temp.id('611');
SELECT public.attach_cart_spot_holds(pg_temp.id('611'), pg_temp.id('914'), 'cs_test_1012_c',
                                     now() + interval '31 minutes');
UPDATE public.entry_carts SET stripe_checkout_session_id = NULL WHERE id = pg_temp.id('611');
DO $$
BEGIN
  PERFORM pg_temp.expect_eq(pg_temp.live_holds(pg_temp.id('611')) || '|'
      || (SELECT count(*) FROM public.cart_spot_holds h
           WHERE h.cart_id = pg_temp.id('611') AND h.release_reason = 'session_ended'),
    '|2', 'H8 the link moving off the session releases that session''s holds');
END;
$$;

SELECT public.hold_cart_spots(pg_temp.id('611'), pg_temp.id('915'), now() + interval '31 minutes');
DELETE FROM public.entry_cart_items WHERE id = pg_temp.id('713');
DO $$
BEGIN
  PERFORM pg_temp.expect_eq(pg_temp.live_holds(pg_temp.id('611')) || '|'
      || (SELECT count(*) FROM public.cart_spot_holds h WHERE h.cart_item_id = pg_temp.id('713')),
    '712:-|0', 'H8 a deleted cart line takes its hold with it');
  PERFORM pg_temp.expect_eq(public.release_cart_spot_holds(pg_temp.id('611'), pg_temp.id('915'))::text
      || ' ' || pg_temp.live_holds(pg_temp.id('611')),
    '1 ', 'H8 checkout_failed releases the attempt''s live holds');
END;
$$;

SELECT public.hold_cart_spots(pg_temp.id('611'), pg_temp.id('916'), now() + interval '31 minutes');
UPDATE public.entry_carts SET status = 'expired' WHERE id = pg_temp.id('611');
DO $$
BEGIN
  PERFORM pg_temp.expect_eq(pg_temp.live_holds(pg_temp.id('611')) || '|'
      || (SELECT count(*) FROM public.cart_spot_holds h
           WHERE h.attempt_id = pg_temp.id('916') AND h.release_reason = 'cart_closed'),
    '|1', 'H8 a cart that leaves checkout releases every hold');
END;
$$;

-- ---------------------------------------------------------------------------
-- H9. Guards
-- ---------------------------------------------------------------------------
SELECT pg_temp.expect_sqlstate(
  format($q$SELECT public.hold_cart_spots(%L, %L, now() + interval '31 minutes')$q$,
         pg_temp.id('601'), pg_temp.id('917')),
  '55000', 'H9 no hold on a cart that is not active (Ann''s is submitted)');
UPDATE public.entry_carts SET status = 'active' WHERE id = pg_temp.id('611');
SELECT pg_temp.expect_sqlstate(
  format($q$SELECT public.hold_cart_spots(%L, %L, now())$q$, pg_temp.id('611'), pg_temp.id('917')),
  '22023', 'H9 no hold that has already ended');
SELECT pg_temp.expect_sqlstate(
  format($q$SELECT public.hold_cart_spots(%L, %L, now() + interval '25 hours')$q$,
         pg_temp.id('611'), pg_temp.id('917')),
  '22023', 'H9 no hold past a Stripe page''s 24-hour limit');
SELECT pg_temp.expect_sqlstate(
  format($q$SELECT public.hold_cart_spots(%L, NULL, now() + interval '31 minutes')$q$, pg_temp.id('611')),
  '22023', 'H9 no hold without an attempt');
SELECT pg_temp.expect_sqlstate(
  format($q$SELECT public.release_cart_spot_holds(%L, %L, 'converted')$q$,
         pg_temp.id('611'), pg_temp.id('917')),
  '22023', 'H9 release_cart_spot_holds only gives spots back as checkout_failed');

-- ---------------------------------------------------------------------------
-- H10. Attempt ownership: concurrent Pays on one cart
-- ---------------------------------------------------------------------------
-- The loser's cleanup: winner W and loser L both hold B2 before either links
-- a page; W wins the cart's optimistic update, L gives back what it took.
DO $$
BEGIN
  PERFORM public.hold_cart_spots(pg_temp.id('611'), pg_temp.id('921'), now() + interval '31 minutes');
  PERFORM public.hold_cart_spots(pg_temp.id('611'), pg_temp.id('922'), now() + interval '31 minutes');
  PERFORM pg_temp.expect_eq(
    (SELECT count(*)::text FROM public.cart_spot_holds h
      WHERE h.cart_id = pg_temp.id('611') AND h.released_at IS NULL AND h.expires_at > now()),
    '2', 'H10 a second attempt does not release the first one''s in-flight holds');
END;
$$;
UPDATE public.entry_carts SET stripe_checkout_session_id = 'cs_test_1012_win'
 WHERE id = pg_temp.id('611');
DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    public.attach_cart_spot_holds(pg_temp.id('611'), pg_temp.id('921'), 'cs_test_1012_win',
                                  now() + interval '31 minutes')::text,
    '1', 'H10 the winner ties only its own hold to its page');
  PERFORM pg_temp.expect_eq(
    public.release_cart_spot_holds(pg_temp.id('611'), pg_temp.id('922'))::text,
    '1', 'H10 the loser''s cleanup releases only the loser''s hold');
  PERFORM pg_temp.expect_eq(pg_temp.live_holds(pg_temp.id('611')), '712:cs_test_1012_win',
    'H10 the winner''s page keeps its spot after the loser cleans up');
END;
$$;

-- The stale earlier failure: E holds, N holds and wins; E's Stripe call fails
-- late and E cleans up.
DO $$
BEGIN
  PERFORM public.hold_cart_spots(pg_temp.id('611'), pg_temp.id('923'), now() + interval '31 minutes',
                                 NULL, 'cs_test_1012_win');
  PERFORM public.hold_cart_spots(pg_temp.id('611'), pg_temp.id('924'), now() + interval '31 minutes');
END;
$$;
UPDATE public.entry_carts SET stripe_checkout_session_id = 'cs_test_1012_new'
 WHERE id = pg_temp.id('611');
DO $$
BEGIN
  PERFORM pg_temp.expect_eq(
    public.attach_cart_spot_holds(pg_temp.id('611'), pg_temp.id('924'), 'cs_test_1012_new',
                                  now() + interval '31 minutes')::text,
    '1', 'H10 the newer attempt ties its hold to its page');
  PERFORM pg_temp.expect_eq(
    public.release_cart_spot_holds(pg_temp.id('611'), pg_temp.id('923'))::text,
    '1', 'H10 the earlier attempt''s late failure releases only its own hold');
  PERFORM pg_temp.expect_eq(pg_temp.live_holds(pg_temp.id('611')), '712:cs_test_1012_new',
    'H10 the newer attempt''s page keeps its spot');
  PERFORM pg_temp.expect_eq(
    public.attach_cart_spot_holds(pg_temp.id('611'), pg_temp.id('923'), 'cs_test_1012_new',
                                  now() + interval '31 minutes')::text,
    '0', 'H10 attach never adopts another attempt''s holds');
  -- An attempt whose 5 minutes ran out before attach gets nothing back.
  PERFORM public.hold_cart_spots(pg_temp.id('611'), pg_temp.id('925'), now() + interval '31 minutes');
  UPDATE public.cart_spot_holds h SET expires_at = now() - interval '1 second'
   WHERE h.attempt_id = pg_temp.id('925');
  PERFORM pg_temp.expect_eq(
    public.attach_cart_spot_holds(pg_temp.id('611'), pg_temp.id('925'), 'cs_test_1012_new',
                                  now() + interval '31 minutes')::text,
    '0', 'H10 attach never revives an expired hold');
END;
$$;
RESET ROLE;

ROLLBACK;
