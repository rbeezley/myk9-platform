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
-- my_entry_payment_link_session_ids() is the set of checkout sessions whose
-- entry_payment_links row lists ONLY entries that are the caller's (handler,
-- dog owner or co-owner -- the three arms get_my_checkout_order already uses),
-- every one of them existing and in the link's show. A missing entry, an entry
-- nobody owns, a second handler or a cross-show id each keep the WHOLE link
-- out of the set: the charge is not wholly the caller's to read. Because it
-- reads the link rather than the order, an order that accepted no line at all
-- (every entry refunded) still shows the payer their charge and its refund.
--
-- It is an UNCORRELATED set, used as `stripe_checkout_session_id IN (SELECT
-- ...)`, so the policy evaluates it once per query as a hashed subplan rather
-- than once per NULL-customer row -- the shape manageable_show_ids() and
-- official_show_ids() took after the per-row can_manage_show() statement
-- timeouts (20260602000000, 20260602040000). Candidate links are found through
-- the existing GIN index on entry_payment_links.entry_ids.

CREATE OR REPLACE FUNCTION public.my_entry_payment_link_session_ids()
RETURNS SETOF text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_person_id uuid := public.get_my_person_id();
BEGIN
  -- NULL is never an owner (MYK9-939): no person row, no sessions.
  IF v_person_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    WITH mine AS (
      SELECT e.id, e.show_id
      FROM public.entries AS e
      LEFT JOIN public.dogs AS d ON d.id = e.dog_id
      WHERE e.handler_id = v_person_id
         OR d.owner_id = v_person_id
         OR d.co_owner_id = v_person_id
    )
    SELECT l.stripe_checkout_session_id
    FROM public.entry_payment_links AS l
    WHERE l.entry_ids && (SELECT coalesce(array_agg(mine.id), '{}'::uuid[]) FROM mine)
      AND cardinality(l.entry_ids) > 0
      -- One entry the caller cannot vouch for keeps the whole charge out.
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(l.entry_ids) AS link_entry(id)
        LEFT JOIN mine ON mine.id = link_entry.id
        WHERE mine.id IS NULL
           OR mine.show_id IS DISTINCT FROM l.show_id
      );
END;
$$;

COMMENT ON FUNCTION public.my_entry_payment_link_session_ids() IS
  'MYK9-639: the checkout sessions whose entry_payment_links row lists only '
  'entries that are the caller''s (handler, owner or co-owner), each existing '
  'and in the link''s show. Decided against the link''s complete original list, '
  'never stripe_orders.entry_ids, which holds only the accepted lines while '
  'amount_cents is the whole charge. Uncorrelated: use as IN (SELECT ...).';

REVOKE ALL ON FUNCTION public.my_entry_payment_link_session_ids() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.my_entry_payment_link_session_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_entry_payment_link_session_ids() TO authenticated;

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
      AND stripe_checkout_session_id IN (SELECT public.my_entry_payment_link_session_ids())
    )
  );

NOTIFY pgrst, 'reload schema';
