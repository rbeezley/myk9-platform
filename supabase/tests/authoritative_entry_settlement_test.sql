-- Behavioral contract for MYK9-639 authoritative payment settlement.
-- Run against a fully migrated local database with psql -X -v ON_ERROR_STOP=1.
-- The transaction rolls back every fixture and payment row.

BEGIN;
-- MYK9-639-RACE-SETUP-BEGIN: the concurrency runner reuses this fixture setup.
INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000639701', 'MYK9-639 settlement club');
INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES ('00000000-0000-0000-0000-000000639702', 'MYK9-639 settlement show', 'AKC',
        current_date + 10, current_date + 11, '00000000-0000-0000-0000-000000639701', 'published');
INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type)
VALUES ('00000000-0000-0000-0000-000000639703', '00000000-0000-0000-0000-000000639702',
        'MYK9-639 settlement trial', current_date + 10, 'AKC', 'Scent Work');
INSERT INTO public.classes (id, trial_id, name, element, level)
VALUES
  ('00000000-0000-0000-0000-000000639704', '00000000-0000-0000-0000-000000639703',
   'MYK9-639 settlement class', 'Container', 'Novice'),
  ('00000000-0000-0000-0000-000000639711', '00000000-0000-0000-0000-000000639703',
   'MYK9-639 waitlist class', 'Interior', 'Novice'),
  ('00000000-0000-0000-0000-000000639713', '00000000-0000-0000-0000-000000639703',
   'MYK9-639 denial class', 'Exterior', 'Novice'),
  ('00000000-0000-0000-0000-000000639716', '00000000-0000-0000-0000-000000639703',
   'MYK9-639 recovered cart class', 'Buried', 'Novice');
UPDATE public.classes SET max_entries = 1, allow_waitlist = true
 WHERE id = '00000000-0000-0000-0000-000000639711';
UPDATE public.classes SET max_entries = 1, allow_waitlist = false
 WHERE id = '00000000-0000-0000-0000-000000639713';
INSERT INTO public.dogs (id, name, call_name, breed, status)
VALUES
  ('00000000-0000-0000-0000-000000639705', 'MYK9-639 Settlement Dog', 'Dog', 'Beagle', 'active'),
  ('00000000-0000-0000-0000-000000639710', 'MYK9-639 Cart Dog', 'Cart', 'Beagle', 'active'),
  ('00000000-0000-0000-0000-000000639730', 'MYK9-639 Mismatched Dog', 'Mismatch', 'Beagle', 'active'),
  ('00000000-0000-0000-0000-000000639760', 'MYK9-639 Capacity Dog', 'Capacity', 'Beagle', 'active');
INSERT INTO public.dog_registrations (dog_id, organization, registration_number, is_primary)
VALUES
  ('00000000-0000-0000-0000-000000639705', 'AKC', 'SR6397001', true),
  ('00000000-0000-0000-0000-000000639710', 'AKC', 'SR6397002', true),
  ('00000000-0000-0000-0000-000000639730', 'AKC', 'SR6397003', true),
  ('00000000-0000-0000-0000-000000639760', 'AKC', 'SR6397004', true);
INSERT INTO public.people (id, first_name, last_name, email)
VALUES ('00000000-0000-0000-0000-000000639721', 'MYK9-639', 'Cart Exhibitor',
        'myk9-639-settlement-cart@example.test');
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
) VALUES (
  '00000000-0000-0000-0000-000000639722',
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'myk9-639-settlement-cart@example.test', '', now(), now(), now(), '{}', '{}', false, false, false
);
-- The auth.users trigger adopts the matching person and creates the profile.
-- Give that generated profile the stable fixture ID before any cart references it.
UPDATE public.exhibitor_profiles SET id = '00000000-0000-0000-0000-000000639723'
 WHERE person_id = '00000000-0000-0000-0000-000000639721'
   AND auth_user_id = '00000000-0000-0000-0000-000000639722';

