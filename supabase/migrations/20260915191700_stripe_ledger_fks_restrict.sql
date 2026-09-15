-- =============================================================================
-- MYK9-527: RESTRICT the Stripe ledger foreign keys.
--
-- Problem. public.stripe_orders is a money ledger, but its two scope columns
-- (show_id, enrollment_id) and public.stripe_order_refunds.order_id were all
-- ON DELETE SET NULL (pg_constraint confdeltype='n', verified read-only against
-- sojmvhhwsjxmfistvzbe on 2026-09-15). Deleting a show therefore cascaded to
-- enrollments (registrations_show_id_fkey, confdeltype='c') and silently nulled
-- both scope columns on every order that pointed at them. All 22 stripe_orders
-- rows on the linked database, spanning 2026-06-10..2026-09-13, already have
-- BOTH columns nulled that way; the order rows survive with their payment
-- intent, checkout session and fee split intact, but nothing joins them to what
-- they paid for any more.
--
-- Fix (MYK9-527 option 2, the reviewers' recommendation). Move the three FKs to
-- ON DELETE RESTRICT so a delete that would orphan a ledger row fails loudly
-- instead of quietly mutating the ledger. RESTRICT is checked immediately, so a
-- cascade arriving from shows -> enrollments aborts the whole statement.
--
-- Existing rows are unaffected: RESTRICT constrains DELETEs on the PARENT, and
-- the 22 already-orphaned rows hold NULL in these columns, so they reference no
-- parent and can never block one. This migration deletes nothing and rewrites
-- no data.
--
-- Companion changes shipped with this migration:
--   * public.hard_delete_show(uuid) (defined in 075_hard_delete_show_rpc.sql,
--     the ONLY migration that defines it -- copied from that file verbatim and
--     re-issued here with one added pre-check) now refuses a show that has
--     Stripe orders, with a readable message instead of a raw 23503.
--   * apps/myk9show/src/services/database/shows/writes.ts hardDeleteShow (the
--     site-admin Data Lifecycle tab's direct DELETE, which does NOT go through
--     the RPC above) pre-checks the same condition client-side.
--   * supabase/seed-demo.sql refuses to delete ANY show in scope_shows that
--     carries orders, not only show ...010.
--
-- GRANTS: none required and none changed. This migration creates no table, no
-- view and no sequence; ALTER TABLE ... DROP/ADD CONSTRAINT does not touch
-- pg_class.relacl or pg_attribute.attacl, and the CREATE OR REPLACE FUNCTION
-- below preserves the existing EXECUTE grant (re-asserted at the end to be
-- explicit). No RLS policy is added or changed.
-- =============================================================================

-- --- 1. stripe_orders.show_id -----------------------------------------------
ALTER TABLE public.stripe_orders
  DROP CONSTRAINT IF EXISTS stripe_orders_show_id_fkey;

ALTER TABLE public.stripe_orders
  ADD CONSTRAINT stripe_orders_show_id_fkey
  FOREIGN KEY (show_id) REFERENCES public.shows(id) ON DELETE RESTRICT;

-- --- 2. stripe_orders.enrollment_id -----------------------------------------
ALTER TABLE public.stripe_orders
  DROP CONSTRAINT IF EXISTS stripe_orders_enrollment_id_fkey;

ALTER TABLE public.stripe_orders
  ADD CONSTRAINT stripe_orders_enrollment_id_fkey
  FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE RESTRICT;

-- --- 3. stripe_order_refunds.order_id ---------------------------------------
-- The level below: deleting an order would otherwise orphan its refund rows,
-- which carry Stripe refund ids the webhook's payment-intent-keyed
-- reconciliation needs (chargeRefundedDecision.ts).
ALTER TABLE public.stripe_order_refunds
  DROP CONSTRAINT IF EXISTS stripe_order_refunds_order_id_fkey;

ALTER TABLE public.stripe_order_refunds
  ADD CONSTRAINT stripe_order_refunds_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.stripe_orders(id) ON DELETE RESTRICT;

-- stripe_orders.customer_id -> stripe_customers is deliberately LEFT as
-- ON DELETE SET NULL. A customer record is identity, not money: losing the link
-- does not make the charge unreconcilable (the payment intent still resolves
-- the customer at Stripe), and no code path in this repo deletes
-- stripe_customers rows.

-- --- 4. hard_delete_show: readable refusal instead of a raw FK violation -----
-- Copied from 075_hard_delete_show_rpc.sql, which `grep -l "CREATE OR REPLACE
-- FUNCTION public.hard_delete_show" supabase/migrations/` confirms is the only
-- migration that defines this function. The body below is that file's body with
-- exactly one addition: the Stripe-order pre-check. Callers: DeleteShowDialog
-- (apps/myk9show/src/components/shows/ShowDetails/dialogs/DeleteShowDialog.tsx).
CREATE OR REPLACE FUNCTION public.hard_delete_show(p_show_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orders integer;
BEGIN
  -- Permission check: site_admin only
  IF NOT (SELECT is_platform_admin()) THEN
    RAISE EXCEPTION 'Permission denied: only site administrators can permanently delete shows'
      USING ERRCODE = '42501';
  END IF;

  -- Verify show exists
  IF NOT EXISTS (SELECT 1 FROM shows WHERE id = p_show_id) THEN
    RAISE EXCEPTION 'Show not found' USING ERRCODE = '42501';
  END IF;

  -- MYK9-527: both stripe_orders scope FKs are ON DELETE RESTRICT as of this
  -- migration, so the final `DELETE FROM shows` (and the enrollments cascade it
  -- fires) would raise a bare 23503 here. Refuse first, with a message an admin
  -- can act on. Counted through the show directly AND through its enrollments,
  -- because either column alone is enough to block the delete.
  SELECT count(*) INTO v_orders
  FROM stripe_orders so
  WHERE so.show_id = p_show_id
     OR so.enrollment_id IN (SELECT id FROM enrollments WHERE show_id = p_show_id);

  IF v_orders > 0 THEN
    RAISE EXCEPTION
      'This show has % Stripe order(s); refunds and reconciliation still reference them. Permanent deletion is refused. Resolve or reassign those orders first.', v_orders
      USING ERRCODE = '23503';
  END IF;

  -- Delete in FK-safe order (deepest children first)

  -- 1. Delete entries (references classes)
  DELETE FROM entries
  WHERE class_id IN (
    SELECT c.id FROM classes c
    JOIN trials t ON c.trial_id = t.id
    WHERE t.show_id = p_show_id
  );

  -- 2. Delete waitlist entries (references classes)
  DELETE FROM waitlist_entries
  WHERE class_id IN (
    SELECT c.id FROM classes c
    JOIN trials t ON c.trial_id = t.id
    WHERE t.show_id = p_show_id
  );

  -- 3. Delete cart items (references classes)
  DELETE FROM entry_cart_items
  WHERE class_id IN (
    SELECT c.id FROM classes c
    JOIN trials t ON c.trial_id = t.id
    WHERE t.show_id = p_show_id
  );

  -- 4. Delete carts (references shows)
  DELETE FROM entry_carts WHERE show_id = p_show_id;

  -- 5. Delete classes (references trials)
  DELETE FROM classes
  WHERE trial_id IN (SELECT id FROM trials WHERE show_id = p_show_id);

  -- 6. Delete judge assignments (references shows)
  DELETE FROM judge_assignments WHERE show_id = p_show_id;

  -- 7. Delete trials (references shows)
  DELETE FROM trials WHERE show_id = p_show_id;

  -- 8. Delete the show
  DELETE FROM shows WHERE id = p_show_id;
END;
$$;

-- Access decision, restated in full rather than relying on CREATE OR REPLACE
-- preserving 075's grant. Permanent show deletion is a site-admin action gated
-- inside the function by is_platform_admin(); anon and PUBLIC must never reach
-- it, and an omitted REVOKE is not the same as exclusion in this project.
REVOKE ALL ON FUNCTION public.hard_delete_show(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hard_delete_show(UUID) TO authenticated;
