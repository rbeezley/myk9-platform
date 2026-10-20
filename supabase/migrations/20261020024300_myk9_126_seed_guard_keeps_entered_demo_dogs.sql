-- MYK9-126: seed-demo.sql stops deleting the six hand-authored demo dogs.
--
-- The 2026-10-19 G9 rehearsal (run 39357883251) aborted at the canonical
-- reseed: seven paid entries with a real payment trail (checks and cash) sit
-- on demo dogs entered in shows the reseed does not own -- a club's own show
-- among them. Deleting the dogs would have cascaded those entries away, so
-- this guard refused, correctly. The reseed now resets the demo dogs in place
-- instead, and this guard's demo-dog arm narrows to the one cascade route the
-- seed still runs for them: its explicit entry delete on the show-day fixture
-- shows. Every other arm is unchanged.
--
-- Copied from the latest definition (20260925181937_myk9_677_show_payments_ledger.sql);
-- only the demo-dog arm of the stray CTE differs.

CREATE OR REPLACE FUNCTION public.seed_demo_assert_no_paid_strays()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_real integer; v_bare integer; v_ids text; v_bare_ids text;
  v_enroll_real integer; v_enroll_ids text;
  v_order_real integer; v_order_ids text;
  v_ledger_real integer; v_ledger_ids text;