SET LOCAL ROLE service_role;
INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, moved_from_entry_id,
  entry_status, payment_status, payment_method, entry_fee
) VALUES
  ('00000000-0000-0000-0000-000000639706', '00000000-0000-0000-0000-000000639705',
   '00000000-0000-0000-0000-000000639704', '00000000-0000-0000-0000-000000639702',
   '00000000-0000-0000-0000-000000639703', NULL, 'moved', 'pending', 'online', 35),
  ('00000000-0000-0000-0000-000000639707', '00000000-0000-0000-0000-000000639705',
   '00000000-0000-0000-0000-000000639704', '00000000-0000-0000-0000-000000639702',
   '00000000-0000-0000-0000-000000639703', '00000000-0000-0000-0000-000000639706', 'moved', 'pending', NULL, 0),
  ('00000000-0000-0000-0000-000000639708', '00000000-0000-0000-0000-000000639705',
   '00000000-0000-0000-0000-000000639704', '00000000-0000-0000-0000-000000639702',
   '00000000-0000-0000-0000-000000639703', '00000000-0000-0000-0000-000000639707', 'confirmed', 'pending', NULL, 0);
INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, entry_status, payment_status, payment_method, entry_fee
) VALUES
  ('00000000-0000-0000-0000-000000639712', '00000000-0000-0000-0000-000000639705',
   '00000000-0000-0000-0000-000000639711', '00000000-0000-0000-0000-000000639702',
   '00000000-0000-0000-0000-000000639703', 'confirmed', 'paid', 'check', 35),
  ('00000000-0000-0000-0000-000000639714', '00000000-0000-0000-0000-000000639705',
   '00000000-0000-0000-0000-000000639713', '00000000-0000-0000-0000-000000639702',
   '00000000-0000-0000-0000-000000639703', 'confirmed', 'paid', 'check', 35),
  ('00000000-0000-0000-0000-000000639715', '00000000-0000-0000-0000-000000639705',
   '00000000-0000-0000-0000-000000639716', '00000000-0000-0000-0000-000000639702',
   '00000000-0000-0000-0000-000000639703', 'pending-payment', 'pending', 'check', 35),
  ('00000000-0000-0000-0000-000000639731', '00000000-0000-0000-0000-000000639705',
   '00000000-0000-0000-0000-000000639704', '00000000-0000-0000-0000-000000639702',
   '00000000-0000-0000-0000-000000639703', 'moved', 'pending', 'online', 35),
  ('00000000-0000-0000-0000-000000639732', '00000000-0000-0000-0000-000000639730',
   '00000000-0000-0000-0000-000000639704', '00000000-0000-0000-0000-000000639702',
   '00000000-0000-0000-0000-000000639703', 'confirmed', 'pending', NULL, 0);
UPDATE public.entries SET moved_from_entry_id = '00000000-0000-0000-0000-000000639731'
 WHERE id = '00000000-0000-0000-0000-000000639732';
INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, entry_status, payment_status, payment_method, entry_fee
) VALUES (
  '00000000-0000-0000-0000-000000639735', '00000000-0000-0000-0000-000000639730',
  '00000000-0000-0000-0000-000000639716', '00000000-0000-0000-0000-000000639702',
  '00000000-0000-0000-0000-000000639703', 'confirmed', 'pending', 'check', 35
);
INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, entry_status, payment_status, payment_method, entry_fee
) VALUES (
  '00000000-0000-0000-0000-000000639747', '00000000-0000-0000-0000-000000639730',
  '00000000-0000-0000-0000-000000639711', '00000000-0000-0000-0000-000000639702',
  '00000000-0000-0000-0000-000000639703', 'promotion-expired', 'pending', 'online', 35
);
INSERT INTO public.waitlist_entries (
  id, class_id, exhibitor_id, dog_id, position, status, promoted_entry_id
) VALUES (
  '00000000-0000-0000-0000-000000639748', '00000000-0000-0000-0000-000000639711',
  '00000000-0000-0000-0000-000000639723', '00000000-0000-0000-0000-000000639730',
  2, 'expired', '00000000-0000-0000-0000-000000639747'
);
INSERT INTO public.waitlist_entries (
  id, class_id, exhibitor_id, dog_id, position, status, promoted_entry_id,
  offered_at, offer_expires_at
) VALUES (
  '00000000-0000-0000-0000-000000639750', '00000000-0000-0000-0000-000000639716',
  '00000000-0000-0000-0000-000000639723', '00000000-0000-0000-0000-000000639705',
  1, 'offered', '00000000-0000-0000-0000-000000639715', now(), now() + interval '1 day'
);
INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, entry_status, payment_status, payment_method, entry_fee
) VALUES (
  '00000000-0000-0000-0000-000000639752', '00000000-0000-0000-0000-000000639730',
  '00000000-0000-0000-0000-000000639716', '00000000-0000-0000-0000-000000639702',
  '00000000-0000-0000-0000-000000639703', 'promotion-expired', 'pending', 'online', 35
);
INSERT INTO public.waitlist_entries (
  id, class_id, exhibitor_id, dog_id, position, status, promoted_entry_id
) VALUES
  ('00000000-0000-0000-0000-000000639753', '00000000-0000-0000-0000-000000639716',
   '00000000-0000-0000-0000-000000639723', '00000000-0000-0000-0000-000000639730',
   3, 'expired', '00000000-0000-0000-0000-000000639752');
INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, moved_from_entry_id,
  entry_status, payment_status, entry_fee, deleted_at
) VALUES (
  '00000000-0000-0000-0000-000000639736', '00000000-0000-0000-0000-000000639730',
  '00000000-0000-0000-0000-000000639704', '00000000-0000-0000-0000-000000639702',
  '00000000-0000-0000-0000-000000639703', '00000000-0000-0000-0000-000000639735',
  'confirmed', 'pending', 0, now()
);
INSERT INTO public.entry_carts (
  id, exhibitor_id, show_id, status, stripe_checkout_session_id,
  subtotal_cents, platform_fee_cents, total_cents
) VALUES (
  '00000000-0000-0000-0000-000000639724', '00000000-0000-0000-0000-000000639723',
  '00000000-0000-0000-0000-000000639702', 'active', 'cs_639_mixed_cart', 14000, 980, 14980
);
INSERT INTO public.entry_cart_items (id, cart_id, dog_id, class_id, entry_id, entry_fee_cents)
VALUES
  ('00000000-0000-0000-0000-000000639725', '00000000-0000-0000-0000-000000639724',
   '00000000-0000-0000-0000-000000639705', '00000000-0000-0000-0000-000000639716',
   '00000000-0000-0000-0000-000000639715', 3500),
  ('00000000-0000-0000-0000-000000639726', '00000000-0000-0000-0000-000000639724',
   '00000000-0000-0000-0000-000000639710', '00000000-0000-0000-0000-000000639716', NULL, 3500),
  ('00000000-0000-0000-0000-000000639727', '00000000-0000-0000-0000-000000639724',
   '00000000-0000-0000-0000-000000639710', '00000000-0000-0000-0000-000000639711', NULL, 3500),
  ('00000000-0000-0000-0000-000000639728', '00000000-0000-0000-0000-000000639724',
   '00000000-0000-0000-0000-000000639710', '00000000-0000-0000-0000-000000639713', NULL, 3500);

