-- MYK9-981: when an abandoned-cart refund request is closed, release its cart
-- and resolve its "awaiting approval" operator alert.
--
-- Found by the post-deploy Stripe test-mode check (2026-10-03): request
-- be225d32 was refunded, yet its cart stayed 'refund_pending' and the alert
-- "Paid abandoned cart — refund awaiting approval" (dedupe
-- refund-request-<id>) stayed open on /admin/health.
--
-- Owner decision (2026-10-03, on MYK9-981): once the request reaches
-- 'refunded' the cart returns to 'abandoned' and its alert resolves; the same
-- applies to 'resolved_without_refund'.
--
-- WHERE. One AFTER UPDATE OF status trigger on refund_requests. The request's
-- status has exactly two writers, both already in the same transaction as
-- the event that closes it:
--   * refund_requests_recompute_status (the attempts trigger), fired by
--     settle_refund_attempt, whose only caller is settleAttemptFromStripe
--     (the admin's approval / "Check status", and stripe-webhook);
--   * resolve_refund_request_without_refund (stripe-approve-refund).
-- So the cart and the alert change in the SAME transaction as the request,
-- and no edge function changes.
--
-- WHAT. On a transition INTO refunded / resolved_without_refund:
--   * the operator alert (source 'stripe-webhook', dedupe_key
--     'refund-request-<id>') gets resolved_at = now() (resolved_by NULL: the
--     system closed it). Other alerts about the request (a failed attempt, a
--     double refund) are left for a person. An awaiting-approval alert
--     INSERTED after the request closed (a racing checkout redelivery) lands
--     already resolved (trg_operator_alerts_refund_request_closed, below).
--   * an abandoned_cart request's cart moves refund_pending -> abandoned, only
--     while it still holds THIS request's session.
-- On a transition OUT of 'refunded' (Stripe can fail a refund it reported
-- succeeded; the request derives back to failed and returns to the approval
-- queue), the cart moves abandoned -> refund_pending again, under the same
-- session match, so begin_refund_attempt's "cart still held" check lets the
-- re-approval through exactly as before this change.
--
-- WHY 'abandoned' DOES NOT REOPEN THE CLAIM. claim_abandoned_cart_refund
-- accepts an abandoned cart, but it looks up the session's existing request
-- FIRST and returns 'already_pending' with that request (and its closed
-- status, which the webhook never re-announces). The request table is unique
-- on (stripe_checkout_session_id, kind). So a redelivered
-- checkout.session.completed for the refunded session queues nothing, opens
-- no attempt and leaves the cart alone; begin_refund_attempt answers
-- 'already_refunded' / 'resolved'. stripe-checkout reopens only active and
-- expired carts, and Clear Cart never writes an abandoned one.
--
-- Amounts are untouched: nothing here reads or writes money, and nothing
-- calls Stripe. Refunds stay human-approved (stripe-approve-refund).
--
-- entry_carts_protect_status lets only service_role leave or enter
-- refund_pending. Every real caller of the two request writers is
-- service_role. Anyone else (a person running SQL by hand) must not have the
-- request write aborted by the cart tidy-up, so a 42501 there is downgraded
-- to a WARNING and the cart is left as it was.
--
-- Behavioral coverage (runs in CI only):
-- supabase/tests/myk9_981_closed_refund_request_releases_cart_test.sql

BEGIN;

CREATE OR REPLACE FUNCTION public.refund_requests_sync_closure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_closed boolean := NEW.status IN ('refunded', 'resolved_without_refund');
  v_was_closed boolean := OLD.status IN ('refunded', 'resolved_without_refund');
BEGIN
  IF v_closed = v_was_closed THEN
    RETURN NULL;
  END IF;

  IF v_closed THEN
    UPDATE public.operator_alerts a
       SET resolved_at = now()
     WHERE a.source = 'stripe-webhook'
       AND a.dedupe_key = 'refund-request-' || NEW.id::text
       AND a.resolved_at IS NULL;
  END IF;

  IF NEW.kind = 'abandoned_cart' AND NEW.cart_id IS NOT NULL THEN
    BEGIN
      UPDATE public.entry_carts c
         SET status = CASE WHEN v_closed THEN 'abandoned' ELSE 'refund_pending' END
       WHERE c.id = NEW.cart_id
         AND c.status = CASE WHEN v_closed THEN 'refund_pending' ELSE 'abandoned' END
         AND c.stripe_checkout_session_id = NEW.stripe_checkout_session_id;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE WARNING 'refund request %: cart % left as it was (%)', NEW.id, NEW.cart_id, SQLERRM;
    END;
  END IF;
  RETURN NULL;
END;
$$;

-- A trigger function needs no EXECUTE grant to fire.
REVOKE ALL ON FUNCTION public.refund_requests_sync_closure() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_refund_requests_sync_closure ON public.refund_requests;
CREATE TRIGGER trg_refund_requests_sync_closure
  AFTER UPDATE OF status ON public.refund_requests
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.refund_requests_sync_closure();

-- The other half of the alert closure (Codex P2 on #2717). A checkout
-- redelivery reads the request (still open) and only afterwards inserts its
-- awaiting-approval alert; if the request closed in between, the closure
-- above found no alert to resolve, and a resolved alert no longer takes part
-- in the dedupe index, so the late insert would stay open forever.
--
-- So the insert itself reads the request's CURRENT status under the request
-- row's lock. FOR SHARE conflicts with the FOR UPDATE every closing path
-- takes first (settle_refund_attempt, the recompute trigger,
-- resolve_refund_request_without_refund), so under READ COMMITTED:
--   * closure first: the insert waits for it to commit, then reads the
--     closed status and lands already resolved;
--   * insert first: the closure waits for the insert to commit; its alert
--     UPDATE is a later statement with a later snapshot, so it sees the new
--     open alert and resolves it.
-- Both sides take the request lock before touching operator_alerts, so they
-- cannot deadlock. The row is still inserted (resolved), as a record.
-- Only the stripe-webhook awaiting-approval key (refund-request-<uuid>)
-- matches; every other alert is untouched.
CREATE OR REPLACE FUNCTION public.operator_alerts_refund_request_closed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
BEGIN
  IF NEW.source = 'stripe-webhook'
     AND NEW.resolved_at IS NULL
     AND NEW.dedupe_key ~ '^refund-request-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT r.status INTO v_status
      FROM public.refund_requests r
     WHERE r.id = substr(NEW.dedupe_key, length('refund-request-') + 1)::uuid
       FOR SHARE;
    IF v_status IN ('refunded', 'resolved_without_refund') THEN
      NEW.resolved_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.operator_alerts_refund_request_closed() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_operator_alerts_refund_request_closed ON public.operator_alerts;
CREATE TRIGGER trg_operator_alerts_refund_request_closed
  BEFORE INSERT ON public.operator_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.operator_alerts_refund_request_closed();

-- Requests closed before this trigger existed (be225d32 on 2026-10-03): the
-- same two effects, once. service_role, because entry_carts_protect_status
-- lets only it leave refund_pending.
SET LOCAL ROLE service_role;

UPDATE public.operator_alerts a
   SET resolved_at = now()
  FROM public.refund_requests r
 WHERE r.status IN ('refunded', 'resolved_without_refund')
   AND a.source = 'stripe-webhook'
   AND a.dedupe_key = 'refund-request-' || r.id::text
   AND a.resolved_at IS NULL;

UPDATE public.entry_carts c
   SET status = 'abandoned'
  FROM public.refund_requests r
 WHERE r.status IN ('refunded', 'resolved_without_refund')
   AND r.kind = 'abandoned_cart'
   AND c.id = r.cart_id
   AND c.status = 'refund_pending'
   AND c.stripe_checkout_session_id = r.stripe_checkout_session_id;

RESET ROLE;

COMMIT;
