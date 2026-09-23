-- MYK9-639: one database transaction owns the entry-payment settlement.
-- The caller supplies freshly retrieved Stripe facts and line-price evidence;
-- source membership, fees, move-up roots, and live service IDs come from rows.

BEGIN;

ALTER TABLE public.entry_payment_links
  ADD COLUMN IF NOT EXISTS entry_fee_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS platform_fee_cents integer
    CHECK (platform_fee_cents IS NULL OR platform_fee_cents >= 0);

COMMENT ON COLUMN public.entry_payment_links.entry_fee_snapshot IS
  'Immutable issuance-time entry line snapshot [{entry_id, amount_cents}]. NULL legacy links cannot be settled by the authoritative RPC.';

CREATE OR REPLACE FUNCTION public.settle_entry_order(
  p_source_kind text,
  p_source_id uuid,
  p_order_facts jsonb,
  p_verified_gross_cents integer,
  p_verified_session_id text,
  p_verified_payment_intent_id text,
  p_verified_line_prices jsonb
)
RETURNS TABLE(
  order_id uuid,
  canonical_entry_ids uuid[],
  line_results jsonb,
  expected_make_whole_refund_cents bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_cart public.entry_carts%ROWTYPE;
  v_link public.entry_payment_links%ROWTYPE;
  v_existing public.stripe_orders%ROWTYPE;
  v_order_id uuid;
  v_customer_id uuid;
  v_currency text;
  v_paid_at timestamptz;
  v_processing_fee integer;
  v_fee_rate numeric;
  v_fee_flat integer;
  v_fee_min integer;
  v_source_show_id uuid;
  v_source_total bigint;
  v_source_subtotal bigint;
  v_source_fee bigint;
  v_verified_subtotal bigint := 0;
  v_accepted_subtotal bigint := 0;
  v_accepted_fee bigint := 0;
  v_expected_make_whole bigint;
  v_ids uuid[] := '{}'::uuid[];
  v_root_ids uuid[] := '{}'::uuid[];
  v_results jsonb := '[]'::jsonb;
  v_line record;
  v_evidence record;
  v_created record;
  v_root_id uuid;
  v_live_id uuid;
  v_root_status text;
  v_entry_ids uuid[];
  v_count integer;
  v_updated integer;
  v_expected_count integer;
BEGIN
  IF p_source_kind IS NULL OR p_source_kind NOT IN ('cart', 'payment_link') OR p_source_id IS NULL
     OR jsonb_typeof(p_order_facts) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_verified_line_prices) IS DISTINCT FROM 'array'
     OR p_verified_gross_cents IS NULL OR p_verified_gross_cents <= 0
     OR p_verified_session_id IS NULL OR p_verified_session_id = ''
     OR p_verified_payment_intent_id IS NULL OR p_verified_payment_intent_id = '' THEN
    RAISE EXCEPTION 'Verified Stripe facts and a complete payment source are required.'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_verified_line_prices) = 0 THEN
    RAISE EXCEPTION 'At least one verified source-line price is required.' USING ERRCODE = '22023';
  END IF;

  -- The webhook may be delivered more than once. Serialize by Stripe Session
  -- before checking either the canonical order or its persisted source.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_verified_session_id, 0)
  );

  SELECT * INTO v_existing FROM public.stripe_orders AS o
   WHERE o.stripe_checkout_session_id = p_verified_session_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.status <> 'succeeded' OR v_existing.order_type <> 'entry'
       OR v_existing.stripe_payment_intent_id IS DISTINCT FROM p_verified_payment_intent_id
       OR v_existing.amount_cents IS DISTINCT FROM p_verified_gross_cents
       OR v_existing.metadata->>'settlement_source_kind' IS DISTINCT FROM p_source_kind
       OR v_existing.metadata->>'settlement_source_id' IS DISTINCT FROM p_source_id::text THEN
      RAISE EXCEPTION 'This Stripe Session already has a different recorded settlement.'
        USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT v_existing.id, v_existing.entry_ids,
      COALESCE(v_existing.metadata->'settlement_result', '[]'::jsonb),
      COALESCE((v_existing.metadata->>'expected_make_whole_refund_cents')::bigint, 0);
    RETURN;
  END IF;

  -- A source is single-use even if Stripe creates another Session/PaymentIntent.
  IF EXISTS (
    SELECT 1 FROM public.stripe_orders AS o
     WHERE o.order_type = 'entry'
       AND o.metadata->>'settlement_source_kind' = p_source_kind
       AND o.metadata->>'settlement_source_id' = p_source_id::text
  ) THEN
    RAISE EXCEPTION 'This payment source already has a different settled PaymentIntent.'
      USING ERRCODE = '23505';
  END IF;

  IF p_source_kind = 'cart' THEN
    SELECT * INTO v_cart FROM public.entry_carts AS c WHERE c.id = p_source_id FOR UPDATE;
    IF NOT FOUND OR v_cart.stripe_checkout_session_id IS DISTINCT FROM p_verified_session_id
       OR v_cart.status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'The cart no longer belongs to this Stripe Session.'
        USING ERRCODE = '23514';
    END IF;
    v_source_show_id := v_cart.show_id;
    v_source_subtotal := COALESCE(v_cart.subtotal_cents, 0);
    v_source_fee := COALESCE(v_cart.platform_fee_cents, 0);
    v_source_total := COALESCE(v_cart.total_cents, 0);
    PERFORM 1 FROM public.entry_cart_items AS i
     WHERE i.cart_id = p_source_id ORDER BY i.id FOR UPDATE;
  ELSE
    SELECT * INTO v_link FROM public.entry_payment_links AS l
     WHERE l.id = p_source_id FOR UPDATE;
    IF NOT FOUND OR v_link.stripe_checkout_session_id IS DISTINCT FROM p_verified_session_id
       OR v_link.status NOT IN ('open', 'expired') THEN
      RAISE EXCEPTION 'The payment link no longer belongs to this Stripe Session.'
        USING ERRCODE = '23514';
    END IF;
    IF v_link.entry_fee_snapshot IS NULL OR v_link.platform_fee_cents IS NULL THEN
      RAISE EXCEPTION 'This older payment link has no issuance-time price snapshot; use the established full-refund recovery.'
        USING ERRCODE = '22023';
    END IF;
    v_source_show_id := v_link.show_id;
    v_source_subtotal := v_link.amount_cents;
    v_source_fee := v_link.platform_fee_cents;
    v_source_total := v_source_subtotal + v_source_fee;
    SELECT array_agg(id ORDER BY id) INTO v_entry_ids FROM unnest(v_link.entry_ids) AS x(id);
    IF cardinality(v_link.entry_ids) = 0 OR cardinality(v_link.entry_ids) <> cardinality(v_entry_ids)
       OR cardinality(v_link.entry_ids) <> (SELECT count(DISTINCT id) FROM unnest(v_link.entry_ids) AS x(id))
       OR jsonb_typeof(v_link.entry_fee_snapshot) IS DISTINCT FROM 'array'
       OR (SELECT count(*) FROM jsonb_array_elements(v_link.entry_fee_snapshot) AS snap(value))
          <> (SELECT count(DISTINCT snap.value->>'entry_id')
                FROM jsonb_array_elements(v_link.entry_fee_snapshot) AS snap(value))
       OR EXISTS (
         SELECT 1 FROM unnest(v_link.entry_ids) AS source(id)
          WHERE NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(v_link.entry_fee_snapshot) AS snap(value)
             WHERE snap.value->>'entry_id' = source.id::text
          )
       ) THEN
      RAISE EXCEPTION 'The payment-link source rows are incomplete.' USING ERRCODE = '22023';
    END IF;
    PERFORM e.id FROM public.entries AS e
     WHERE e.id = ANY(v_link.entry_ids) ORDER BY e.id FOR UPDATE;
  END IF;

  -- Recheck after acquiring the source-row lock. Two different Stripe
  -- Sessions can race on one cart/link while holding distinct session locks.
  IF EXISTS (
    SELECT 1 FROM public.stripe_orders AS o
     WHERE o.order_type = 'entry'
       AND o.metadata->>'settlement_source_kind' = p_source_kind
       AND o.metadata->>'settlement_source_id' = p_source_id::text
  ) THEN
    RAISE EXCEPTION 'This payment source was settled by another PaymentIntent.'
      USING ERRCODE = '23505';
  END IF;

  IF v_source_total IS DISTINCT FROM p_verified_gross_cents THEN
    RAISE EXCEPTION 'The verified Stripe gross does not match the persisted source amount.'
      USING ERRCODE = '22023';
  END IF;

  -- Reject duplicate, omitted, additional, malformed, or re-priced line
  -- evidence before any capacity/write operation.
  SELECT count(*) INTO v_expected_count FROM (
    SELECT i.id FROM public.entry_cart_items AS i
     WHERE p_source_kind = 'cart' AND i.cart_id = p_source_id
    UNION ALL
    SELECT (item->>'entry_id')::uuid
      FROM jsonb_array_elements(CASE WHEN p_source_kind = 'payment_link'
        THEN v_link.entry_fee_snapshot ELSE '[]'::jsonb END) AS item
  ) AS source_lines;
  IF jsonb_array_length(p_verified_line_prices) <> v_expected_count THEN
    RAISE EXCEPTION 'Stripe line evidence does not match the complete persisted source.'
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_verified_line_prices) AS ev(value)
     WHERE jsonb_typeof(ev.value) IS DISTINCT FROM 'object'
        OR NULLIF(ev.value->>'lineId', '') IS NULL
        OR (ev.value->>'priceCents') !~ '^[0-9]+$'
  ) OR EXISTS (
    SELECT ev.value->>'lineId' FROM jsonb_array_elements(p_verified_line_prices) AS ev(value)
     GROUP BY ev.value->>'lineId' HAVING count(*) <> 1
  ) THEN
    RAISE EXCEPTION 'Stripe line evidence contains a duplicate or malformed line.'
      USING ERRCODE = '22023';
  END IF;

  IF p_source_kind = 'cart' THEN
    IF EXISTS (
      SELECT 1 FROM public.entry_cart_items AS i
      LEFT JOIN LATERAL (
        SELECT (ev.value->>'priceCents')::integer AS amount
          FROM jsonb_array_elements(p_verified_line_prices) AS ev(value)
         WHERE ev.value->>'lineId' = i.id::text
      ) AS evidence ON true
      WHERE i.cart_id = p_source_id
        AND (evidence.amount IS DISTINCT FROM i.entry_fee_cents)
    ) OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_verified_line_prices) AS ev(value)
      WHERE NOT EXISTS (SELECT 1 FROM public.entry_cart_items AS i
        WHERE i.cart_id = p_source_id AND i.id::text = ev.value->>'lineId')
    ) THEN
      RAISE EXCEPTION 'A cart line price changed or Stripe included an unknown line.'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_link.entry_fee_snapshot) AS snap(value)
      LEFT JOIN LATERAL (
        SELECT (ev.value->>'priceCents')::integer AS amount
          FROM jsonb_array_elements(p_verified_line_prices) AS ev(value)
         WHERE ev.value->>'lineId' = snap.value->>'entry_id'
      ) AS evidence ON true
      WHERE snap.value->>'entry_id' IS NULL
         OR (snap.value->>'amount_cents') !~ '^[0-9]+$'
         OR evidence.amount IS DISTINCT FROM (snap.value->>'amount_cents')::integer
    ) OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_verified_line_prices) AS ev(value)
      WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_link.entry_fee_snapshot) AS snap(value)
        WHERE snap.value->>'entry_id' = ev.value->>'lineId')
    ) OR (SELECT count(*) FROM jsonb_array_elements(v_link.entry_fee_snapshot)) <> cardinality(v_link.entry_ids) THEN
      RAISE EXCEPTION 'The payment-link price snapshot does not match Stripe or its exact source entries.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT COALESCE(sum((ev.value->>'priceCents')::bigint), 0)
    INTO v_verified_subtotal FROM jsonb_array_elements(p_verified_line_prices) AS ev(value);
  IF v_verified_subtotal <> v_source_subtotal THEN
    RAISE EXCEPTION 'Stripe entry-line prices do not tie to the source subtotal.'
      USING ERRCODE = '22023';
  END IF;

  v_customer_id := NULLIF(p_order_facts->>'customer_id', '')::uuid;
  v_currency := COALESCE(NULLIF(p_order_facts->>'currency', ''), 'usd');
  v_paid_at := COALESCE(NULLIF(p_order_facts->>'paid_at', '')::timestamptz, now());
  v_processing_fee := NULLIF(p_order_facts->>'stripe_processing_fee_cents', '')::integer;
  v_fee_rate := NULLIF(p_order_facts->>'platform_fee_rate', '')::numeric;
  v_fee_flat := COALESCE(NULLIF(p_order_facts->>'platform_fee_flat_cents', '')::integer, 0);
  v_fee_min := COALESCE(NULLIF(p_order_facts->>'platform_fee_min_cents', '')::integer, 0);
  IF v_fee_rate IS NULL OR v_fee_rate < 0 OR v_fee_rate > 20
     OR v_fee_flat < 0 OR v_fee_flat > 500 OR v_fee_min < 0 OR v_fee_min > 2000
     OR v_processing_fee < 0 THEN
    RAISE EXCEPTION 'The Stripe order snapshot contains a negative fee.' USING ERRCODE = '22023';
  END IF;
  IF GREATEST(round(v_source_subtotal * v_fee_rate / 100)::bigint + v_fee_flat, v_fee_min)
       IS DISTINCT FROM v_source_fee THEN
    RAISE EXCEPTION 'The persisted platform fee does not match the verified checkout fee schedule.'
      USING ERRCODE = '22023';
  END IF;
  v_order_id := extensions.uuid_generate_v4();

  -- Existing payment-link lines use their immutable issuance snapshot. The
  -- helper locks and validates the complete move-up graph, deriving both IDs.
  IF p_source_kind = 'payment_link' THEN
    FOR v_line IN
      SELECT (item->>'entry_id')::uuid AS source_entry_id,
             (item->>'amount_cents')::integer AS amount_cents
        FROM jsonb_array_elements(v_link.entry_fee_snapshot) AS item
       ORDER BY (item->>'entry_id')::uuid
    LOOP
      SELECT lineage.money_root_entry_id, lineage.live_entry_id
        INTO v_root_id, v_live_id
        FROM public.resolve_entry_payment_lineage(
          v_line.source_entry_id, v_source_show_id, v_line.amount_cents,
          true
        ) AS lineage;
      IF v_link.status = 'expired' THEN
        SELECT e.entry_status INTO v_root_status FROM public.entries AS e WHERE e.id = v_live_id;
        IF v_root_status IS DISTINCT FROM 'promotion-expired' THEN
          RAISE EXCEPTION 'An expired payment link is payable only for its still-eligible expired promotion claim.'
            USING ERRCODE = '22023';
        END IF;
      END IF;
      IF v_root_id = ANY(v_root_ids) THEN
        RAISE EXCEPTION 'Two payment-link lines resolve to the same money root.' USING ERRCODE = '22023';
      END IF;
      v_root_ids := array_append(v_root_ids, v_root_id);
      v_ids := array_append(v_ids, v_live_id);
      v_accepted_subtotal := v_accepted_subtotal + v_line.amount_cents;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'lineId', v_line.source_entry_id, 'outcome', 'accepted', 'entryId', v_live_id,
        'moneyRootEntryId', v_root_id, 'waitlistEntryId', NULL));
      UPDATE public.entries AS e
         SET payment_status = 'paid', payment_method = 'online',
             stripe_payment_intent_id = p_verified_payment_intent_id,
             entry_status = CASE WHEN e.entry_status = 'promotion-expired'
                                 THEN 'confirmed' ELSE e.entry_status END
       WHERE e.id = v_root_id AND e.payment_status = 'pending';
      GET DIAGNOSTICS v_updated = ROW_COUNT;
      IF v_updated <> 1 THEN
        RAISE EXCEPTION 'The payment-link money root was settled concurrently.' USING ERRCODE = '40001';
      END IF;
      UPDATE public.entries AS e SET entry_status = 'confirmed'
       WHERE e.id = v_live_id AND e.entry_status IN ('pending-payment', 'promotion-expired');
      UPDATE public.waitlist_entries AS w SET status = 'accepted', updated_at = now()
       WHERE w.promoted_entry_id = v_live_id AND w.status IN ('offered', 'expired');
    END LOOP;
  ELSE
    -- Cart recovery lines can refer to an existing unpaid entry. Validate the
    -- persisted identity before resolving its DB lineage; null entry_id means
    -- a genuinely new dog/class line, which uses the capacity gate below.
    FOR v_line IN
      SELECT i.* FROM public.entry_cart_items AS i WHERE i.cart_id = p_source_id ORDER BY i.id
    LOOP
      IF v_line.entry_id IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.entries AS e
          JOIN public.classes AS c ON c.id = e.class_id
          JOIN public.trials AS t ON t.id = c.trial_id
           WHERE e.id = v_line.entry_id AND e.dog_id = v_line.dog_id
             AND e.class_id = v_line.class_id AND e.show_id = v_source_show_id
             AND t.show_id = v_source_show_id
        ) THEN
          RAISE EXCEPTION 'A recovered cart line no longer matches its dog, class, or show.'
            USING ERRCODE = '22023';
        END IF;
        SELECT lineage.money_root_entry_id, lineage.live_entry_id
          INTO v_root_id, v_live_id
          FROM public.resolve_entry_payment_lineage(
            v_line.entry_id, v_source_show_id, v_line.entry_fee_cents, false
          ) AS lineage;
        IF v_root_id = ANY(v_root_ids) THEN
          RAISE EXCEPTION 'Two recovered cart lines resolve to the same money root.' USING ERRCODE = '22023';
        END IF;
        v_root_ids := array_append(v_root_ids, v_root_id);
        v_ids := array_append(v_ids, v_live_id);
        v_accepted_subtotal := v_accepted_subtotal + v_line.entry_fee_cents;
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'lineId', v_line.id, 'outcome', 'accepted', 'entryId', v_live_id,
          'moneyRootEntryId', v_root_id, 'waitlistEntryId', NULL));
        UPDATE public.entries AS e
           SET payment_status = 'paid', payment_method = 'online',
               stripe_payment_intent_id = p_verified_payment_intent_id,
               entry_status = CASE WHEN e.entry_status = 'promotion-expired'
                                   THEN 'confirmed' ELSE e.entry_status END
         WHERE e.id = v_root_id AND e.payment_status = 'pending';
        GET DIAGNOSTICS v_updated = ROW_COUNT;
        IF v_updated <> 1 THEN
          RAISE EXCEPTION 'The recovered cart money root was settled concurrently.' USING ERRCODE = '40001';
        END IF;
        UPDATE public.entries AS e SET entry_status = 'confirmed'
         WHERE e.id = v_live_id AND e.entry_status IN ('pending-payment', 'promotion-expired');
        UPDATE public.waitlist_entries AS w SET status = 'accepted', updated_at = now()
         WHERE w.promoted_entry_id = v_live_id AND w.status IN ('offered', 'expired');
      ELSE
        SELECT * INTO v_created FROM public.create_online_paid_entry(
          v_line.dog_id, v_line.class_id, v_line.handler_id,
          v_line.entry_fee_cents::numeric / 100, v_line.jump_height,
          v_line.special_requests, p_verified_payment_intent_id, v_paid_at,
          v_cart.show_id, NULL, v_cart.exhibitor_id
        );
        IF v_created.outcome = 'created_entry' THEN
          v_ids := array_append(v_ids, v_created.entry_id);
          v_accepted_subtotal := v_accepted_subtotal + v_line.entry_fee_cents;
          v_results := v_results || jsonb_build_array(jsonb_build_object(
            'lineId', v_line.id, 'outcome', 'accepted', 'entryId', v_created.entry_id,
            'moneyRootEntryId', v_created.entry_id, 'waitlistEntryId', NULL));
        ELSE
          v_results := v_results || jsonb_build_array(jsonb_build_object(
            'lineId', v_line.id, 'outcome', v_created.outcome, 'entryId', NULL,
            'waitlistEntryId', v_created.waitlist_entry_id));
        END IF;
      END IF;
    END LOOP;
  END IF;

  v_accepted_fee := CASE WHEN v_accepted_subtotal = 0 THEN 0 ELSE GREATEST(
    round(v_accepted_subtotal * v_fee_rate / 100)::bigint + v_fee_flat, v_fee_min) END;
  IF v_accepted_fee < 0 OR v_accepted_fee > v_source_fee THEN
    RAISE EXCEPTION 'The accepted service fee exceeds the persisted charge fee.' USING ERRCODE = '22023';
  END IF;
  v_expected_make_whole := p_verified_gross_cents::bigint - v_accepted_subtotal - v_accepted_fee;
  IF v_expected_make_whole < 0 OR v_accepted_subtotal > v_verified_subtotal
     OR v_accepted_subtotal + v_accepted_fee + v_expected_make_whole <> p_verified_gross_cents THEN
    RAISE EXCEPTION 'The paid amount, accepted entries, fee, and expected make-whole do not tie.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.stripe_orders (
    id, customer_id, stripe_payment_intent_id, stripe_checkout_session_id,
    amount_cents, currency, status, order_type, metadata, show_id, entry_ids,
    paid_at, entry_subtotal_cents, platform_fee_cents, platform_fee_rate,
    stripe_processing_fee_cents
  ) VALUES (
    v_order_id, v_customer_id, p_verified_payment_intent_id, p_verified_session_id,
    p_verified_gross_cents, v_currency, 'succeeded', 'entry',
    jsonb_build_object(
      'cart_id', CASE WHEN p_source_kind = 'cart' THEN p_source_id::text END,
      'entry_payment_link_id', CASE WHEN p_source_kind = 'payment_link' THEN p_source_id::text END,
      'settlement_source_kind', p_source_kind, 'settlement_source_id', p_source_id,
      'platform_fee_percent', v_fee_rate,
      'platform_fee_flat_cents', v_fee_flat,
      'platform_fee_min_cents', v_fee_min,
      'expected_make_whole_refund_cents', v_expected_make_whole,
      'overflow_refund', CASE WHEN v_expected_make_whole = 0 THEN
        jsonb_build_object(
          'action', 'none',
          'paid_amount_cents', p_verified_gross_cents
        )
      ELSE
        jsonb_build_object(
          'action', 'refund',
          'amount_cents', v_expected_make_whole,
          'paid_amount_cents', p_verified_gross_cents - v_expected_make_whole,
          'reason', CASE
            WHEN v_accepted_subtotal = 0 THEN 'full_make_whole'
            WHEN p_source_kind = 'cart' THEN 'partial_no_service_lines'
            ELSE 'partial_invalid_entries'
          END
        )
      END,
      'settlement_result', v_results),
    v_source_show_id, v_ids, v_paid_at, v_accepted_subtotal::integer,
    v_accepted_fee::integer, v_fee_rate, v_processing_fee
  );

  IF p_source_kind = 'cart' THEN
    UPDATE public.entry_carts SET status = 'submitted', updated_at = now()
     WHERE id = p_source_id AND status = 'active';
  ELSE
    UPDATE public.entry_payment_links SET status = 'paid', updated_at = now()
     WHERE id = p_source_id AND status IN ('open', 'expired');
  END IF;
  RETURN QUERY SELECT v_order_id, v_ids, v_results, v_expected_make_whole;
END;
$function$;

REVOKE ALL ON FUNCTION public.settle_entry_order(text, uuid, jsonb, integer, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_entry_order(text, uuid, jsonb, integer, text, text, jsonb)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