INSERT INTO public.entry_payment_links (
  id, show_id, entry_ids, stripe_checkout_session_id, status,
  amount_cents, entry_fee_snapshot, platform_fee_cents
) VALUES (
  '00000000-0000-0000-0000-000000639709', '00000000-0000-0000-0000-000000639702',
  ARRAY['00000000-0000-0000-0000-000000639706'::uuid], 'cs_639_authoritative', 'open',
  3500, '[{"entry_id":"00000000-0000-0000-0000-000000639706","amount_cents":3500}]', 245
);
INSERT INTO public.entry_payment_links (
  id, show_id, entry_ids, stripe_checkout_session_id, status,
  amount_cents, entry_fee_snapshot, platform_fee_cents
) VALUES
  ('00000000-0000-0000-0000-000000639733', '00000000-0000-0000-0000-000000639702',
   ARRAY['00000000-0000-0000-0000-000000639706'::uuid,
         '00000000-0000-0000-0000-000000639708'::uuid], 'cs_639_duplicate_root', 'open',
   7000, '[{"entry_id":"00000000-0000-0000-0000-000000639706","amount_cents":3500},
          {"entry_id":"00000000-0000-0000-0000-000000639708","amount_cents":3500}]', 490),
  ('00000000-0000-0000-0000-000000639734', '00000000-0000-0000-0000-000000639702',
   ARRAY['00000000-0000-0000-0000-000000639731'::uuid], 'cs_639_wrong_dog', 'open',
   3500, '[{"entry_id":"00000000-0000-0000-0000-000000639731","amount_cents":3500}]', 245),
  ('00000000-0000-0000-0000-000000639737', '00000000-0000-0000-0000-000000639702',
   ARRAY['00000000-0000-0000-0000-000000639735'::uuid], 'cs_639_reversed_move', 'open',
   3500, '[{"entry_id":"00000000-0000-0000-0000-000000639735","amount_cents":3500}]', 245),
  ('00000000-0000-0000-0000-000000639749', '00000000-0000-0000-0000-000000639702',
   ARRAY['00000000-0000-0000-0000-000000639747'::uuid], 'cs_639_expired_promotion', 'expired',
   3500, '[{"entry_id":"00000000-0000-0000-0000-000000639747","amount_cents":3500}]', 245);

-- MYK9-639-RACE-SETUP-END
DO $$
DECLARE
  v_result record;
  v_status text;
  v_method text;
  v_error boolean;
  v_order public.stripe_orders%ROWTYPE;
  v_quote record;
  v_facts jsonb := jsonb_build_object(
    'customer_id', NULL, 'currency', 'usd', 'paid_at', now(),
    'stripe_processing_fee_cents', NULL, 'platform_fee_rate', 7,
    'platform_fee_flat_cents', 0, 'platform_fee_min_cents', 0,
    -- These caller claims are malicious metadata and must not affect lineage.
    'moneyRootEntryId', '00000000-0000-0000-0000-000000000001',
    'liveEntryId', '00000000-0000-0000-0000-000000000002'
  );
