-- =============================================================================
-- MYK9-879 (junior handler fee, slice C): the exhibitor's junior-handler
-- declaration at online card checkout. Plan: docs/plan-junior-handler-fee-v2.md.
--
-- DECISION (Richard, 2026-09-30, MYK9-879 comments): the EXHIBITOR SELF-DECLARES.
-- The registrant ticks "the handler (the person showing the dog) is under 18"
-- for a dog entry in the registration wizard; card checkout then charges the
-- show's junior_handler_fee, capped at the regular fee (LEAST, the same rule as
-- private.price_entry_fee). It is about the HANDLER's age, not who owns the dog:
-- a parent owns the dog and the child handles it, so the server honors the
-- declaration whenever the show has a junior tier (junior_handler_fee > 0) and
-- never looks at who owns the dog. No date of birth is read anywhere in this
-- slice and junior status is never derived (that was the MYK9-664 age oracle).
-- These are club trials: the secretary can call out misuse, so the declaration
-- is recorded on the entry and shown to the secretary in Entries Management.
--
-- WHAT THIS MIGRATION ADDS
--   1. entry_cart_items.junior_fee_declared boolean NOT NULL DEFAULT false: the
--      declaration as the exhibitor made it. The cart is client-writable (owner
--      RLS covers every column), so checkout and the webhook treat it as a
--      request: honored only on a show with a junior tier, priced through the
--      shared authoritative function, and verified against the amount charged.
--   2. entries.junior_fee_declared boolean NOT NULL DEFAULT false: the RECORD that
--      the junior fee was charged on an exhibitor's declaration. A separate column
--      from slice B's junior_fee_override_by on purpose: that one is a secretary's
--      people.id stamp and must never carry a non-secretary. Written only by
--      create_online_paid_entry (service_role, the webhook). A direct client
--      INSERT/UPDATE cannot set or change it: trg_entries_junior_fee (slice B's
--      direct-write discriminator) forces false on INSERT and keeps OLD on UPDATE.
--      SELECT is granted to authenticated (RLS still scopes the rows) so the
--      secretary's entry list can mark declared entries; anon has no access.
--   3. create_online_paid_entry gains p_junior_fee_declared (default false), stored
--      on the entry only when the show has a junior tier. The fee itself is still
--      p_entry_fee, which the webhook verified against the paid amount.
--   4. A cart item whose declaration changes severs the checkout-session link, like
--      every other price-affecting cart column, so a Stripe page opened before the
--      change cannot be paid against a different price.
--
-- FROZEN AFTER CREATION: the fee is fixed at entry creation (slice B froze
-- entry_fee against direct client UPDATEs; this freezes the declaration likewise).
-- No refund is issued by anything here.
--
-- trg_entries_junior_fee / private.entries_apply_junior_fee are rebuilt from
-- 20260930214300_myk9_878_junior_handler_fee_pricing.sql, the only migration
-- defining them. create_online_paid_entry is rebuilt from
-- 20260925004700_myk9_705_656_class_entry_availability.sql, the LATEST migration
-- defining it (`grep -l 'FUNCTION public.create_online_paid_entry'
-- supabase/migrations/ | sort | tail -1`); the only edits are the new parameter,
-- the v_declared computation and the stored column. The 11-argument signature is
-- dropped first so a second overload cannot linger beside the new one.
--
-- Behavioral coverage: supabase/tests/myk9_879_junior_declaration_test.sql
-- (behavioral SQL tests run only in CI - no container runtime locally).
-- =============================================================================

BEGIN;

ALTER TABLE public.entry_cart_items
  ADD COLUMN IF NOT EXISTS junior_fee_declared boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.entry_cart_items.junior_fee_declared IS
  'MYK9-879: the exhibitor declared the handler is a junior for this line. A request only: checkout honors it when the show has a junior tier and verifies the charged amount. Client-writable like the rest of the cart; changing it severs the checkout session.';

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS junior_fee_declared boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.entries.junior_fee_declared IS
  'MYK9-879: the junior handler fee was charged on the exhibitor''s own declaration at online checkout. Separate from junior_fee_override_by (a secretary stamp). Written only by create_online_paid_entry; a direct client insert/update cannot set or change it.';

-- Column grants, stated rather than inherited. entries has column-level SELECT
-- for authenticated and an empty allowlist for anon (anonEntriesGrantContract).
GRANT SELECT (junior_fee_declared) ON public.entries TO authenticated;
REVOKE ALL (junior_fee_declared) ON public.entries FROM anon;

