-- MYK9-968: a paid payment link resolves its waitlist offers in the SAME
-- transaction as its latch, order and refund request.
--
-- Before this, stripe-webhook resolved the offers (waitlist_entries
-- offered/expired -> accepted, keyed on promoted_entry_id) in a separate
-- write AFTER queue_payment_link_refund returned. When the RPC committed but
-- its response was lost, the webhook threw before that write; the Stripe
-- redelivery then found the order (or the refund request) and took the
-- replay-first branch (paidSessionEntry.ts), so the offer stayed 'offered' or
-- 'expired' for good. The expiration cron skips paid entries, so nothing
-- repaired it. (Deferred Codex round 16 P2 on #2689.)
--
-- Fix: queue_payment_link_refund gains p_paid_entry_ids. The offers linked to
-- those entries move to 'accepted', the state the webhook's own write used
-- (resolvePaidWaitlistOffers in stripe-webhook, still used by the cart path),
-- inside the same transaction as the latch. There is nothing left to replay.
-- Idempotent: only 'offered'/'expired' rows change, so a repeat call or a
-- retry after a lost response changes nothing.
--
-- The function is copied from its latest definition
-- (20261003013900_myk9_876_874_refund_requests.sql, identical to live) with
-- only the new parameter and the offer update added. A new parameter changes
-- the signature, so the old one is dropped first (CREATE OR REPLACE would add
-- an overload that makes every named-argument call ambiguous). The trailing
-- DEFAULT NULL keeps every existing call valid, including the deployed
-- webhook's, so this migration must be pushed BEFORE stripe-webhook is
-- deployed (the new webhook passes p_paid_entry_ids). Grants are restated
-- exactly: service_role only; the schema's default privileges would otherwise
-- give anon and authenticated EXECUTE on the new function.
--
-- SECURITY DEFINER owned by postgres, which has BYPASSRLS, so the FORCE RLS
-- on waitlist_entries does not apply (as for the service-role write it
-- replaces).

DROP FUNCTION IF EXISTS public.queue_payment_link_refund(text, uuid, text, text, integer, text, jsonb, uuid, jsonb);

-- MYK9-876 (Codex rounds 13-14 on #2689): the payment-link refund obligation
-- and order, ATOMIC with the link's fulfillment latch. In ONE transaction:
--   * with p_link_id and p_close_from, the link moves p_close_from -> 'paid'
--     (the webhook's idempotency latch for this session);
--   * with p_order, the session's stripe_orders row is inserted from the
--     webhook's column values (ON CONFLICT DO NOTHING: an order that already
--     exists stays as it is), so a closed latch always has its order;
--   * with p_amount_cents, the entry_payment_link refund request is inserted,
--     idempotent on (session, kind);
--   * with p_paid_entry_ids (MYK9-968), the waitlist offers promoted into
--     those entries move offered/expired -> 'accepted';
-- and it returns the link's status and the session's request, if any. With
-- none of them it only READS, which a redelivery uses to find the request. So a
-- closed latch always has its request beside it, and a lost response or a
-- redelivery finds both. p_link_id NULL is the paid session with no link row
-- (queue only). A link or show deleted before a redelivery is stored as NULL
-- and its original id kept in detail, so a missing parent never blocks the
-- insert.
CREATE OR REPLACE FUNCTION public.queue_payment_link_refund(
  p_session_id text,
  p_link_id uuid DEFAULT NULL,
  p_close_from text DEFAULT NULL,
  p_payment_intent_id text DEFAULT NULL,
  p_amount_cents integer DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_detail jsonb DEFAULT '{}'::jsonb,
  p_show_id uuid DEFAULT NULL,
  p_order jsonb DEFAULT NULL,
  p_paid_entry_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  link_status text,
  link_closed boolean,
  order_created boolean,
  refund_request_id uuid,
  created boolean,
  request_status text,
  amount_cents integer,
  reason text,
  stripe_payment_intent_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_link_status text;
  v_closed boolean := false;
  v_order_rows integer := 0;
  v_id uuid;
  v_req public.refund_requests%ROWTYPE;
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'queue_payment_link_refund: a session is required' USING errcode = '22023';
  END IF;
  IF p_close_from IS NOT NULL AND (p_link_id IS NULL OR p_close_from NOT IN ('open', 'expired')) THEN
    RAISE EXCEPTION 'queue_payment_link_refund: a link closes only from open or expired'
      USING errcode = '22023';
  END IF;
  IF p_amount_cents IS NOT NULL AND (p_amount_cents <= 0 OR p_payment_intent_id IS NULL) THEN
    RAISE EXCEPTION 'queue_payment_link_refund: a refund needs an intent and a positive amount'
      USING errcode = '22023';
  END IF;

  IF p_link_id IS NOT NULL THEN
    SELECT l.status INTO v_link_status
      FROM public.entry_payment_links l
     WHERE l.id = p_link_id
     FOR UPDATE;
    IF p_close_from IS NOT NULL AND v_link_status = p_close_from THEN
      UPDATE public.entry_payment_links l
         SET status = 'paid',
             updated_at = now()
       WHERE l.id = p_link_id;
      v_link_status := 'paid';
      v_closed := true;
    END IF;
  END IF;

  -- MYK9-968: the paid entries' waitlist offers resolve with the latch, the
  -- same transition the webhook's separate write made. Only open offers
  -- change, so a repeat is a no-op.
  IF cardinality(p_paid_entry_ids) > 0 THEN
    UPDATE public.waitlist_entries w
       SET status = 'accepted',
           updated_at = now()
     WHERE w.promoted_entry_id = ANY (p_paid_entry_ids)
       AND w.status IN ('offered', 'expired');
  END IF;

  -- The order, column for column as the webhook built it, typed by the table
  -- itself. The session id is this call's, never the payload's.
  IF p_order IS NOT NULL THEN
    INSERT INTO public.stripe_orders AS o (
      customer_id, stripe_payment_intent_id, stripe_checkout_session_id, amount_cents,
      currency, status, order_type, entry_subtotal_cents, platform_fee_cents,
      platform_fee_rate, stripe_processing_fee_cents, refunded_cents,
      make_whole_refunded_cents, metadata, show_id, entry_ids, paid_at
    )
    SELECT x.customer_id, x.stripe_payment_intent_id, p_session_id, x.amount_cents,
           x.currency, x.status, x.order_type, x.entry_subtotal_cents, x.platform_fee_cents,
           x.platform_fee_rate, x.stripe_processing_fee_cents, x.refunded_cents,
           x.make_whole_refunded_cents, x.metadata, x.show_id, x.entry_ids, x.paid_at
      FROM jsonb_populate_record(NULL::public.stripe_orders, p_order) AS x
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_order_rows = ROW_COUNT;
  END IF;

  IF p_amount_cents IS NOT NULL THEN
    INSERT INTO public.refund_requests AS r (
      kind, stripe_checkout_session_id, stripe_payment_intent_id, amount_cents,
      reason, entry_payment_link_id, show_id, detail
    )
    VALUES (
      'entry_payment_link', p_session_id, p_payment_intent_id, p_amount_cents, p_reason,
      (SELECT l.id FROM public.entry_payment_links l WHERE l.id = p_link_id),
      (SELECT sh.id FROM public.shows sh WHERE sh.id = p_show_id),
      COALESCE(p_detail, '{}'::jsonb)
        || jsonb_strip_nulls(jsonb_build_object(
             'entry_payment_link_id', p_link_id,
             'show_id', p_show_id))
    )
    ON CONFLICT (stripe_checkout_session_id, kind) DO NOTHING
    RETURNING r.id INTO v_id;
  END IF;

  SELECT * INTO v_req
    FROM public.refund_requests r
   WHERE r.stripe_checkout_session_id = p_session_id
     AND r.kind = 'entry_payment_link';

  RETURN QUERY SELECT v_link_status, v_closed, (v_order_rows > 0), v_req.id, (v_id IS NOT NULL),
    v_req.status, v_req.amount_cents, v_req.reason, v_req.stripe_payment_intent_id;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_payment_link_refund(text, uuid, text, text, integer, text, jsonb, uuid, jsonb, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_payment_link_refund(text, uuid, text, text, integer, text, jsonb, uuid, jsonb, uuid[])
  TO service_role;
