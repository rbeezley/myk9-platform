-- MYK9-964 (option A from #2689): cart fulfillment is replayable, so the
-- cart-overflow refund joins the approval queue ATOMICALLY with the cart latch.
--
-- Before this, stripe-webhook closed the cart latch (active -> submitted)
-- FIRST, then ran one create_online_paid_entry per cart line. Each line came
-- back an entry, a waitlist row or a denial from LIVE class capacity, and the
-- overflow refund amount existed only after that loop. The latch was the only
-- thing stopping a redelivery from creating the entries again, so the refund
-- could not be committed with it, and cart overflow went to an operator alert
-- refunded by hand (option C on #2689).
--
-- Now a paid cart is fulfilled in three steps, each idempotent:
--
-- 1. begin_cart_fulfillment holds the cart (active -> 'fulfilling') and
--    snapshots its lines, in ONE statement, into cart_fulfillments (one row
--    per checkout session) and cart_fulfillment_lines (one row per (session,
--    cart item)). Identity comes from the cart's own rows under the cart's
--    lock; the webhook supplies only each line's verified amount. A
--    redelivery gets 'resumed' and replays from the snapshot: the cart (which
--    the owner may since have edited or deleted) is never read again.
--    'fulfilling' is service-role-owned (entry_carts_protect_status), so the
--    owner cannot abandon it, re-open it or start another checkout on it, and
--    the abandoned-cart refund claim (abandoned/expired only) cannot win it.
--
-- 2. Each line's outcome is RECORDED, first write wins, and never changes
--    (trg_cart_fulfillment_lines_immutable):
--      fulfill_cart_line         a new line: calls create_online_paid_entry
--                                once and records created_entry / waitlisted
--                                / denied, or 'failed' with the error when it
--                                raises a deterministic error. A repeat call
--                                returns the recorded outcome WHATEVER the
--                                class capacity is now. A transient error
--                                (serialization, lock, resources, connection)
--                                re-raises and records nothing, so the
--                                redelivery tries the line again.
--      record_cart_line_outcome  a Finish Payment line (an entry that already
--                                exists, paid in place by the webhook):
--                                paid_existing (checked against the entry,
--                                which must be paid by this intent) or failed.
--
-- 3. complete_cart_fulfillment closes the latch LAST, in ONE transaction:
--    the cart moves fulfilling -> submitted, the session's stripe_orders row
--    is inserted, the run is marked complete, and, when the unserved lines
--    are owed back, the 'cart_overflow' refund request is inserted
--    (idempotent on (session, kind)). It refuses while any line has no
--    recorded outcome, and refuses an order whose entry_ids are not exactly
--    the recorded paid lines.
--
-- So a redelivery BEFORE the latch replays the recorded outcomes and computes
-- the same amount; one AFTER it finds the order and the request (the webhook
-- reads both first, paidSessionEntry.ts) and fulfills nothing. Refunds stay
-- human-approved: the request is approved in stripe-approve-refund, and its
-- settlement books it make_whole on the order (refundSettlement.ts).
--
-- create_online_paid_entry is NOT changed; fulfill_cart_line wraps it.
--
-- DEPLOY ORDER: push this migration BEFORE deploying stripe-webhook. The
-- deployed webhook keeps working on it (it never writes 'fulfilling' or
-- 'cart_overflow'); the new webhook needs these RPCs.
--
-- Copied from its LATEST definition:
--   entry_carts_protect_status  20261003013900_myk9_876_874_refund_requests.sql
--                               (matches the live body, 2026-10-04)
-- The two CHECK constraints are restated from the same migration.
--
-- Behavioral coverage (runs in CI only):
-- supabase/tests/myk9_964_replayable_cart_fulfillment_test.sql

BEGIN;

-- ============================================================================
-- 1. Cart status 'fulfilling', and the cart_overflow refund kind
-- ============================================================================

ALTER TABLE public.entry_carts DROP CONSTRAINT IF EXISTS entry_carts_status_check;
ALTER TABLE public.entry_carts
  ADD CONSTRAINT entry_carts_status_check
  CHECK (status IN ('active', 'fulfilling', 'submitted', 'abandoned', 'expired', 'refund_pending'));

-- Adds: 'fulfilling' is service-role-owned, like 'submitted' and
-- 'refund_pending' — an owner may neither set it nor move a cart out of it.
CREATE OR REPLACE FUNCTION public.entry_carts_protect_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT current_setting('role', true)) = 'service_role' THEN
    RETURN new;
  END IF;
  -- Paid cart: service_role owns all further state changes.
  IF old.status = 'submitted' THEN
    RAISE EXCEPTION
      'submitted cart status cannot be changed by non-service-role callers'
      USING errcode = '42501';
  END IF;
  -- Paid cart queued for an approved refund (MYK9-874): same ownership.
  IF old.status = 'refund_pending' OR new.status = 'refund_pending' THEN
    RAISE EXCEPTION
      'refund_pending cart status is owned by the payment webhook'
      USING errcode = '42501';
  END IF;
  -- Paid cart being fulfilled (MYK9-964): same ownership.
  IF old.status = 'fulfilling' OR new.status = 'fulfilling' THEN
    RAISE EXCEPTION
      'fulfilling cart status is owned by the payment webhook'
      USING errcode = '42501';
  END IF;
  -- Regression to active from any terminal state re-opens the idempotency
  -- latch — block for all non-service-role callers.
  IF new.status = 'active' THEN
    RAISE EXCEPTION
      'cart status cannot regress to active'
      USING errcode = '42501';
  END IF;
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.entry_carts_protect_status() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.refund_requests DROP CONSTRAINT IF EXISTS refund_requests_kind_check;
ALTER TABLE public.refund_requests
  ADD CONSTRAINT refund_requests_kind_check
  CHECK (kind IN ('abandoned_cart', 'entry_payment_link', 'cart_overflow'));

-- ============================================================================
-- 2. The fulfillment run and its recorded line outcomes
-- ============================================================================

CREATE TABLE public.cart_fulfillments (
  stripe_checkout_session_id text PRIMARY KEY,
  -- Owners may delete their carts; the run (money history) outlives the cart.
  cart_id uuid REFERENCES public.entry_carts (id) ON DELETE SET NULL,
  show_id uuid NOT NULL,
  exhibitor_id uuid NOT NULL,
  stripe_payment_intent_id text NOT NULL,
  -- Stamped on every entry the run creates (entries.submitted_at), so a
  -- replay writes the same value.
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Set once, by complete_cart_fulfillment, with the latch.
  completed_at timestamptz
);

COMMENT ON TABLE public.cart_fulfillments IS
  'MYK9-964: one row per paid cart checkout session being fulfilled. begin_cart_fulfillment writes it with the line snapshot; complete_cart_fulfillment sets completed_at in the same transaction as the cart latch, the order and the cart_overflow refund request. service_role only.';

CREATE INDEX cart_fulfillments_cart_id_idx ON public.cart_fulfillments (cart_id);

CREATE TABLE public.cart_fulfillment_lines (
  stripe_checkout_session_id text NOT NULL
    REFERENCES public.cart_fulfillments (stripe_checkout_session_id) ON DELETE RESTRICT,
  cart_item_id uuid NOT NULL,
  -- The order the webhook works the lines in (the cart's own order).
  line_no integer NOT NULL CHECK (line_no > 0),
  -- Snapshot of the cart line, taken under the cart's lock.
  dog_id uuid NOT NULL,
  class_id uuid NOT NULL,
  trial_id uuid,
  handler_id uuid,
  jump_height text,
  special_requests text,
  junior_fee_declared boolean NOT NULL DEFAULT false,
  -- A Finish Payment line: the entry already exists and is paid in place.
  existing_entry_id uuid,
  -- The amount the webhook verified against Stripe for this line.
  line_amount_cents integer NOT NULL CHECK (line_amount_cents >= 0),
  -- Recorded once, never changed. NULL until the line is worked.
  outcome text CHECK (outcome IN ('created_entry', 'waitlisted', 'denied', 'failed', 'paid_existing')),
  -- The entry the exhibitor bought (receipts) ...
  entry_id uuid,
  -- ... and the row that carries the payment (they differ for a moved entry).
  paid_entry_id uuid,
  waitlist_entry_id uuid,
  error_message text,
  resolved_at timestamptz,
  PRIMARY KEY (stripe_checkout_session_id, cart_item_id),
  CONSTRAINT cart_fulfillment_lines_line_no_unique UNIQUE (stripe_checkout_session_id, line_no),
  CONSTRAINT cart_fulfillment_lines_outcome_shape CHECK (
    (outcome IS NULL) = (resolved_at IS NULL)
    AND (outcome IS DISTINCT FROM 'created_entry'
         OR (existing_entry_id IS NULL AND entry_id IS NOT NULL AND paid_entry_id = entry_id))
    AND (outcome IS DISTINCT FROM 'paid_existing'
         OR (existing_entry_id IS NOT NULL AND entry_id IS NOT NULL AND paid_entry_id IS NOT NULL))
    AND (outcome IS DISTINCT FROM 'waitlisted'
         OR (existing_entry_id IS NULL AND waitlist_entry_id IS NOT NULL))
    AND (outcome IS DISTINCT FROM 'denied' OR existing_entry_id IS NULL)
    AND (outcome IS NULL OR outcome IN ('created_entry', 'paid_existing')
         OR (entry_id IS NULL AND paid_entry_id IS NULL))
    AND ((outcome = 'failed') = (error_message IS NOT NULL))
  )
);

COMMENT ON TABLE public.cart_fulfillment_lines IS
  'MYK9-964: the snapshot of each paid cart line and its RECORDED fulfillment outcome, keyed (checkout session, cart item). First write wins and never changes, so a redelivery replays the same outcomes whatever class capacity is now. service_role only.';

-- A recorded outcome, and the snapshot it was worked from, never change.
CREATE OR REPLACE FUNCTION public.cart_fulfillment_lines_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'cart fulfillment lines are money history and are never deleted'
      USING errcode = '42501';
  END IF;
  IF OLD.outcome IS NOT NULL THEN
    RAISE EXCEPTION 'cart line % already recorded %; a recorded outcome never changes',
      OLD.cart_item_id, OLD.outcome
      USING errcode = '42501';
  END IF;
  IF (NEW.stripe_checkout_session_id, NEW.cart_item_id, NEW.line_no, NEW.dog_id, NEW.class_id,
      NEW.trial_id, NEW.handler_id, NEW.jump_height, NEW.special_requests,
      NEW.junior_fee_declared, NEW.existing_entry_id, NEW.line_amount_cents)
     IS DISTINCT FROM
     (OLD.stripe_checkout_session_id, OLD.cart_item_id, OLD.line_no, OLD.dog_id, OLD.class_id,
      OLD.trial_id, OLD.handler_id, OLD.jump_height, OLD.special_requests,
      OLD.junior_fee_declared, OLD.existing_entry_id, OLD.line_amount_cents) THEN
    RAISE EXCEPTION 'the snapshot of cart line % never changes', OLD.cart_item_id
      USING errcode = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.cart_fulfillment_lines_immutable() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_cart_fulfillment_lines_immutable
  BEFORE UPDATE OR DELETE ON public.cart_fulfillment_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.cart_fulfillment_lines_immutable();

-- A completed run stays completed.
CREATE OR REPLACE FUNCTION public.cart_fulfillments_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'cart fulfillments are money history and are never deleted'
      USING errcode = '42501';
  END IF;
  IF (NEW.stripe_checkout_session_id, NEW.show_id, NEW.exhibitor_id,
      NEW.stripe_payment_intent_id, NEW.created_at)
     IS DISTINCT FROM
     (OLD.stripe_checkout_session_id, OLD.show_id, OLD.exhibitor_id,
      OLD.stripe_payment_intent_id, OLD.created_at)
     OR (OLD.completed_at IS NOT NULL AND NEW.completed_at IS DISTINCT FROM OLD.completed_at)
     -- Only the FK's ON DELETE SET NULL may change the cart.
     OR (NEW.cart_id IS DISTINCT FROM OLD.cart_id AND NEW.cart_id IS NOT NULL) THEN
    RAISE EXCEPTION 'cart fulfillment % is append-only', OLD.stripe_checkout_session_id
      USING errcode = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.cart_fulfillments_immutable() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_cart_fulfillments_immutable
  BEFORE UPDATE OR DELETE ON public.cart_fulfillments
  FOR EACH ROW
  EXECUTE FUNCTION public.cart_fulfillments_immutable();

ALTER TABLE public.cart_fulfillments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_fulfillments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cart_fulfillment_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_fulfillment_lines FORCE ROW LEVEL SECURITY;

-- REQUIRED, not tidy-up: ALTER DEFAULT PRIVILEGES grant anon full CRUD on
-- every new public table. No client role reads or writes these; every write
-- goes through the SECURITY DEFINER RPCs below as service_role.
REVOKE ALL ON TABLE public.cart_fulfillments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.cart_fulfillment_lines FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.cart_fulfillments TO service_role;
GRANT ALL ON TABLE public.cart_fulfillment_lines TO service_role;

-- ============================================================================
-- 3. The RPCs (stripe-webhook; service_role only)
-- ============================================================================

-- Hold the cart and snapshot its lines, or report the run that already holds
-- it. p_line_amounts maps each cart item id to its verified amount in cents,
-- and must name exactly the cart's lines.
--   begun          the cart moved active -> fulfilling; the snapshot is written
--   resumed        this session's run exists and is not complete: replay it
--   completed      this session's run is complete (the latch is closed)
--   not_claimable  the cart is not active on this session (cart_status says
--                  what it is): nothing written
-- Lock order everywhere: entry_carts row, then cart_fulfillments row.
CREATE OR REPLACE FUNCTION public.begin_cart_fulfillment(
  p_cart_id uuid,
  p_session_id text,
  p_payment_intent_id text,
  p_line_amounts jsonb
)
RETURNS TABLE (outcome text, cart_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_cart record;
  v_run public.cart_fulfillments%ROWTYPE;
  v_item_count integer;
  v_amount_count integer;
  v_priced_count integer;
BEGIN
  IF p_cart_id IS NULL OR p_session_id IS NULL OR p_payment_intent_id IS NULL
     OR p_line_amounts IS NULL OR jsonb_typeof(p_line_amounts) <> 'object' THEN
    RAISE EXCEPTION 'begin_cart_fulfillment: cart, session, intent and the line amounts are required'
      USING errcode = '22023';
  END IF;

  SELECT c.id, c.status, c.stripe_checkout_session_id, c.show_id, c.exhibitor_id
    INTO v_cart
    FROM public.entry_carts c
   WHERE c.id = p_cart_id
   FOR UPDATE;

  SELECT * INTO v_run
    FROM public.cart_fulfillments f
   WHERE f.stripe_checkout_session_id = p_session_id
   FOR UPDATE;
  IF v_run.stripe_checkout_session_id IS NOT NULL THEN
    IF v_run.cart_id IS NOT NULL AND v_run.cart_id IS DISTINCT FROM p_cart_id THEN
      RAISE EXCEPTION 'begin_cart_fulfillment: session % is being fulfilled for another cart', p_session_id
        USING errcode = '22023';
    END IF;
    RETURN QUERY SELECT
      CASE WHEN v_run.completed_at IS NULL THEN 'resumed' ELSE 'completed' END,
      v_cart.status::text;
    RETURN;
  END IF;

  IF v_cart.id IS NULL
     OR v_cart.status IS DISTINCT FROM 'active'
     OR v_cart.stripe_checkout_session_id IS DISTINCT FROM p_session_id THEN
    RETURN QUERY SELECT 'not_claimable'::text, v_cart.status::text;
    RETURN;
  END IF;

  -- The verified amounts must price exactly the lines the cart holds now,
  -- each a whole, non-negative number of cents.
  SELECT count(*) INTO v_item_count
    FROM public.entry_cart_items i WHERE i.cart_id = p_cart_id;
  SELECT count(*) INTO v_amount_count FROM jsonb_object_keys(p_line_amounts);
  SELECT count(*) INTO v_priced_count
    FROM public.entry_cart_items i
   WHERE i.cart_id = p_cart_id
     AND jsonb_typeof(p_line_amounts -> i.id::text) = 'number'
     AND (p_line_amounts ->> i.id::text)::numeric >= 0
     AND (p_line_amounts ->> i.id::text)::numeric = trunc((p_line_amounts ->> i.id::text)::numeric);
  IF v_item_count = 0 OR v_amount_count <> v_item_count OR v_priced_count <> v_item_count THEN
    RAISE EXCEPTION 'begin_cart_fulfillment: the line amounts must price exactly the % line(s) of cart %',
      v_item_count, p_cart_id
      USING errcode = '22023';
  END IF;

  INSERT INTO public.cart_fulfillments (
    stripe_checkout_session_id, cart_id, show_id, exhibitor_id, stripe_payment_intent_id
  )
  VALUES (p_session_id, p_cart_id, v_cart.show_id, v_cart.exhibitor_id, p_payment_intent_id);

  INSERT INTO public.cart_fulfillment_lines (
    stripe_checkout_session_id, cart_item_id, line_no, dog_id, class_id, trial_id, handler_id,
    jump_height, special_requests, junior_fee_declared, existing_entry_id, line_amount_cents
  )
  SELECT p_session_id, i.id,
         row_number() OVER (ORDER BY i.created_at, i.id)::integer,
         i.dog_id, i.class_id, cl.trial_id, i.handler_id, i.jump_height, i.special_requests,
         i.junior_fee_declared, i.entry_id, (p_line_amounts ->> i.id::text)::integer
    FROM public.entry_cart_items i
    LEFT JOIN public.classes cl ON cl.id = i.class_id
   WHERE i.cart_id = p_cart_id;

  UPDATE public.entry_carts c
     SET status = 'fulfilling'
   WHERE c.id = p_cart_id;

  RETURN QUERY SELECT 'begun'::text, 'fulfilling'::text;
END;
$$;

-- Work one NEW line: create its entry at most once, and record the outcome.
-- A repeat call returns the recorded outcome (replayed = true) and never calls
-- create_online_paid_entry again, so class capacity changing in between
-- cannot change it. A deterministic error is recorded as 'failed' with its
-- message; a transient one re-raises and records nothing.
CREATE OR REPLACE FUNCTION public.fulfill_cart_line(
  p_session_id text,
  p_cart_item_id uuid
)
RETURNS TABLE (
  outcome text,
  entry_id uuid,
  waitlist_entry_id uuid,
  error_message text,
  replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_run public.cart_fulfillments%ROWTYPE;
  v_line public.cart_fulfillment_lines%ROWTYPE;
  v_created record;
  v_outcome text;
  v_entry uuid;
  v_waitlist uuid;
  v_error text;
BEGIN
  SELECT * INTO v_run
    FROM public.cart_fulfillments f
   WHERE f.stripe_checkout_session_id = p_session_id;
  -- The line's row lock serialises two deliveries working the same line.
  SELECT * INTO v_line
    FROM public.cart_fulfillment_lines l
   WHERE l.stripe_checkout_session_id = p_session_id
     AND l.cart_item_id = p_cart_item_id
   FOR UPDATE;
  IF v_run.stripe_checkout_session_id IS NULL OR v_line.cart_item_id IS NULL THEN
    RAISE EXCEPTION 'fulfill_cart_line: no line % in session %', p_cart_item_id, p_session_id
      USING errcode = 'P0002';
  END IF;

  IF v_line.outcome IS NOT NULL THEN
    RETURN QUERY SELECT v_line.outcome, v_line.entry_id, v_line.waitlist_entry_id,
      v_line.error_message, true;
    RETURN;
  END IF;

  IF v_line.existing_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'fulfill_cart_line: line % pays an existing entry; record it with record_cart_line_outcome',
      p_cart_item_id
      USING errcode = '22023';
  END IF;

  BEGIN
    SELECT * INTO v_created
      FROM public.create_online_paid_entry(
        v_line.dog_id,
        v_line.class_id,
        v_line.handler_id,
        v_line.line_amount_cents / 100.0,
        v_line.jump_height,
        v_line.special_requests,
        v_run.stripe_payment_intent_id,
        v_run.created_at,
        v_run.show_id,
        v_line.trial_id,
        v_run.exhibitor_id,
        v_line.junior_fee_declared
      ) AS x;
    IF v_created.outcome = 'created_entry' AND v_created.entry_id IS NOT NULL THEN
      v_outcome := 'created_entry';
      v_entry := v_created.entry_id;
    ELSIF v_created.outcome = 'waitlisted' AND v_created.waitlist_entry_id IS NOT NULL THEN
      v_outcome := 'waitlisted';
      v_waitlist := v_created.waitlist_entry_id;
    ELSIF v_created.outcome = 'denied' THEN
      v_outcome := 'denied';
    ELSE
      v_outcome := 'failed';
      v_error := 'create_online_paid_entry returned no usable outcome ('
        || COALESCE(v_created.outcome, 'none') || ')';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Transient classes: transaction rollback (serialization, deadlock),
    -- connection, insufficient resources, operator intervention, system and
    -- internal errors, and a lock that could not be taken. Nothing is
    -- recorded; the redelivery works the line again.
    IF left(SQLSTATE, 2) IN ('08', '40', '53', '57', '58', 'XX') OR SQLSTATE = '55P03' THEN
      RAISE;
    END IF;
    v_outcome := 'failed';
    v_error := SQLSTATE || ': ' || SQLERRM;
  END;

  UPDATE public.cart_fulfillment_lines l
     SET outcome = v_outcome,
         entry_id = v_entry,
         paid_entry_id = v_entry,
         waitlist_entry_id = v_waitlist,
         error_message = v_error,
         resolved_at = now()
   WHERE l.stripe_checkout_session_id = p_session_id
     AND l.cart_item_id = p_cart_item_id;

  RETURN QUERY SELECT v_outcome, v_entry, v_waitlist, v_error, false;
END;
$$;

-- Record a Finish Payment line's outcome (the webhook pays the existing entry
-- in place). First write wins: a repeat returns what was recorded
-- (replayed = true). paid_existing is accepted only for an entry this run's
-- payment intent actually paid.
CREATE OR REPLACE FUNCTION public.record_cart_line_outcome(
  p_session_id text,
  p_cart_item_id uuid,
  p_outcome text,
  p_entry_id uuid DEFAULT NULL,
  p_paid_entry_id uuid DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS TABLE (
  outcome text,
  entry_id uuid,
  paid_entry_id uuid,
  error_message text,
  replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_run public.cart_fulfillments%ROWTYPE;
  v_line public.cart_fulfillment_lines%ROWTYPE;
BEGIN
  SELECT * INTO v_run
    FROM public.cart_fulfillments f
   WHERE f.stripe_checkout_session_id = p_session_id;
  SELECT * INTO v_line
    FROM public.cart_fulfillment_lines l
   WHERE l.stripe_checkout_session_id = p_session_id
     AND l.cart_item_id = p_cart_item_id
   FOR UPDATE;
  IF v_run.stripe_checkout_session_id IS NULL OR v_line.cart_item_id IS NULL THEN
    RAISE EXCEPTION 'record_cart_line_outcome: no line % in session %', p_cart_item_id, p_session_id
      USING errcode = 'P0002';
  END IF;

  IF v_line.outcome IS NOT NULL THEN
    RETURN QUERY SELECT v_line.outcome, v_line.entry_id, v_line.paid_entry_id,
      v_line.error_message, true;
    RETURN;
  END IF;

  IF v_line.existing_entry_id IS NULL THEN
    RAISE EXCEPTION 'record_cart_line_outcome: line % is a new line; fulfill_cart_line works it',
      p_cart_item_id
      USING errcode = '22023';
  END IF;
  IF p_outcome IS DISTINCT FROM 'paid_existing' AND p_outcome IS DISTINCT FROM 'failed' THEN
    RAISE EXCEPTION 'record_cart_line_outcome: outcome must be paid_existing or failed'
      USING errcode = '22023';
  END IF;
  IF p_outcome = 'paid_existing' AND (
       p_entry_id IS NULL OR p_paid_entry_id IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.entries e
          WHERE e.id = p_paid_entry_id
            AND e.payment_status = 'paid'
            AND e.stripe_payment_intent_id = v_run.stripe_payment_intent_id
       )) THEN
    RAISE EXCEPTION 'record_cart_line_outcome: entry % is not paid by this checkout', p_paid_entry_id
      USING errcode = '22023';
  END IF;
  IF p_outcome = 'failed' AND (p_error_message IS NULL OR btrim(p_error_message) = '') THEN
    RAISE EXCEPTION 'record_cart_line_outcome: a failed line needs its reason'
      USING errcode = '22023';
  END IF;

  UPDATE public.cart_fulfillment_lines l
     SET outcome = p_outcome,
         entry_id = CASE WHEN p_outcome = 'paid_existing' THEN p_entry_id END,
         paid_entry_id = CASE WHEN p_outcome = 'paid_existing' THEN p_paid_entry_id END,
         error_message = CASE WHEN p_outcome = 'failed' THEN p_error_message END,
         resolved_at = now()
   WHERE l.stripe_checkout_session_id = p_session_id
     AND l.cart_item_id = p_cart_item_id;

  RETURN QUERY SELECT l.outcome, l.entry_id, l.paid_entry_id, l.error_message, false
    FROM public.cart_fulfillment_lines l
   WHERE l.stripe_checkout_session_id = p_session_id
     AND l.cart_item_id = p_cart_item_id;
END;
$$;

-- Close the latch LAST, with the order and the cart-overflow refund request,
-- in ONE transaction:
--   * refused (55000) while any line has no recorded outcome;
--   * refused (22023) unless the order's entry_ids are exactly the recorded
--     paid lines, and unless a refund is for a run with an unserved line and
--     no more than the charge;
--   * a run not yet complete: the cart moves fulfilling -> submitted, the
--     order is inserted (ON CONFLICT DO NOTHING), the run is marked complete;
--   * with p_amount_cents, the cart_overflow request is inserted, idempotent
--     on (session, kind), whether or not this call closed the latch.
-- It returns the session's cart_overflow request, if any, so a retry after a
-- lost response finds it.
CREATE OR REPLACE FUNCTION public.complete_cart_fulfillment(
  p_session_id text,
  p_order jsonb,
  p_amount_cents integer DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_detail jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  latch_closed boolean,
  cart_status text,
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
  v_cart_id uuid;
  v_cart_status text;
  v_run public.cart_fulfillments%ROWTYPE;
  v_closed boolean := false;
  v_order_rows integer := 0;
  v_id uuid;
  v_req public.refund_requests%ROWTYPE;
BEGIN
  IF p_session_id IS NULL OR p_order IS NULL OR jsonb_typeof(p_order) <> 'object' THEN
    RAISE EXCEPTION 'complete_cart_fulfillment: a session and its order are required'
      USING errcode = '22023';
  END IF;
  IF p_amount_cents IS NOT NULL AND (p_amount_cents <= 0 OR p_reason IS NULL) THEN
    RAISE EXCEPTION 'complete_cart_fulfillment: a refund needs a positive amount and a reason'
      USING errcode = '22023';
  END IF;

  -- Lock order: the cart, then the run (as begin_cart_fulfillment).
  SELECT f.cart_id INTO v_cart_id
    FROM public.cart_fulfillments f
   WHERE f.stripe_checkout_session_id = p_session_id;
  IF v_cart_id IS NOT NULL THEN
    SELECT c.status INTO v_cart_status
      FROM public.entry_carts c
     WHERE c.id = v_cart_id
     FOR UPDATE;
  END IF;
  SELECT * INTO v_run
    FROM public.cart_fulfillments f
   WHERE f.stripe_checkout_session_id = p_session_id
   FOR UPDATE;
  IF v_run.stripe_checkout_session_id IS NULL THEN
    RAISE EXCEPTION 'complete_cart_fulfillment: no fulfillment run for session %', p_session_id
      USING errcode = 'P0002';
  END IF;

  -- Latch LAST: every line's outcome is recorded first.
  IF EXISTS (SELECT 1 FROM public.cart_fulfillment_lines l
              WHERE l.stripe_checkout_session_id = p_session_id
                AND l.outcome IS NULL) THEN
    RAISE EXCEPTION 'complete_cart_fulfillment: session % has a line with no recorded outcome', p_session_id
      USING errcode = '55000';
  END IF;

  IF (p_order ->> 'stripe_payment_intent_id') IS DISTINCT FROM v_run.stripe_payment_intent_id THEN
    RAISE EXCEPTION 'complete_cart_fulfillment: the order is not for this run''s payment intent'
      USING errcode = '22023';
  END IF;
  IF (SELECT COALESCE(array_agg(x ORDER BY x), '{}')
        FROM jsonb_array_elements_text(COALESCE(p_order -> 'entry_ids', '[]'::jsonb)) AS x)
     IS DISTINCT FROM
     (SELECT COALESCE(array_agg(l.entry_id::text ORDER BY l.entry_id::text), '{}')
        FROM public.cart_fulfillment_lines l
       WHERE l.stripe_checkout_session_id = p_session_id
         AND l.outcome IN ('created_entry', 'paid_existing')) THEN
    RAISE EXCEPTION 'complete_cart_fulfillment: the order''s entries are not the recorded paid lines'
      USING errcode = '22023';
  END IF;
  IF p_amount_cents IS NOT NULL AND (
       NOT EXISTS (SELECT 1 FROM public.cart_fulfillment_lines l
                    WHERE l.stripe_checkout_session_id = p_session_id
                      AND l.outcome IN ('waitlisted', 'denied', 'failed'))
       OR p_amount_cents > COALESCE((p_order ->> 'amount_cents')::integer, 0)) THEN
    RAISE EXCEPTION 'complete_cart_fulfillment: a refund needs an unserved line and cannot exceed the charge'
      USING errcode = '22023';
  END IF;

  IF v_run.completed_at IS NULL THEN
    IF v_cart_status IS NOT NULL THEN
      IF v_cart_status <> 'fulfilling' THEN
        RAISE EXCEPTION 'complete_cart_fulfillment: cart % is %, not fulfilling', v_cart_id, v_cart_status
          USING errcode = '55000';
      END IF;
      UPDATE public.entry_carts c
         SET status = 'submitted'
       WHERE c.id = v_cart_id;
      v_cart_status := 'submitted';
    END IF;

    -- The order, column for column as the webhook built it, typed by the
    -- table itself. The session id is this call's, never the payload's.
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

    UPDATE public.cart_fulfillments f
       SET completed_at = now()
     WHERE f.stripe_checkout_session_id = p_session_id;
    v_closed := true;
  END IF;

  IF p_amount_cents IS NOT NULL THEN
    INSERT INTO public.refund_requests AS r (
      kind, stripe_checkout_session_id, stripe_payment_intent_id, amount_cents,
      reason, cart_id, show_id, detail
    )
    VALUES (
      'cart_overflow', p_session_id, v_run.stripe_payment_intent_id, p_amount_cents, p_reason,
      (SELECT c.id FROM public.entry_carts c WHERE c.id = v_run.cart_id),
      (SELECT sh.id FROM public.shows sh WHERE sh.id = v_run.show_id),
      COALESCE(p_detail, '{}'::jsonb)
        || jsonb_strip_nulls(jsonb_build_object(
             'cart_id', v_run.cart_id,
             'show_id', v_run.show_id))
    )
    ON CONFLICT (stripe_checkout_session_id, kind) DO NOTHING
    RETURNING r.id INTO v_id;
  END IF;

  SELECT * INTO v_req
    FROM public.refund_requests r
   WHERE r.stripe_checkout_session_id = p_session_id
     AND r.kind = 'cart_overflow';

  RETURN QUERY SELECT v_closed, v_cart_status, (v_order_rows > 0), v_req.id, (v_id IS NOT NULL),
    v_req.status, v_req.amount_cents, v_req.reason, v_req.stripe_payment_intent_id;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_cart_fulfillment(uuid, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fulfill_cart_line(text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_cart_line_outcome(text, uuid, text, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_cart_fulfillment(text, jsonb, integer, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_cart_fulfillment(uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fulfill_cart_line(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_cart_line_outcome(text, uuid, text, uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_cart_fulfillment(text, jsonb, integer, text, jsonb)
  TO service_role;

COMMIT;