-- ---------------------------------------------------------------------------
-- Direct-write discriminator (slice B) now also owns junior_fee_declared.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.entries_apply_junior_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_override boolean;
  v_priced   record;
BEGIN
  IF current_setting('myk9.entries_direct_write', true) IS DISTINCT FROM 'on' THEN
    RETURN NEW;
  END IF;

  -- The fee is fixed at creation, then frozen (plan: "the fee is fixed at entry
  -- creation"). A direct client UPDATE keeps the stored fee and both audit
  -- records, so a queued full-row upload from a device that still holds the
  -- regular fee cannot write it back over the server-priced one.
  IF TG_OP = 'UPDATE' THEN
    NEW.junior_fee_override_by := OLD.junior_fee_override_by;
    NEW.junior_fee_declared := OLD.junior_fee_declared;
    NEW.entry_fee := OLD.entry_fee;
    RETURN NEW;
  END IF;

  -- MYK9-879: only create_online_paid_entry records a declaration. A client
  -- cannot assert one on a direct insert.
  NEW.junior_fee_declared := false;

  v_override := NEW.junior_fee_override_by IS NOT NULL;
  NEW.junior_fee_override_by := NULL;

  IF NEW.show_id IS NULL OR NEW.class_id IS NULL THEN
    IF v_override THEN
      RAISE EXCEPTION 'a junior fee override needs a show and a class' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO v_priced
    FROM private.price_entry_fee(
      NEW.show_id, NEW.class_id, COALESCE(NEW.is_day_of_show, false), v_override
    );

  -- Only ever LOWERS the client's fee: a waived entry (fee 0) and any fee the
  -- desk already set below the junior fee stay as they are.
  IF v_priced.junior_fee_applied
     AND (NEW.entry_fee IS NULL OR v_priced.fee < NEW.entry_fee)
  THEN
    NEW.entry_fee := v_priced.fee;
  END IF;

  IF v_override AND v_priced.junior_fee_applied AND NEW.entry_fee = v_priced.fee THEN
    NEW.junior_fee_override_by := (
      SELECT p.id FROM public.people p WHERE p.auth_user_id = auth.uid() LIMIT 1
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.entries_apply_junior_fee() FROM PUBLIC;

-- Both triggers fire on an UPDATE of the new column too, or a bare
-- `UPDATE entries SET junior_fee_declared = true` would never reach them.
DROP TRIGGER IF EXISTS trg_entries_00_direct_write_gate ON public.entries;
CREATE TRIGGER trg_entries_00_direct_write_gate
  BEFORE INSERT OR UPDATE OF junior_fee_override_by, entry_fee, junior_fee_declared ON public.entries
  FOR EACH ROW EXECUTE FUNCTION private.entries_direct_write_gate();

DROP TRIGGER IF EXISTS trg_entries_junior_fee ON public.entries;
CREATE TRIGGER trg_entries_junior_fee
  BEFORE INSERT OR UPDATE OF junior_fee_override_by, entry_fee, junior_fee_declared ON public.entries
  FOR EACH ROW EXECUTE FUNCTION private.entries_apply_junior_fee();

-- ---------------------------------------------------------------------------
-- A changed declaration severs the checkout session, like every other cart
-- column that changes what is charged.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_cart_item_junior_declaration_sever_session ON public.entry_cart_items;
CREATE TRIGGER trg_cart_item_junior_declaration_sever_session
  AFTER UPDATE OF junior_fee_declared ON public.entry_cart_items
  FOR EACH ROW
  WHEN (OLD.junior_fee_declared IS DISTINCT FROM NEW.junior_fee_declared)
  EXECUTE FUNCTION public.cart_item_identity_change_sever_session();

-- ---------------------------------------------------------------------------
-- create_online_paid_entry
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_online_paid_entry(
  uuid, uuid, uuid, numeric, text, text, text, timestamptz, uuid, uuid, uuid
);

CREATE OR REPLACE FUNCTION public.create_online_paid_entry(
  p_dog_id uuid,
  p_class_id uuid,
  p_handler_id uuid,
  p_entry_fee numeric,
  p_jump_height text,
  p_special_requests text,
  p_payment_intent_id text,
  p_submitted_at timestamptz,
  p_show_id uuid,
  p_trial_id uuid,
  p_exhibitor_id uuid,
  p_junior_fee_declared boolean DEFAULT false
)
RETURNS TABLE (
  outcome text,
  entry_id uuid,
  waitlist_entry_id uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid;
  v_trial_id uuid;
  v_entry public.entries;
  v_capacity record;
  v_block text;
  v_declared boolean;
BEGIN
  SELECT c.trial_id, t.show_id
  INTO v_trial_id, v_show_id
  FROM public.classes c
  JOIN public.trials t ON t.id = c.trial_id
  WHERE c.id = p_class_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Class not found for online paid entry'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_show_id IS DISTINCT FROM p_show_id THEN
    RAISE EXCEPTION 'Class does not belong to paid cart show'
      USING ERRCODE = '23514';
  END IF;

  IF p_trial_id IS NOT NULL AND v_trial_id IS DISTINCT FROM p_trial_id THEN
    RAISE EXCEPTION 'Class does not belong to paid cart trial'
      USING ERRCODE = '23514';
  END IF;

  -- MYK9-656: a class that closed after checkout is refused, not entered.
  SELECT a.self_service_block
  INTO v_block
  FROM public.class_entry_availability(ARRAY[p_class_id]) a;

  IF v_block IN ('cancelled', 'started', 'finished') THEN
    outcome := 'denied';
    entry_id := NULL;
    waitlist_entry_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT *
  INTO v_capacity
  FROM public.evaluate_entry_capacity(
    p_class_id,
    p_dog_id,
    p_exhibitor_id,
    p_handler_id,
    'self_service',
    false
  );

  IF v_capacity.outcome = 'waitlisted' THEN
    outcome := 'waitlisted';
    entry_id := NULL;
    waitlist_entry_id := v_capacity.waitlist_entry_id;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_capacity.outcome = 'denied' THEN
    outcome := 'denied';
    entry_id := NULL;
    waitlist_entry_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- MYK9-879: the declaration is RECORDED only where it could have changed the
  -- price (the show has a junior tier). It reads no date of birth and does not
  -- look at who owns the dog: it is about the handler. The fee stored is
  -- p_entry_fee, which the webhook already verified against the paid amount.
  v_declared := COALESCE(p_junior_fee_declared, false)
    AND EXISTS (
      SELECT 1 FROM public.shows s
       WHERE s.id = v_show_id AND s.junior_handler_fee IS NOT NULL AND s.junior_handler_fee > 0
    );

  INSERT INTO public.entries (
    dog_id,
    class_id,
    trial_id,
    show_id,
    handler_id,
    entry_status,
    payment_status,
    entry_fee,
    jump_height,
    special_requests,
    payment_method,
    submitted_at,
    stripe_payment_intent_id,
    junior_fee_declared
  )
  VALUES (
    p_dog_id,
    p_class_id,
    v_trial_id,
    v_show_id,
    p_handler_id,
    'paid',
    'paid',
    p_entry_fee,
    p_jump_height,
    p_special_requests,
    'online',
    p_submitted_at,
    p_payment_intent_id,
    v_declared
  )
  RETURNING * INTO v_entry;

  outcome := 'created_entry';
  entry_id := v_entry.id;
  waitlist_entry_id := NULL;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_online_paid_entry(
  uuid, uuid, uuid, numeric, text, text, text, timestamptz, uuid, uuid, uuid, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_online_paid_entry(
  uuid, uuid, uuid, numeric, text, text, text, timestamptz, uuid, uuid, uuid, boolean
) TO service_role;

-- Fail the push rather than ship a readable-by-anon declaration or a callable
-- paid-entry writer.
DO $$
BEGIN
  IF has_column_privilege('anon', 'public.entries', 'junior_fee_declared', 'SELECT')
     OR has_column_privilege('anon', 'public.entries', 'junior_fee_declared', 'INSERT')
     OR has_column_privilege('anon', 'public.entries', 'junior_fee_declared', 'UPDATE') THEN
    RAISE EXCEPTION 'anon has access to entries.junior_fee_declared; it must not';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.entries', 'junior_fee_declared', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated cannot read entries.junior_fee_declared; the secretary list needs it';
  END IF;
  IF has_function_privilege('anon',
       'public.create_online_paid_entry(uuid, uuid, uuid, numeric, text, text, text, timestamptz, uuid, uuid, uuid, boolean)',
       'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.create_online_paid_entry(uuid, uuid, uuid, numeric, text, text, text, timestamptz, uuid, uuid, uuid, boolean)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'an API role can execute create_online_paid_entry; only service_role may';
  END IF;
END $$;

COMMIT;
