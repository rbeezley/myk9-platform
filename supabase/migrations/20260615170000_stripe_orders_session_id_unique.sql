-- Webhook idempotency backstop for online Stripe checkout.
--
-- The stripe-webhook handler already prevents duplicate ENTRY creation via the
-- cart-claim latch (active -> submitted with an updated_at OCC check). This
-- index adds the missing ORDER-row backstop: it guarantees at most one
-- stripe_orders row per Stripe Checkout Session, so a webhook re-delivery that
-- slips past the cart claim (claimed-but-order-not-yet-inserted window) cannot
-- create a second order row for the same payment.
--
-- Partial (WHERE ... IS NOT NULL) because only online cart checkouts carry a
-- session id; mail-in / enrollment-backed orders leave it NULL and must remain
-- free to have many NULL rows. Verified 0 existing duplicate session ids on the
-- live project before adding (2026-06-15).

CREATE UNIQUE INDEX IF NOT EXISTS stripe_orders_checkout_session_id_key
  ON public.stripe_orders (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