BEGIN
  SELECT * INTO STRICT v_quote FROM public.quote_entry_payment_lineage(
    '00000000-0000-0000-0000-000000639706'
  );
  IF v_quote.money_root_entry_id <> '00000000-0000-0000-0000-000000639706'::uuid
     OR v_quote.live_entry_id <> '00000000-0000-0000-0000-000000639708'::uuid
     OR v_quote.entry_fee_cents <> 3500 THEN
    RAISE EXCEPTION 'FAIL issuance quote did not return original root amount and live identity';
  END IF;

  -- A link that charges both the root and its descendant cannot charge the
  -- same money root twice. The first stamp inside the call must roll back.
  v_error := false;
  BEGIN
    PERFORM * FROM public.settle_entry_order(
      'payment_link', '00000000-0000-0000-0000-000000639733', v_facts,
      7490, 'cs_639_duplicate_root', 'pi_639_duplicate_root',
      '[{"lineId":"00000000-0000-0000-0000-000000639706","priceCents":3500},
        {"lineId":"00000000-0000-0000-0000-000000639708","priceCents":3500}]'
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN v_error := true;
  END;
  IF NOT v_error OR (SELECT payment_status FROM public.entries
       WHERE id = '00000000-0000-0000-0000-000000639706') <> 'pending'
     OR EXISTS (SELECT 1 FROM public.stripe_orders
       WHERE stripe_checkout_session_id = 'cs_639_duplicate_root') THEN
    RAISE EXCEPTION 'FAIL duplicate root+live source did not roll back atomically';
  END IF;

  -- Same-show but wrong-dog ancestry is invalid even though the caller only
  -- names the persisted root line.
  v_error := false;
  BEGIN
    PERFORM * FROM public.settle_entry_order(
      'payment_link', '00000000-0000-0000-0000-000000639734', v_facts,
      3745, 'cs_639_wrong_dog', 'pi_639_wrong_dog',
      '[{"lineId":"00000000-0000-0000-0000-000000639731","priceCents":3500}]'
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN v_error := true;
  END;
  IF NOT v_error OR (SELECT payment_status FROM public.entries
       WHERE id = '00000000-0000-0000-0000-000000639731') <> 'pending' THEN
    RAISE EXCEPTION 'FAIL same-show wrong-dog lineage was accepted or partially stamped';
  END IF;

  -- A soft-deleted successor alone is not a valid reversal. Until the source
  -- status is restored, a moved row is still superseded and cannot be paid.
  UPDATE public.entries SET entry_status = 'moved'
   WHERE id = '00000000-0000-0000-0000-000000639735';
  v_error := false;
  BEGIN
    PERFORM * FROM public.quote_entry_payment_lineage(
      '00000000-0000-0000-0000-000000639735'
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN v_error := true;
  END;
  IF NOT v_error THEN
    RAISE EXCEPTION 'FAIL a superseded leaf with a soft-deleted successor was quoted';
  END IF;
  v_error := false;
  BEGIN
    PERFORM * FROM public.settle_entry_order(
      'payment_link', '00000000-0000-0000-0000-000000639737', v_facts,
      3745, 'cs_639_reversed_move', 'pi_639_reversed_move',
      '[{"lineId":"00000000-0000-0000-0000-000000639735","priceCents":3500}]'
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN v_error := true;
  END;
  IF NOT v_error OR EXISTS (SELECT 1 FROM public.stripe_orders
       WHERE stripe_checkout_session_id = 'cs_639_reversed_move') THEN
    RAISE EXCEPTION 'FAIL a superseded leaf was paid without a live service row';
  END IF;

  -- A completed reversal restores the original money row as the live service
  -- identity; its soft-deleted successor does not make the chain ambiguous.
  UPDATE public.entries SET entry_status = 'confirmed'
   WHERE id = '00000000-0000-0000-0000-000000639735';
  SELECT * INTO STRICT v_result FROM public.settle_entry_order(
    'payment_link', '00000000-0000-0000-0000-000000639737', v_facts,
    3745, 'cs_639_reversed_move', 'pi_639_reversed_move',
    '[{"lineId":"00000000-0000-0000-0000-000000639735","priceCents":3500}]'
  );
  IF v_result.canonical_entry_ids <> ARRAY['00000000-0000-0000-0000-000000639735'::uuid] THEN
    RAISE EXCEPTION 'FAIL a reversed move-up did not restore the money root as the live service entry';
  END IF;

  -- A charged expired promotion remains payable only while the matching offer
  -- row is expired and no replacement offer exists for its class.
  PERFORM * FROM public.quote_entry_payment_lineage(
    '00000000-0000-0000-0000-000000639747', true
  );
  SELECT * INTO STRICT v_result FROM public.settle_entry_order(
    'payment_link', '00000000-0000-0000-0000-000000639749', v_facts,
    3745, 'cs_639_expired_promotion', 'pi_639_expired_promotion',
    '[{"lineId":"00000000-0000-0000-0000-000000639747","priceCents":3500}]'
  );
  IF (SELECT entry_status FROM public.entries WHERE id = '00000000-0000-0000-0000-000000639747') <> 'confirmed'
     OR (SELECT status FROM public.entry_payment_links WHERE id = '00000000-0000-0000-0000-000000639749') <> 'paid' THEN
    RAISE EXCEPTION 'FAIL eligible expired promotion did not settle and reactivate atomically';
  END IF;
  v_error := false;
  BEGIN
    PERFORM * FROM public.quote_entry_payment_lineage(
      '00000000-0000-0000-0000-000000639752', true
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN v_error := true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL expired promotion with replacement offer was quoted'; END IF;

  -- Price drift / wrong amount: no entry or source state is written.
  v_error := false;
  BEGIN
    PERFORM * FROM public.settle_entry_order(
      'payment_link', '00000000-0000-0000-0000-000000639709', v_facts,
      3745, 'cs_639_authoritative', 'pi_639_authoritative',
      '[{"lineId":"00000000-0000-0000-0000-000000639706","priceCents":3499}]'
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN v_error := true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL repriced line was accepted'; END IF;

  -- Omitted line and duplicated/extra line evidence both fail closed.
  v_error := false;
  BEGIN
    PERFORM * FROM public.settle_entry_order(
      'payment_link', '00000000-0000-0000-0000-000000639709', v_facts,
      3745, 'cs_639_authoritative', 'pi_639_authoritative', '[]'
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN v_error := true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL omitted source line was accepted'; END IF;
  v_error := false;
  BEGIN
    PERFORM * FROM public.settle_entry_order(
      'payment_link', '00000000-0000-0000-0000-000000639709', v_facts,
      3745, 'cs_639_authoritative', 'pi_639_authoritative',
      '[{"lineId":"00000000-0000-0000-0000-000000639706","priceCents":3500},{"lineId":"00000000-0000-0000-0000-000000639706","priceCents":3500}]'
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN v_error := true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL duplicate source line was accepted'; END IF;
  v_error := false;
  BEGIN
    PERFORM * FROM public.settle_entry_order(
      'payment_link', '00000000-0000-0000-0000-000000639709', v_facts,
      3745, 'cs_639_authoritative', 'pi_639_authoritative',
      '[{"lineId":"00000000-0000-0000-0000-000000639001","priceCents":3500}]'
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN v_error := true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL an extra unknown Stripe source line was accepted'; END IF;
  SELECT payment_status, payment_method INTO STRICT v_status, v_method
    FROM public.entries WHERE id = '00000000-0000-0000-0000-000000639706';
  IF v_status <> 'pending' OR v_method IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.stripe_orders WHERE stripe_checkout_session_id = 'cs_639_authoritative'
  ) THEN RAISE EXCEPTION 'FAIL rejected evidence left partial settlement state'; END IF;

  -- Exact evidence succeeds. The output and persisted order use the database's
  -- root/live graph despite the forged ID fields in p_order_facts.
  SELECT * INTO STRICT v_result FROM public.settle_entry_order(
    'payment_link', '00000000-0000-0000-0000-000000639709', v_facts,
    3745, 'cs_639_authoritative', 'pi_639_authoritative',
    '[{"lineId":"00000000-0000-0000-0000-000000639706","priceCents":3500}]'
  );
  IF v_result.canonical_entry_ids <> ARRAY['00000000-0000-0000-0000-000000639708'::uuid]
     OR v_result.line_results->0->>'moneyRootEntryId' <> '00000000-0000-0000-0000-000000639706' THEN
    RAISE EXCEPTION 'FAIL settlement trusted caller lineage instead of the database graph';
  END IF;
  SELECT * INTO STRICT v_order FROM public.stripe_orders WHERE id = v_result.order_id;
  IF v_order.entry_ids <> ARRAY['00000000-0000-0000-0000-000000639708'::uuid]
     OR v_order.entry_subtotal_cents <> 3500 OR v_order.platform_fee_cents <> 245
     OR v_result.expected_make_whole_refund_cents <> 0
     OR (v_order.metadata->>'expected_make_whole_refund_cents')::integer <> 0
     OR v_order.metadata ? 'moneyRootEntryId' OR v_order.metadata ? 'liveEntryId' THEN
    RAISE EXCEPTION 'FAIL persisted order gross, fee, or make-whole snapshot does not tie';
  END IF;
  IF (SELECT payment_status FROM public.entries WHERE id = '00000000-0000-0000-0000-000000639706') <> 'paid'
     OR (SELECT stripe_payment_intent_id FROM public.entries WHERE id = '00000000-0000-0000-0000-000000639706') <> 'pi_639_authoritative'
     OR (SELECT status FROM public.entry_payment_links WHERE id = '00000000-0000-0000-0000-000000639709') <> 'paid' THEN
    RAISE EXCEPTION 'FAIL root, payment-link, and order did not settle atomically';
  END IF;

  -- Same Session/PI returns the committed result. A different PI on the same
  -- source is rejected, even though its Stripe Session is fresh.
  SELECT * INTO STRICT v_result FROM public.settle_entry_order(
    'payment_link', '00000000-0000-0000-0000-000000639709', v_facts,
    3745, 'cs_639_authoritative', 'pi_639_authoritative',
    '[{"lineId":"00000000-0000-0000-0000-000000639706","priceCents":3500}]'
  );
  IF v_result.order_id IS DISTINCT FROM v_order.id THEN
    RAISE EXCEPTION 'FAIL same-session retry did not return its stored order';
  END IF;
  v_error := false;
  BEGIN
    PERFORM * FROM public.settle_entry_order(
      'payment_link', '00000000-0000-0000-0000-000000639709', v_facts,
      3745, 'cs_639_second', 'pi_639_second',
      '[{"lineId":"00000000-0000-0000-0000-000000639706","priceCents":3500}]'
    );
  EXCEPTION WHEN unique_violation THEN v_error := true;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'FAIL a second PaymentIntent settled one source twice'; END IF;
  RAISE NOTICE 'PASS source line evidence, database lineage, financial tie, retry, and one-PI invariant';
END;
$$;

DO $$
DECLARE
  v_result record;
  v_order public.stripe_orders%ROWTYPE;
  v_outcomes jsonb;
BEGIN
  SELECT * INTO STRICT v_result FROM public.settle_entry_order(
    'cart', '00000000-0000-0000-0000-000000639724',
    jsonb_build_object('customer_id', NULL, 'currency', 'usd', 'paid_at', now(),
      'stripe_processing_fee_cents', NULL, 'platform_fee_rate', 7,
      'platform_fee_flat_cents', 0, 'platform_fee_min_cents', 0),
    14980, 'cs_639_mixed_cart', 'pi_639_mixed_cart',
    '[{"lineId":"00000000-0000-0000-0000-000000639725","priceCents":3500},
      {"lineId":"00000000-0000-0000-0000-000000639726","priceCents":3500},
      {"lineId":"00000000-0000-0000-0000-000000639727","priceCents":3500},
      {"lineId":"00000000-0000-0000-0000-000000639728","priceCents":3500}]'
  );
  v_outcomes := v_result.line_results;
  IF cardinality(v_result.canonical_entry_ids) <> 2
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_outcomes) AS line(value)
       WHERE line.value->>'lineId' = '00000000-0000-0000-0000-000000639727'
         AND line.value->>'outcome' = 'waitlisted')
     OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_outcomes) AS line(value)
       WHERE line.value->>'lineId' = '00000000-0000-0000-0000-000000639728'
         AND line.value->>'outcome' = 'denied') THEN
    RAISE EXCEPTION 'FAIL mixed cart did not preserve accepted, waitlisted, and denied outcomes';
  END IF;
  SELECT * INTO STRICT v_order FROM public.stripe_orders WHERE id = v_result.order_id;
  IF v_order.entry_subtotal_cents <> 7000 OR v_order.platform_fee_cents <> 490
     OR v_result.expected_make_whole_refund_cents <> 7490
     OR (v_order.metadata->>'expected_make_whole_refund_cents')::integer <> 7490
     OR v_order.metadata->'overflow_refund'->>'reason' <> 'partial_no_service_lines'
     OR (v_order.metadata->'overflow_refund'->>'amount_cents')::integer <> 7490
     OR (v_order.metadata->'overflow_refund'->>'paid_amount_cents')::integer <> 7490
     OR (SELECT status FROM public.entry_carts WHERE id = '00000000-0000-0000-0000-000000639724') <> 'submitted'
     OR (SELECT entry_status FROM public.entries WHERE id = '00000000-0000-0000-0000-000000639715') <> 'confirmed'
     OR (SELECT status FROM public.waitlist_entries WHERE id = '00000000-0000-0000-0000-000000639750') <> 'accepted'
     OR (SELECT stripe_payment_intent_id FROM public.entries WHERE id = '00000000-0000-0000-0000-000000639715') <> 'pi_639_mixed_cart' THEN
    RAISE EXCEPTION 'FAIL mixed cart order/refund snapshot or source state does not tie';
  END IF;
  RAISE NOTICE 'PASS mixed cart atomic recovery, capacity outcomes, and make-whole arithmetic';
END;
$$;

INSERT INTO public.entry_carts (
  id, exhibitor_id, show_id, status, stripe_checkout_session_id,
  subtotal_cents, platform_fee_cents, total_cents
) VALUES (
  '00000000-0000-0000-0000-000000639743', '00000000-0000-0000-0000-000000639723',
  '00000000-0000-0000-0000-000000639702', 'active', 'cs_639_wrong_class', 3500, 245, 3745
);
INSERT INTO public.entry_cart_items (id, cart_id, dog_id, class_id, entry_id, entry_fee_cents)
VALUES ('00000000-0000-0000-0000-000000639744', '00000000-0000-0000-0000-000000639743',
  '00000000-0000-0000-0000-000000639705', '00000000-0000-0000-0000-000000639704',
  '00000000-0000-0000-0000-000000639715', 3500);
DO $$
DECLARE v_error boolean := false;
BEGIN
  BEGIN
    PERFORM * FROM public.settle_entry_order(
      'cart', '00000000-0000-0000-0000-000000639743',
      jsonb_build_object('platform_fee_rate', 7, 'platform_fee_flat_cents', 0,
        'platform_fee_min_cents', 0, 'currency', 'usd'),
      3745, 'cs_639_wrong_class', 'pi_639_wrong_class',
      '[{"lineId":"00000000-0000-0000-0000-000000639744","priceCents":3500}]'
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN v_error := true;
  END;
  IF NOT v_error OR EXISTS (SELECT 1 FROM public.stripe_orders
       WHERE stripe_checkout_session_id = 'cs_639_wrong_class') THEN
    RAISE EXCEPTION 'FAIL same-show wrong-class recovered cart line was accepted';
  END IF;
  RAISE NOTICE 'PASS same-show wrong-class source rejection';
END;
$$;

INSERT INTO public.shows (id, name, organization, start_date, end_date, club_id, status)
VALUES ('00000000-0000-0000-0000-000000639740', 'MYK9-639 other show', 'AKC',
        current_date + 20, current_date + 21, '00000000-0000-0000-0000-000000639701', 'draft');
INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type)
VALUES ('00000000-0000-0000-0000-000000639741', '00000000-0000-0000-0000-000000639740',
        'MYK9-639 other trial', current_date + 20, 'AKC', 'Scent Work');
INSERT INTO public.classes (id, trial_id, name, element, level)
VALUES ('00000000-0000-0000-0000-000000639742', '00000000-0000-0000-0000-000000639741',
        'MYK9-639 other-show class', 'Container', 'Novice');
INSERT INTO public.entry_carts (
  id, exhibitor_id, show_id, status, stripe_checkout_session_id,
  subtotal_cents, platform_fee_cents, total_cents
) VALUES (
  '00000000-0000-0000-0000-000000639745', '00000000-0000-0000-0000-000000639723',
  '00000000-0000-0000-0000-000000639740', 'active', 'cs_639_wrong_show', 3500, 245, 3745
);
INSERT INTO public.entry_cart_items (id, cart_id, dog_id, class_id, entry_id, entry_fee_cents)
VALUES ('00000000-0000-0000-0000-000000639746', '00000000-0000-0000-0000-000000639745',
  '00000000-0000-0000-0000-000000639705', '00000000-0000-0000-0000-000000639742',
  '00000000-0000-0000-0000-000000639715', 3500);
DO $$
DECLARE v_error boolean := false;
BEGIN
  BEGIN
    PERFORM * FROM public.settle_entry_order(
      'cart', '00000000-0000-0000-0000-000000639745',
      jsonb_build_object('platform_fee_rate', 7, 'platform_fee_flat_cents', 0,
        'platform_fee_min_cents', 0, 'currency', 'usd'),
      3745, 'cs_639_wrong_show', 'pi_639_wrong_show',
      '[{"lineId":"00000000-0000-0000-0000-000000639746","priceCents":3500}]'
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN v_error := true;
  END;
  IF NOT v_error OR EXISTS (SELECT 1 FROM public.stripe_orders
       WHERE stripe_checkout_session_id = 'cs_639_wrong_show') THEN
    RAISE EXCEPTION 'FAIL cross-show recovered cart line was accepted';
  END IF;
  RAISE NOTICE 'PASS cross-show source rejection';
END;
$$;
RESET ROLE;
ROLLBACK;
