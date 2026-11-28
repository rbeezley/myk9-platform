-- MYK9-2455: stripe-checkout heals a cart's drifted line fees in ONE transaction.
--
-- Before this, the fee-drift healer (stripe-checkout/cartFeeHeal.ts) wrote the
-- line fees, then the cart totals and the cleared page link, as separate
-- PostgREST writes checked only on the cart id and status:
--   1. A heal that outlived its 90-second checkout lease while the exhibitor
--      retried could clear the page the retry had just linked, and the
--      webhook's sessionCartGuard then rejected that payment as stale.
--   2. Lines saved but a failed totals write left the cart with no drift to
--      find: the retry opened Stripe at the new price with no fee review.
--
-- heal_cart_fees writes every line, the totals and the cleared link, or
-- nothing, and only for the request that still holds the cart's live lease,
-- on the cart (active, same updated_at) and the page it read.
--   healed         done; stripe-checkout answers the "fees were updated" 409
--   lease_lost     this request no longer holds the cart's live lease
--   cart_changed   the cart is not active, its updated_at moved, or its lines
--                  no longer add up to the subtotal being written
--   session_moved  the cart links a different page than the one read
-- Every refusal writes nothing. A line that is not in the cart raises, so
-- the lines already written in this call roll back with it.
--
-- The prior Stripe page is retired BEFORE this call (Stripe cannot join a
-- database transaction); see cartFeeHeal.ts.
--
-- DEPLOY ORDER: push this migration, then deploy stripe-checkout. The deployed
-- stripe-checkout does not call it, so it keeps working against this schema.
--
-- Behavioral coverage (runs in CI only):
-- supabase/tests/myk9_2455_heal_cart_fees_test.sql

BEGIN;

CREATE OR REPLACE FUNCTION public.heal_cart_fees(
  p_cart_id uuid,
  p_lease_id uuid,
  p_expected_updated_at timestamptz,
  p_observed_session_id text,
  p_lines jsonb,
  p_subtotal_cents integer,
  p_platform_fee_cents integer,
  p_total_cents integer
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_updated_at timestamptz;
  v_session text;
  v_healed_subtotal bigint;
  v_line record;
BEGIN
  IF p_cart_id IS NULL OR p_lease_id IS NULL OR p_expected_updated_at IS NULL
     OR p_lines IS NULL OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_lines) = 0
     OR p_subtotal_cents IS NULL OR p_platform_fee_cents IS NULL OR p_total_cents IS NULL
     OR p_subtotal_cents <= 0 OR p_platform_fee_cents < 0
     OR p_total_cents <> p_subtotal_cents + p_platform_fee_cents THEN
    RAISE EXCEPTION 'heal_cart_fees: cart, lease, read stamp, lines and consistent totals are required'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_lines) AS l (item_id uuid, entry_fee_cents integer)
    WHERE l.item_id IS NULL OR l.entry_fee_cents IS NULL OR l.entry_fee_cents <= 0
  ) THEN
    RAISE EXCEPTION 'heal_cart_fees: every line needs an item id and a fee above zero'
      USING ERRCODE = '22023';
  END IF;

  -- The live lease, locked: a claim cannot replace it until this commits.
  BEGIN
    PERFORM public.require_cart_checkout_lease(p_cart_id, p_lease_id);
  EXCEPTION WHEN SQLSTATE '55000' THEN
    RETURN 'lease_lost';
  END;

  SELECT c.status, c.updated_at, c.stripe_checkout_session_id
    INTO v_status, v_updated_at, v_session
  FROM public.entry_carts c
  WHERE c.id = p_cart_id
  FOR UPDATE;
  IF NOT FOUND OR v_status IS DISTINCT FROM 'active' THEN
    RETURN 'cart_changed';
  END IF;
  IF v_session IS DISTINCT FROM p_observed_session_id THEN
    RETURN 'session_moved';
  END IF;
  IF v_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN 'cart_changed';
  END IF;

  -- A line added or removed while no page was linked does not move the
  -- cart's updated_at, so check that the healed lines add up to the subtotal
  -- being written (sessionCartGuard requires exactly that) before writing.
  SELECT sum(COALESCE(l.entry_fee_cents, i.entry_fee_cents))
    INTO v_healed_subtotal
  FROM public.entry_cart_items i
  LEFT JOIN jsonb_to_recordset(p_lines) AS l (item_id uuid, entry_fee_cents integer)
    ON l.item_id = i.id
  WHERE i.cart_id = p_cart_id;
  IF v_healed_subtotal IS DISTINCT FROM p_subtotal_cents::bigint THEN
    RETURN 'cart_changed';
  END IF;

  FOR v_line IN
    SELECT l.item_id, l.entry_fee_cents
    FROM jsonb_to_recordset(p_lines) AS l (item_id uuid, entry_fee_cents integer)
  LOOP
    UPDATE public.entry_cart_items i
       SET entry_fee_cents = v_line.entry_fee_cents
     WHERE i.id = v_line.item_id
       AND i.cart_id = p_cart_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'heal_cart_fees: line % is not in cart %', v_line.item_id, p_cart_id
        USING ERRCODE = 'P0002';
    END IF;
  END LOOP;

  UPDATE public.entry_carts c
     SET subtotal_cents = p_subtotal_cents,
         platform_fee_cents = p_platform_fee_cents,
         total_cents = p_total_cents,
         -- The prior page priced the unhealed lines; it was retired before this call.
         stripe_checkout_session_id = NULL
   WHERE c.id = p_cart_id;

  RETURN 'healed';
END;
$$;

COMMENT ON FUNCTION public.heal_cart_fees(uuid, uuid, timestamptz, text, jsonb, integer, integer, integer) IS
  'MYK9-2455: under the cart''s checkout lease, writes healed line fees, the cart totals and '
  'clears the page link in one transaction, only for the active cart and page the caller read; '
  'otherwise writes nothing. service_role only (stripe-checkout).';

REVOKE ALL ON FUNCTION public.heal_cart_fees(uuid, uuid, timestamptz, text, jsonb, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.heal_cart_fees(uuid, uuid, timestamptz, text, jsonb, integer, integer, integer)
  TO service_role;

COMMIT;
