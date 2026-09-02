-- MYK9-294: checkout confirmation must not depend on a lagging direct table read.
--
-- The Stripe webhook writes through service_role while the success page reads
-- stripe_orders through PostgREST/RLS. A just-committed row can therefore be
-- temporarily invisible to the browser and look identical to a missing or
-- unauthorized order. This owner-scoped SECURITY DEFINER lookup reads the
-- primary database and returns only the fields needed by checkout confirmation.

CREATE OR REPLACE FUNCTION public.get_my_checkout_order(p_session_id text)
RETURNS TABLE (
  id uuid,
  status text,
  amount_cents integer,
  entry_ids uuid[],
  show_id uuid,
  paid_at timestamptz,
  refunded_at timestamptz,
  stripe_payment_intent_id text,
  metadata jsonb,
  show_name text,
  confirmation_number text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT o.id, o.status, o.amount_cents, o.entry_ids, o.show_id, o.paid_at,
    o.refunded_at, o.stripe_payment_intent_id, o.metadata, s.name,
    en.confirmation_number
  FROM public.stripe_orders AS o
  LEFT JOIN public.shows AS s ON s.id = o.show_id
  LEFT JOIN public.enrollments AS en ON en.id = o.enrollment_id
  WHERE o.stripe_checkout_session_id = p_session_id
    AND (
      (SELECT public.is_platform_admin())
      OR EXISTS (
        SELECT 1 FROM public.stripe_customers AS sc
        WHERE sc.id = o.customer_id
          AND sc.person_id = (SELECT public.get_my_person_id())
      )
      OR EXISTS (
        SELECT 1
        FROM public.entry_carts AS c
        JOIN public.exhibitor_profiles AS ep ON ep.id = c.exhibitor_id
        WHERE c.id::text = o.metadata ->> 'cart_id'
          AND ep.person_id = (SELECT public.get_my_person_id())
      )
      OR EXISTS (
        SELECT 1
        FROM public.entry_payment_links AS l
        JOIN LATERAL unnest(l.entry_ids) AS link_entry_id(id) ON true
        JOIN public.entries AS e ON e.id = link_entry_id.id
        LEFT JOIN public.dogs AS d ON d.id = e.dog_id
        WHERE l.stripe_checkout_session_id = o.stripe_checkout_session_id
          AND (
            e.handler_id = (SELECT public.get_my_person_id())
            OR d.owner_id = (SELECT public.get_my_person_id())
            OR d.co_owner_id = (SELECT public.get_my_person_id())
          )
      )
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_checkout_order(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_checkout_order(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_checkout_order(text) TO authenticated;
