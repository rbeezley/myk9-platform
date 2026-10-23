-- MYK9-639: an exhibitor's My Payments ledger omits the orders a secretary's
-- payment link settled.
--
-- stripe-webhook records a payment-link order with customer_id NULL (the payer
-- may hold no stripe_customers row at all), so the customer arm of
-- stripe_orders_select never admits it. In the 2026-10-21 controlled TEST
-- replay the exhibitor who paid four $37.45 charges saw two: the two cart
-- cases. The two link cases existed, with customer_id NULL, and PostgREST under
-- the exhibitor's own session returned neither.
--
-- The first draft widened the policy to "any order whose entry_ids I own". Its
-- own privacy proof rejected it: the webhook writes only the ACCEPTED entries
-- to stripe_orders.entry_ids while amount_cents is the whole charge, so a link
-- covering handler A's dog and handler B's dog, settled for A alone, showed A
-- the full 7490-cent charge. Ownership therefore has to be decided against the
-- persisted link's COMPLETE original entry list -- never the order's.
--
-- is_my_entry_payment_link_order(session) admits the caller only when the
-- entry_payment_links row for that session exists and EVERY entry it was
-- issued for exists, sits in the link's show, and is the caller's (handler,
-- dog owner or co-owner -- the three arms get_my_checkout_order already uses).
-- A missing entry, an entry nobody owns, a second handler or a cross-show id
-- each deny the WHOLE order: the charge is not wholly the caller's to read.
-- Because it reads the link rather than the order, an order that accepted no
-- line at all (every entry refunded) still shows the payer their charge and
-- its refund.

CREATE OR REPLACE FUNCTION public.is_my_entry_payment_link_order(p_session_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_person_id uuid := public.get_my_person_id();
BEGIN
  -- NULL is never an owner (MYK9-939): no person row, no session, no access.
  IF v_person_id IS NULL OR p_session_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.entry_payment_links AS l
    WHERE l.stripe_checkout_session_id = p_session_id
      AND cardinality(l.entry_ids) > 0
      -- One entry the caller cannot vouch for denies the whole charge.
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(l.entry_ids) AS link_entry(id)
        LEFT JOIN public.entries AS e ON e.id = link_entry.id
        LEFT JOIN public.dogs AS d ON d.id = e.dog_id
        WHERE e.id IS NULL
          OR e.show_id IS DISTINCT FROM l.show_id
          OR NOT COALESCE(
            e.handler_id = v_person_id
              OR d.owner_id = v_person_id
              OR d.co_owner_id = v_person_id,
            false
          )
      )
  );
END;
$$;

COMMENT ON FUNCTION public.is_my_entry_payment_link_order(text) IS
  'MYK9-639: true when the entry_payment_links row for this checkout session '
  'exists and every entry it was issued for is the caller''s (handler, owner or '
  'co-owner) and in the link''s show. Decided against the link''s complete '
  'original list, never stripe_orders.entry_ids, which holds only the accepted '
  'lines while amount_cents is the whole charge.';

REVOKE ALL ON FUNCTION public.is_my_entry_payment_link_order(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_my_entry_payment_link_order(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_my_entry_payment_link_order(text) TO authenticated;

-- Same policy as 023_tighten_rls_and_add_test_helpers (customer arm, admin arm)
-- plus the link-payer arm. The customer and admin arms are unchanged; the new
-- arm applies only to rows the customer arm can never match.
DROP POLICY IF EXISTS "stripe_orders_select" ON public.stripe_orders;

CREATE POLICY "stripe_orders_select" ON public.stripe_orders
  FOR SELECT TO authenticated
  USING (
    customer_id IN (
      SELECT sc.id FROM public.stripe_customers AS sc
      WHERE sc.person_id = (SELECT public.get_my_person_id())
    )
    OR (SELECT public.is_platform_admin())
    OR (
      customer_id IS NULL
      AND public.is_my_entry_payment_link_order(stripe_checkout_session_id)
    )
  );

NOTIFY pgrst, 'reload schema';
