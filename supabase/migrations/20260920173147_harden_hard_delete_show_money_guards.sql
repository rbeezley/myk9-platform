-- MYK9-615: the sole permanent-show-delete RPC must refuse before its first
-- destructive statement whenever money, payment-link, lock, promo, packet, or
-- cross-show entry evidence still belongs to the target show.

CREATE OR REPLACE FUNCTION public.hard_delete_show(p_show_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_count bigint;
  v_refund_count bigint;
  v_payment_link_count bigint;
  v_entry_payment_count bigint;
  v_enrollment_payment_count bigint;
  v_money_lock_count bigint;
  v_promo_code_count bigint;
  v_packet_snapshot_count bigint;
  v_cross_show_links bigint;
BEGIN
  -- Keep the existing site-admin authorization inside the SECURITY DEFINER RPC.
  IF NOT (SELECT is_platform_admin()) THEN
    RAISE EXCEPTION 'Permission denied: only site administrators can permanently delete shows'
      USING ERRCODE = '42501';
  END IF;

  -- Serialize deletion against writes that take an FK key-share lock on the
  -- show. Every refusal check and the later delete run in this same transaction.
  PERFORM 1
  FROM public.shows
  WHERE id = p_show_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Show not found' USING ERRCODE = 'P0002';
  END IF;

  -- Stripe orders may name the show, one of its enrollments, or one of its
  -- entries. The last route also covers legacy order rows whose show/enrollment
  -- scope was detached while their entry_ids still identify the purchase.
  SELECT count(*) INTO v_order_count
  FROM public.stripe_orders so
  WHERE so.show_id = p_show_id
     OR so.enrollment_id IN (
       SELECT en.id FROM public.enrollments en WHERE en.show_id = p_show_id
     )
     OR EXISTS (
       SELECT 1
       FROM public.entries e
       WHERE e.id = ANY(COALESCE(so.entry_ids, ARRAY[]::uuid[]))
         AND (
           e.show_id = p_show_id
           OR e.trial_id IN (SELECT t.id FROM public.trials t WHERE t.show_id = p_show_id)
           OR e.class_id IN (
             SELECT c.id
             FROM public.classes c
             JOIN public.trials t ON t.id = c.trial_id
             WHERE t.show_id = p_show_id
           )
           OR e.registration_id IN (
             SELECT en.id FROM public.enrollments en WHERE en.show_id = p_show_id
           )
         )
     );

  -- Refund rows are permanent ledger facts and can remain after their order is
  -- detached. Follow either the order scope or the entry's payment intent.
  SELECT count(*) INTO v_refund_count
  FROM public.stripe_order_refunds r
  WHERE EXISTS (
          SELECT 1
          FROM public.stripe_orders so
          WHERE so.id = r.order_id
            AND (
              so.show_id = p_show_id
              OR so.enrollment_id IN (
                SELECT en.id FROM public.enrollments en WHERE en.show_id = p_show_id
              )
              OR EXISTS (
                SELECT 1
                FROM public.entries e
                WHERE e.id = ANY(COALESCE(so.entry_ids, ARRAY[]::uuid[]))
                  AND (
                    e.show_id = p_show_id
                    OR e.trial_id IN (
                      SELECT t.id FROM public.trials t WHERE t.show_id = p_show_id
                    )
                    OR e.class_id IN (
                      SELECT c.id
                      FROM public.classes c
                      JOIN public.trials t ON t.id = c.trial_id
                      WHERE t.show_id = p_show_id
                    )
                    OR e.registration_id IN (
                      SELECT en.id FROM public.enrollments en WHERE en.show_id = p_show_id
                    )
                  )
              )
            )
        )
     OR EXISTS (
          SELECT 1
          FROM public.entries e
          WHERE e.stripe_payment_intent_id = r.stripe_payment_intent_id
            AND (
              e.show_id = p_show_id
              OR e.trial_id IN (
                SELECT t.id FROM public.trials t WHERE t.show_id = p_show_id
              )
              OR e.class_id IN (
                SELECT c.id
                FROM public.classes c
                JOIN public.trials t ON t.id = c.trial_id
                WHERE t.show_id = p_show_id
              )
              OR e.registration_id IN (
                SELECT en.id FROM public.enrollments en WHERE en.show_id = p_show_id
              )
            )
        );

  -- Payment links hold an external checkout session even before a Stripe order
  -- exists, so count both their direct show scope and entry_ids association.
  SELECT count(*) INTO v_payment_link_count
  FROM public.entry_payment_links l
  WHERE l.show_id = p_show_id
     OR EXISTS (
       SELECT 1
       FROM public.entries e
       WHERE e.id = ANY(l.entry_ids)
         AND (
           e.show_id = p_show_id
           OR e.trial_id IN (SELECT t.id FROM public.trials t WHERE t.show_id = p_show_id)
           OR e.class_id IN (
             SELECT c.id
             FROM public.classes c
             JOIN public.trials t ON t.id = c.trial_id
             WHERE t.show_id = p_show_id
           )
           OR e.registration_id IN (
             SELECT en.id FROM public.enrollments en WHERE en.show_id = p_show_id
           )
         )
     );

  -- Preserve entry-level money trails. entry_status='paid' alone is a workflow
  -- label; payment_status and the recorded amount/reference/refund fields are
  -- the financial evidence. Match the seed guard's secretary_paid $0 exception.
  SELECT count(*) INTO v_entry_payment_count
  FROM public.entries e
  WHERE (
        e.show_id = p_show_id
        OR e.trial_id IN (SELECT t.id FROM public.trials t WHERE t.show_id = p_show_id)
        OR e.class_id IN (
          SELECT c.id
          FROM public.classes c
          JOIN public.trials t ON t.id = c.trial_id
          WHERE t.show_id = p_show_id
        )
        OR e.registration_id IN (
          SELECT en.id FROM public.enrollments en WHERE en.show_id = p_show_id
        )
      )
    AND (
      e.payment_status IN ('paid', 'refunded')
      OR NULLIF(btrim(e.payment_reference), '') IS NOT NULL
      OR NULLIF(btrim(e.stripe_payment_intent_id), '') IS NOT NULL
      OR e.refund_amount IS NOT NULL
      OR e.refunded_at IS NOT NULL
      OR NULLIF(btrim(e.refund_notes), '') IS NOT NULL
      OR e.payment_received_on IS NOT NULL
      OR NULLIF(btrim(e.payment_notes), '') IS NOT NULL
      OR (
        e.payment_method IS NOT NULL
        AND e.payment_method <> 'waived'
        AND (e.payment_method <> 'secretary_paid' OR coalesce(e.entry_fee, 0) > 0)
      )
    );

  -- Enrollment payment statuses include the specific desk-payment methods and
  -- partial refunds, in addition to the generic paid/refunded states.
  SELECT count(*) INTO v_enrollment_payment_count
  FROM public.enrollments en
  WHERE en.show_id = p_show_id
    AND (
      en.payment_status IN (
        'paid', 'paid_online', 'paid_by_cash', 'paid_by_check', 'refunded', 'partial_refund'
      )
      OR NULLIF(btrim(en.payment_reference), '') IS NOT NULL
      OR coalesce(en.paid_amount, 0) <> 0
      OR en.refund_amount IS NOT NULL
      OR en.refunded_at IS NOT NULL
      OR NULLIF(btrim(en.refund_notes), '') IS NOT NULL
    );

  SELECT count(*) INTO v_money_lock_count
  FROM public.show_money_locks
  WHERE show_id = p_show_id;

  -- Promo codes may be show-scoped or trial-scoped.
  SELECT count(*) INTO v_promo_code_count
  FROM public.promo_codes pc
  WHERE pc.show_id = p_show_id
     OR pc.trial_id IN (SELECT t.id FROM public.trials t WHERE t.show_id = p_show_id);

  SELECT count(*) INTO v_packet_snapshot_count
  FROM public.trial_packet_snapshots
  WHERE show_id = p_show_id;

  IF v_order_count > 0
     OR v_refund_count > 0
     OR v_payment_link_count > 0
     OR v_entry_payment_count > 0
     OR v_enrollment_payment_count > 0
     OR v_money_lock_count > 0
     OR v_promo_code_count > 0
     OR v_packet_snapshot_count > 0 THEN
    RAISE EXCEPTION
      'payment evidence or show-linked records prevent permanent deletion (Stripe orders %, refunds %, entry payment links %, entry payment records %, enrollment payment records %, money locks %, promo codes %, trial packet snapshots %)',
      v_order_count, v_refund_count, v_payment_link_count, v_entry_payment_count,
      v_enrollment_payment_count, v_money_lock_count, v_promo_code_count,
      v_packet_snapshot_count
      USING ERRCODE = '23503';
  END IF;

  -- Deleting target classes/trials or enrollments would also delete this entry,
  -- despite its own show_id naming a different show. Refuse before child deletes.
  SELECT count(*) INTO v_cross_show_links
  FROM public.entries e
  WHERE e.show_id IS DISTINCT FROM p_show_id
    AND (
      e.trial_id IN (SELECT id FROM public.trials WHERE show_id = p_show_id)
      OR e.class_id IN (
        SELECT c.id
        FROM public.classes c
        JOIN public.trials t ON t.id = c.trial_id
        WHERE t.show_id = p_show_id
      )
      OR e.registration_id IN (
        SELECT id FROM public.enrollments WHERE show_id = p_show_id
      )
    );

  IF v_cross_show_links > 0 THEN
    RAISE EXCEPTION
      'cross-show entry association(s) prevent permanent deletion for show % (% row(s))',
      p_show_id, v_cross_show_links
      USING ERRCODE = '23503';
  END IF;

  -- Delete in the existing reviewed FK-safe order (deepest children first).

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

REVOKE ALL ON FUNCTION public.hard_delete_show(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hard_delete_show(UUID) TO authenticated;
