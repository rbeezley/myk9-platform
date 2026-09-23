-- Verify the exact legacy checkout-status serializer for a fully make-whole cart.
BEGIN;
INSERT INTO public.clubs (id, name)
VALUES ('00000000-0000-0000-0000-000000639801', 'MYK9-639 refund club');
INSERT INTO public.shows (id, name, type, organization, start_date, end_date, club_id, status)
VALUES ('00000000-0000-0000-0000-000000639802', 'MYK9-639 refund show', 'Scent Work Trial', 'AKC',
        current_date + 10, current_date + 11, '00000000-0000-0000-0000-000000639801', 'published');
INSERT INTO public.trials (id, show_id, name, date, registry_id, trial_type)
VALUES ('00000000-0000-0000-0000-000000639803', '00000000-0000-0000-0000-000000639802',
        'MYK9-639 refund trial', current_date + 10, 'AKC', 'Scent Work');
INSERT INTO public.classes (id, trial_id, name, element, level, max_entries, allow_waitlist)
VALUES
  ('00000000-0000-0000-0000-000000639804', '00000000-0000-0000-0000-000000639803',
   'MYK9-639 waitlist class', 'Container', 'Novice', 1, true),
  ('00000000-0000-0000-0000-000000639805', '00000000-0000-0000-0000-000000639803',
   'MYK9-639 denial class', 'Interior', 'Novice', 1, false);
INSERT INTO public.dogs (id, name, breed, status)
VALUES
  ('00000000-0000-0000-0000-000000639806', 'MYK9-639 Full Dog', 'Beagle', 'active'),
  ('00000000-0000-0000-0000-000000639807', 'MYK9-639 Cart Dog', 'Beagle', 'active');
INSERT INTO public.dog_registrations (dog_id, organization, registration_number)
VALUES
  ('00000000-0000-0000-0000-000000639806', 'AKC', 'SR6398001'),
  ('00000000-0000-0000-0000-000000639807', 'AKC', 'SR6398002');
INSERT INTO public.people (id, first_name, last_name)
VALUES ('00000000-0000-0000-0000-000000639808', 'MYK9-639', 'Refund Exhibitor');
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, is_sso_user, is_anonymous
) VALUES (
  '00000000-0000-0000-0000-000000639809', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'myk9-639-refund@example.test', '', now(), now(), now(), '{}', '{}',
  false, false, false
);
INSERT INTO public.exhibitor_profiles (id, person_id, auth_user_id)
VALUES ('00000000-0000-0000-0000-000000639810',
        '00000000-0000-0000-0000-000000639808', '00000000-0000-0000-0000-000000639809');

SET LOCAL ROLE service_role;
INSERT INTO public.entries (
  id, dog_id, class_id, show_id, trial_id, entry_status, payment_status, payment_method, entry_fee
) VALUES
  ('00000000-0000-0000-0000-000000639811', '00000000-0000-0000-0000-000000639806',
   '00000000-0000-0000-0000-000000639804', '00000000-0000-0000-0000-000000639802',
   '00000000-0000-0000-0000-000000639803', 'confirmed', 'paid', 'check', 35),
  ('00000000-0000-0000-0000-000000639812', '00000000-0000-0000-0000-000000639806',
   '00000000-0000-0000-0000-000000639805', '00000000-0000-0000-0000-000000639802',
   '00000000-0000-0000-0000-000000639803', 'confirmed', 'paid', 'check', 35);
INSERT INTO public.entry_carts (
  id, exhibitor_id, show_id, status, stripe_checkout_session_id,
  subtotal_cents, platform_fee_cents, total_cents
) VALUES (
  '00000000-0000-0000-0000-000000639813', '00000000-0000-0000-0000-000000639810',
  '00000000-0000-0000-0000-000000639802', 'active', 'cs_639_full_refund', 7000, 490, 7490
);
INSERT INTO public.entry_cart_items (id, cart_id, dog_id, class_id, entry_fee_cents)
VALUES
  ('00000000-0000-0000-0000-000000639814', '00000000-0000-0000-0000-000000639813',
   '00000000-0000-0000-0000-000000639807', '00000000-0000-0000-0000-000000639804', 3500),
  ('00000000-0000-0000-0000-000000639815', '00000000-0000-0000-0000-000000639813',
   '00000000-0000-0000-0000-000000639807', '00000000-0000-0000-0000-000000639805', 3500);

DO $$
DECLARE
  v_result record;
  v_order public.stripe_orders%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_result FROM public.settle_entry_order(
    'cart', '00000000-0000-0000-0000-000000639813',
    jsonb_build_object('currency', 'usd', 'platform_fee_rate', 7,
      'platform_fee_flat_cents', 0, 'platform_fee_min_cents', 0),
    7490, 'cs_639_full_refund', 'pi_639_full_refund',
    '[{"lineId":"00000000-0000-0000-0000-000000639814","priceCents":3500},
      {"lineId":"00000000-0000-0000-0000-000000639815","priceCents":3500}]'
  );
  SELECT * INTO STRICT v_order FROM public.stripe_orders WHERE id = v_result.order_id;
  IF cardinality(v_result.canonical_entry_ids) <> 0
     OR v_result.expected_make_whole_refund_cents <> 7490
     OR v_order.metadata->'overflow_refund'->>'action' <> 'refund'
     OR v_order.metadata->'overflow_refund'->>'reason' <> 'full_make_whole'
     OR (v_order.metadata->'overflow_refund'->>'amount_cents')::integer <> 7490
     OR (v_order.metadata->'overflow_refund'->>'paid_amount_cents')::integer <> 0 THEN
    RAISE EXCEPTION 'FAIL full-overflow checkout serializer does not match getFullOverflowRefund';
  END IF;
  RAISE NOTICE 'PASS legacy full-overflow refund metadata contract';
END;
$$;
RESET ROLE;
ROLLBACK;
