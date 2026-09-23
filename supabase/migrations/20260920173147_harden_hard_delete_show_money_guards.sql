-- MYK9-615: the permanent-show-delete RPC refuses before its first destructive
-- statement whenever financial, checkout, packet, retained audit, or
-- cross-show entry evidence still belongs to the target show.

CREATE OR REPLACE FUNCTION public.hard_delete_show(p_show_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
  v_payout_count bigint;
  v_paperwork_print_count bigint;
  v_incident_count bigint;
  v_packet_claim_count bigint;
  v_cross_show_links bigint;
BEGIN
  -- Keep the existing site-admin authorization inside the SECURITY DEFINER RPC.
  IF NOT (SELECT public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Permission denied: only site administrators can permanently delete shows'
      USING ERRCODE = '42501';
  END IF;

  -- entry_ids and refund payment-intent associations are not foreign keys. Take
  -- short, fixed-order relation locks so new associations cannot arrive between
  -- the guards and delete. A timeout is fail-closed; only an operator may retry
  -- later during a quiet window (there is deliberately no automated retry).
  PERFORM pg_catalog.set_config('lock_timeout', '2s', true);
  LOCK TABLE public.stripe_orders IN EXCLUSIVE MODE;
  LOCK TABLE public.entry_payment_links IN EXCLUSIVE MODE;
  LOCK TABLE public.stripe_order_refunds IN EXCLUSIVE MODE;

  -- Serialize FK-backed inserts and updates against the target hierarchy and
  -- payment-field updates. Lock only this show's existing rows, in stable
  -- order, rather than table-locking hot enrollment / entry relations.
  PERFORM 1
  FROM public.shows
  WHERE id = p_show_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Show not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1
  FROM public.trials
  WHERE show_id = p_show_id
  ORDER BY id
  FOR UPDATE;

  PERFORM 1
  FROM public.classes c
  JOIN public.trials t ON t.id = c.trial_id
  WHERE t.show_id = p_show_id
  ORDER BY c.id
  FOR UPDATE OF c;

  PERFORM 1
  FROM public.enrollments
  WHERE show_id = p_show_id
  ORDER BY id
  FOR UPDATE;

  PERFORM 1
  FROM public.entries e
  WHERE e.show_id = p_show_id
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
  ORDER BY e.id
  FOR UPDATE OF e;

  -- All guards run after the association and scoped row locks, in this same
  -- transaction; a later refusal rolls the locks back with the transaction.

  -- Stripe orders may name the show, one of its enrollments, or one of its
  -- entries. The last route also covers legacy order rows whose show/enrollment
  -- scope was detached while their entry_ids still identify the purchase.
  SELECT pg_catalog.count(*) INTO v_order_count
  FROM public.stripe_orders so
  WHERE so.show_id = p_show_id
     OR so.enrollment_id IN (
       SELECT en.id FROM public.enrollments en WHERE en.show_id = p_show_id
     )
     OR EXISTS (
       SELECT 1
       FROM public.entries e
       WHERE e.id = ANY(COALESCE(so.entry_ids, ARRAY[]::pg_catalog.uuid[]))
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
  SELECT pg_catalog.count(*) INTO v_refund_count
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
                WHERE e.id = ANY(COALESCE(so.entry_ids, ARRAY[]::pg_catalog.uuid[]))
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
  SELECT pg_catalog.count(*) INTO v_payment_link_count
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
  SELECT pg_catalog.count(*) INTO v_entry_payment_count
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
      OR NULLIF(pg_catalog.btrim(e.payment_reference), '') IS NOT NULL
      OR NULLIF(pg_catalog.btrim(e.stripe_payment_intent_id), '') IS NOT NULL
      OR e.refund_amount IS NOT NULL
      OR e.refunded_at IS NOT NULL
      OR NULLIF(pg_catalog.btrim(e.refund_notes), '') IS NOT NULL
      OR e.payment_received_on IS NOT NULL
      OR NULLIF(pg_catalog.btrim(e.payment_notes), '') IS NOT NULL
      OR (
        e.payment_method IS NOT NULL
        AND e.payment_method <> 'waived'
        AND (e.payment_method <> 'secretary_paid' OR coalesce(e.entry_fee, 0) > 0)
      )
    );

  -- Enrollment payment statuses include the specific desk-payment methods and
  -- partial refunds, in addition to the generic paid/refunded states.
  SELECT pg_catalog.count(*) INTO v_enrollment_payment_count
  FROM public.enrollments en
  WHERE en.show_id = p_show_id
    AND (
      en.payment_status IN (
        'paid', 'paid_online', 'paid_by_cash', 'paid_by_check', 'refunded', 'partial_refund'
      )
      OR NULLIF(pg_catalog.btrim(en.payment_reference), '') IS NOT NULL
      OR coalesce(en.paid_amount, 0) <> 0
      OR en.refund_amount IS NOT NULL
      OR en.refunded_at IS NOT NULL
      OR NULLIF(pg_catalog.btrim(en.refund_notes), '') IS NOT NULL
    );

  SELECT pg_catalog.count(*) INTO v_money_lock_count
  FROM public.show_money_locks
  WHERE show_id = p_show_id;

  -- Promo codes may be show-scoped or trial-scoped.
  SELECT pg_catalog.count(*) INTO v_promo_code_count
  FROM public.promo_codes pc
  WHERE pc.show_id = p_show_id
     OR pc.trial_id IN (SELECT t.id FROM public.trials t WHERE t.show_id = p_show_id);

  SELECT pg_catalog.count(*) INTO v_packet_snapshot_count
  FROM public.trial_packet_snapshots
  WHERE show_id = p_show_id;

  -- These records are durable evidence, not ordinary disposable show children.
  -- Count every print confirmation (including voided rows) and every incident
  -- or generation claim, including failed packet-generation evidence.
  SELECT pg_catalog.count(*) INTO v_payout_count
  FROM public.show_payouts
  WHERE show_id = p_show_id;

  SELECT pg_catalog.count(*) INTO v_paperwork_print_count
  FROM public.paperwork_prints pp
  WHERE pp.show_id = p_show_id;

  SELECT pg_catalog.count(*) INTO v_incident_count
  FROM public.show_incidents si
  WHERE si.show_id = p_show_id;

  SELECT pg_catalog.count(*) INTO v_packet_claim_count
  FROM public.trial_packet_generation_claims pc
  WHERE pc.show_id = p_show_id;

  IF v_order_count > 0
     OR v_refund_count > 0
     OR v_payment_link_count > 0
     OR v_entry_payment_count > 0
     OR v_enrollment_payment_count > 0
     OR v_money_lock_count > 0
     OR v_promo_code_count > 0
     OR v_packet_snapshot_count > 0
     OR v_payout_count > 0
     OR v_paperwork_print_count > 0
     OR v_incident_count > 0
     OR v_packet_claim_count > 0 THEN
    RAISE EXCEPTION
      'payment evidence or retained show records prevent permanent deletion (Stripe orders %, refunds %, entry payment links %, entry payment records %, enrollment payment records %, money locks %, promo codes %, trial packet snapshots %, show payouts %, paperwork print confirmations %, show incidents %, packet generation claims %)',
      v_order_count, v_refund_count, v_payment_link_count, v_entry_payment_count,
      v_enrollment_payment_count, v_money_lock_count, v_promo_code_count,
      v_packet_snapshot_count, v_payout_count, v_paperwork_print_count,
      v_incident_count, v_packet_claim_count
      USING ERRCODE = '23503';
  END IF;

  -- Deleting target classes/trials or enrollments would also delete this entry,
  -- despite its own show_id naming a different show. Refuse before child deletes.
  SELECT pg_catalog.count(*) INTO v_cross_show_links
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
  DELETE FROM public.entries
  WHERE class_id IN (
    SELECT c.id FROM public.classes c
    JOIN public.trials t ON c.trial_id = t.id
    WHERE t.show_id = p_show_id
  );

  -- 2. Delete waitlist entries (references classes)
  DELETE FROM public.waitlist_entries
  WHERE class_id IN (
    SELECT c.id FROM public.classes c
    JOIN public.trials t ON c.trial_id = t.id
    WHERE t.show_id = p_show_id
  );

  -- 3. Delete cart items (references classes)
  DELETE FROM public.entry_cart_items
  WHERE class_id IN (
    SELECT c.id FROM public.classes c
    JOIN public.trials t ON c.trial_id = t.id
    WHERE t.show_id = p_show_id
  );

  -- 4. Delete carts (references shows)
  DELETE FROM public.entry_carts WHERE show_id = p_show_id;

  -- 5. Delete classes (references trials)
  DELETE FROM public.classes
  WHERE trial_id IN (
    SELECT t.id FROM public.trials t WHERE t.show_id = p_show_id
  );

  -- 6. Delete judge assignments (references shows)
  DELETE FROM public.judge_assignments WHERE show_id = p_show_id;

  -- 7. Delete trials (references shows)
  DELETE FROM public.trials WHERE show_id = p_show_id;

  -- 8. Delete the show
  DELETE FROM public.shows WHERE id = p_show_id;
EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION
    'Show deletion encountered a lock conflict within the 2-second timeout; no deletion occurred. An operator may retry during a quiet window; automated retries are disabled.'
    USING ERRCODE = '55P03';
END;
$$;

REVOKE ALL ON FUNCTION public.hard_delete_show(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hard_delete_show(UUID) TO authenticated;