BEGIN
  -- Guard the HARM, not the label. A paid/refunded row that also carries a
  -- trail — entry_status_history, a Stripe payment intent or order, a recorded
  -- payment reference, a refund — loses that trail when a parent cascade takes
  -- it, and the reseed deletes all four of entries' cascade parents (classes,
  -- dogs, shows, trials; pg_constraint confdeltype='c' on each). Those abort.
  --
  -- A bare `payment_status='paid'` with NONE of that corroboration is a QA-walk
  -- artifact, not money: nothing is lost by letting it cascade. Aborting on
  -- those put a mandatory manual DELETE in front of the reseed, which is the
  -- tool the seed-reset runbook reaches for when staging is already broken, and
  -- any walk that marks a demo entry paid re-armed it. Those WARN instead, so
  -- they stay visible without wedging recovery.
  --
  -- The seed cannot trip either branch on its own rows: both of its entry
  -- deletes run before this call, and every INSERT INTO public.entries in that
  -- file writes into the myk9_109 id range or the hard-coded id list they
  -- remove.
  WITH scope_shows AS (
    SELECT id FROM public.shows
    WHERE id IN ('dededede-0000-0000-0000-000000000010',
                 'dededede-0000-0000-0000-000000000011',
                 'dededede-0000-0000-0000-000000000012')
       OR (id >= 'a1090000-0000-0000-0010-000000000000'::uuid
           AND id <  'a1090000-0000-0000-0011-000000000000'::uuid)
  ),
  stray AS (
    SELECT e.id, e.stripe_payment_intent_id, e.payment_reference, e.refunded_at,
           e.refund_amount, e.refund_decided_at,
           e.payment_method, e.payment_received_on, e.payment_notes, e.entry_fee
    FROM public.entries e
    WHERE e.payment_status IN ('paid', 'refunded')
      AND (e.show_id IN (SELECT id FROM scope_shows)
           OR e.trial_id IN (SELECT id FROM public.trials WHERE show_id IN (SELECT id FROM scope_shows))
           OR e.class_id IN (SELECT c.id FROM public.classes c
                             JOIN public.trials t ON t.id = c.trial_id
                             WHERE t.show_id IN (SELECT id FROM scope_shows))
           OR (e.dog_id >= 'a1090000-0000-0000-0001-000000000000'::uuid
               AND e.dog_id <  'a1090000-0000-0000-0002-000000000000'::uuid)
           -- MYK9-126: the six hand-authored demo dogs are no longer deleted;
           -- the reseed resets them in place. Their only remaining cascade
           -- route is the explicit entry delete the seed runs for those dogs on
           -- the show-day fixture shows (the retired ...014 and the minted
           -- ...0731 range), which are never deleted themselves. An entry a
           -- club took for a demo dog on its own show is outside the reseed
           -- and must not be counted here, or one real paper entry wedges every
           -- reseed (2026-10-19, run 39357883251).
           OR (e.dog_id IN ('dededede-0000-0000-0000-000000000041','dededede-0000-0000-0000-000000000042',
                            'dededede-0000-0000-0000-000000000043','dededede-0000-0000-0000-000000000044',
                            'dededede-0000-0000-0000-000000000045','dededede-0000-0000-0000-000000000046')
               AND (e.show_id = 'dededede-0000-0000-0000-000000000014'
                    OR (e.show_id >= 'dededede-0000-0000-0731-000000000000'::uuid
                        AND e.show_id <  'dededede-0000-0000-0732-000000000000'::uuid))))
  ),
  substantiated AS (
    SELECT s.id FROM stray s
    WHERE s.stripe_payment_intent_id IS NOT NULL
       OR s.payment_reference IS NOT NULL
       OR s.refunded_at IS NOT NULL
       OR s.refund_amount IS NOT NULL
       OR s.refund_decided_at IS NOT NULL
       -- A check or cash payment a secretary recorded has no Stripe trail BY
       -- DESIGN. Keying corroboration on Stripe-shaped evidence alone made a
       -- recorded $30 check read as an artifact, which is how this guard came
       -- to classify money as disposable to keep the script green.
       --
       -- MYK9-539: but ONE method is a label rather than a payment.
       -- 'secretary_paid' is the secretary wizard's DEFAULT and is routinely
       -- written on a $0.00 entry, where no money moved and nothing is lost by
       -- the cascade; aborting on it put a mandatory manual DELETE in front of
       -- the recovery tool. So that method — and only that method — has to
       -- clear a non-zero entry_fee before it counts as corroboration.
       -- Everything else keeps the unconditional reading, on purpose and
       -- fail-safe in two directions: a recorded check or cash payment still
       -- aborts at ANY fee (a $0 cheque is nonsense, and refusing costs an
       -- operator one deliberate DELETE while the alternative destroys a
       -- ledger row), and a payment method added to the app LATER lands in the
       -- unconditional branch by default rather than in the lenient one.
       --
       -- The fee condition is deliberately NOT hoisted onto the whole CTE
       -- either: every other column here (a Stripe intent, a reference, a
       -- received-on date, operator notes, a refund, history) is evidence of
       -- money on its own terms, and an `AND entry_fee > 0` over all of them
       -- would collapse the substantiated/bare split instead of narrowing it —
       -- every demo entry carries a fee.
       OR (s.payment_method IS NOT NULL AND s.payment_method <> 'waived'
           AND (s.payment_method <> 'secretary_paid' OR coalesce(s.entry_fee, 0) > 0))
       OR s.payment_received_on IS NOT NULL
       OR s.payment_notes IS NOT NULL
       OR EXISTS (SELECT 1 FROM public.entry_status_history h WHERE h.entry_id = s.id)
       OR EXISTS (SELECT 1 FROM public.stripe_orders o WHERE o.entry_ids @> ARRAY[s.id])
  ),
  -- MYK9-528. Unlike the entries arm above, this arm has NO trail-substantiated
  -- vs. bare split — ANY in-scope paid/refunded enrollment aborts the reseed.
  -- The secretary's "Mark Paid Online" action (EnrollmentCard.tsx ->
  -- updateEnrollmentPaymentStatus) writes payment_status='paid_online' with no
  -- payment_reference, no paid_amount, no linked stripe_orders row — nothing a
  -- trail requirement could see — so requiring a trail here let a real paid
  -- enrollment cascade away silently, which is the opposite of what this guard
  -- exists for. The WARN-then-cascade leniency above exists to keep the
  -- 1260-row load-entries reseed from wedging on QA-walk noise; enrollments is
  -- a handful of rows and never needs that leniency.
  --
  -- "Paid" mirrors the entries arm's disposition (paid ∪ refunded, never
  -- pending/waived) widened to enrollments' own richer payment_status
  -- vocabulary (migration 168): 'paid' is the generic value the webhook
  -- trigger and the secretary_paid/group_payment UI paths write; 'paid_online'
  -- / 'paid_by_cash' / 'paid_by_check' are the specific values the same UI
  -- also writes (buildEnrollmentPaymentFields); 'refunded' / 'partial_refund'
  -- are the two refund outcomes (enrollmentPayment.ts). This matches
  -- apps/myk9show/src/utils/enrollmentGrouping.ts's dispositionOf().
  enrollment_stray AS (
    SELECT en.id
    FROM public.enrollments en
    WHERE en.payment_status IN
            ('paid', 'paid_online', 'paid_by_cash', 'paid_by_check', 'refunded', 'partial_refund')
      AND en.show_id IN (SELECT id FROM scope_shows)
      -- The seed's own multi-dog order (section 6b, id ...070) is paid by
      -- fixture, and unlike the entries case above there is no pre-guard
      -- delete to clear it first: entries.registration_id (NO ACTION) must be
      -- cleared before the enrollment itself can go, and that clear runs much
      -- further down the seed. So it is still present, unexcluded, every time
      -- this runs. Exclude it by id — confirmed the ONLY enrollment the seed
      -- inserts (one INSERT INTO public.enrollments in that file).
      AND en.id <> 'dededede-0000-0000-0000-000000000070'
  ),
  -- MYK9-527. Both stripe_orders scope FKs are ON DELETE RESTRICT as of
  -- migration 20260915191700, so any order pointing at a show the reseed
  -- deletes — or at an enrollment on one of those shows, which cascades from
  -- shows — now ABORTS the reseed with a bare 23503 somewhere deep in the
  -- delete sequence instead of silently nulling the ledger. Refuse here
  -- instead, before the first parent delete, with the same operator
  -- instructions the two arms above carry.
  --
  -- Scoped to EVERY show in scope_shows, not only show ...010: the narrower
  -- guard further down section 0 (added in #2248) covers the demo exhibitor's
  -- enrollment and show ...010 only, so an order on ...011, ...012 or any
  -- a1090000… load show was unguarded. That is the mechanism that produced the
  -- 22 fully-orphaned rows on staging.
  --
  -- Rows whose scope columns are ALREADY null are deliberately NOT matched:
  -- they reference no parent, so RESTRICT cannot fire on them and they block
  -- nothing. The seed reports them with its own RAISE WARNING instead.
  --
  -- MYK9-748: the seed ALSO deletes its own enrollment ...070 by id, wherever
  -- it sits. Reassigned to a show outside scope_shows, an order on it matched
  -- neither route above, and the reseed died on the raw RESTRICT error this
  -- arm exists to replace. It is named here on its own.
  order_stray AS (
    SELECT so.id
    FROM public.stripe_orders so
    WHERE so.show_id IN (SELECT id FROM scope_shows)
       OR so.enrollment_id IN (
            SELECT en.id FROM public.enrollments en
            WHERE en.show_id IN (SELECT id FROM scope_shows)
          )
       OR so.enrollment_id = 'dededede-0000-0000-0000-000000000070'
  ),
  -- MYK9-677. public.show_payments is a money ledger with ON DELETE RESTRICT
  -- on show, enrollment and entry, like stripe_orders above: refuse here, with
  -- instructions, instead of dying on a raw 23503 deep in the delete sequence.
  -- Every row carries show_id, and its enrollment or entry sits on that same
  -- show, so the show scope plus the seed's own enrollment covers it; an entry
  -- on a demo dog in an unscoped show is reached through the stray CTE.
  ledger_stray AS (
    SELECT sp.id
    FROM public.show_payments sp
    WHERE sp.show_id IN (SELECT id FROM scope_shows)
       OR sp.enrollment_id = 'dededede-0000-0000-0000-000000000070'
       OR sp.entry_id IN (SELECT id FROM stray)
  )
  SELECT (SELECT count(*) FROM substantiated),
         (SELECT count(*) FROM stray) - (SELECT count(*) FROM substantiated),
         -- Capped: an unbounded list put 756 ids in one error line when it ran.
         (SELECT string_agg(t.id::text, ', ' ORDER BY t.id)
          FROM (SELECT id FROM substantiated ORDER BY id LIMIT 10) t),
         (SELECT string_agg(t.id::text || ' (method=' || coalesce(t.payment_method,'none')
                            || ', fee=' || coalesce(t.entry_fee::text,'none') || ')', ', ' ORDER BY t.id)
          FROM (SELECT id, payment_method, entry_fee FROM stray
                WHERE id NOT IN (SELECT id FROM substantiated) ORDER BY id LIMIT 10) t),
         (SELECT count(*) FROM enrollment_stray),
         (SELECT string_agg(t.id::text, ', ' ORDER BY t.id)
          FROM (SELECT id FROM enrollment_stray ORDER BY id LIMIT 10) t),
         (SELECT count(*) FROM order_stray),
         (SELECT string_agg(t.id::text, ', ' ORDER BY t.id)
          FROM (SELECT id FROM order_stray ORDER BY id LIMIT 10) t),
         (SELECT count(*) FROM ledger_stray),
         (SELECT string_agg(t.id::text, ', ' ORDER BY t.id)
          FROM (SELECT id FROM ledger_stray ORDER BY id LIMIT 10) t)
    INTO v_real, v_bare, v_ids, v_bare_ids, v_enroll_real, v_enroll_ids,
         v_order_real, v_order_ids, v_ledger_real, v_ledger_ids;

  IF v_bare > 0 THEN
    RAISE WARNING 'seed-demo: % paid/refunded entr(ies) on data this reseed deletes carry no payment trail (no history, no Stripe record, no reference, no non-zero recorded payment) and will be removed with their parents. First ids: %', v_bare, v_bare_ids;
  END IF;

  IF v_real > 0 THEN
    RAISE EXCEPTION 'seed-demo: % paid or refunded entr(ies) with a real payment trail sit on a show, trial, class or dog this reseed deletes — refusing to cascade them away. First ids: %. For the full set, run the substantiated CTE of public.seed_demo_assert_no_paid_strays() as a SELECT. To clear it, HARD-delete those rows: DELETE FROM public.entries WHERE id IN (...). Soft-deleting will NOT clear this — the guard ignores deleted_at on purpose, because a soft-deleted row still cascades. Never widen this guard to get past it.', v_real, v_ids;
  END IF;

  IF v_enroll_real > 0 THEN
    RAISE EXCEPTION 'seed-demo: % paid or refunded enrollment(s) sit on a show this reseed deletes — refusing to cascade them away. First ids: %. For the full set, run the enrollment_stray CTE of public.seed_demo_assert_no_paid_strays() as a SELECT. To clear it, HARD-delete those rows from public.enrollments by id (there is no soft-delete column to set instead — a cascade from shows takes the row regardless). Never widen this guard to get past it.', v_enroll_real, v_enroll_ids;
  END IF;

  IF v_order_real > 0 THEN
    RAISE EXCEPTION 'seed-demo: % Stripe order(s) point at a show this reseed deletes, or at an enrollment on one of those shows or the seed''s own enrollment ...070 — refusing to orphan a money ledger row (MYK9-527). First ids: %. Both scope FKs are ON DELETE RESTRICT (migration 20260915191700), so continuing would abort with a raw foreign-key violation later anyway. For the full set, run the order_stray CTE of public.seed_demo_assert_no_paid_strays() as a SELECT. To clear it, resolve those orders deliberately — reassign their scope, or delete them only as a reviewed operator step, remembering public.stripe_order_refunds.order_id is RESTRICT too. Never widen this guard to get past it.', v_order_real, v_order_ids;
  END IF;

  IF v_ledger_real > 0 THEN
    RAISE EXCEPTION 'seed-demo: % show_payments ledger row(s) sit on a show, enrollment or entry this reseed deletes — refusing to delete recorded cash/check money (MYK9-677). First ids: %. Its show, enrollment and entry FKs are ON DELETE RESTRICT (migration 20260925181937), so continuing would abort with a raw foreign-key violation later anyway. For the full set, run the ledger_stray CTE of public.seed_demo_assert_no_paid_strays() as a SELECT. To clear it, delete those ledger rows only as a reviewed operator step. Never widen this guard to get past it.', v_ledger_real, v_ledger_ids;
  END IF;
END;
$fn$;

COMMENT ON FUNCTION public.seed_demo_assert_no_paid_strays() IS
  'Seed-maintenance guard (MYK9-538). Raises if supabase/seed-demo.sql would cascade away a paid/refunded entry with a payment trail, a paid enrollment, a scoped Stripe order, or a show_payments ledger row (MYK9-677). Called only by the reseed under the postgres/service role; never exposed to clients.';

-- Not an application RPC. Nothing in the client should ever be able to run a
-- function that names the seed's fixed ids and raises on live money rows.
REVOKE ALL ON FUNCTION public.seed_demo_assert_no_paid_strays() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_demo_assert_no_paid_strays() FROM anon;
REVOKE ALL ON FUNCTION public.seed_demo_assert_no_paid_strays() FROM authenticated;
