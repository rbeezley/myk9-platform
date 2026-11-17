-- =============================================================================
-- MYK9-2099: Deny refund works on a paid secretary removal and a paid no-show.
--
-- Owner decision (2026-11-16): the Pulls list also shows paid secretary
-- removals and paid no-shows awaiting a refund decision, and the Show Desk
-- pill, the Pulls menu count, the Pulls list and Finish the show all count the
-- same rows. The app's one definition is `refundToDecideRemoval`
-- (apps/myk9show/src/features/payments/pullReconciliation.ts): a paid-online
-- entry with no refund and no decision whose entry_status is 'scratched' (a
-- pull), 'withdrawn' (an exhibitor withdrawal with a reason code, or a
-- secretary removal with none) or 'absent' (a no-show).
--
-- Until now this function refused 'absent' and a codeless 'withdrawn' row, so
-- Deny refund on those rows raised 22023 and the row stayed "to decide" for
-- good. Issue refund needs no change here: stripe-refund-entry never read
-- entry_status.
--
-- 1. set_entry_refund_decision, COPIED FROM THE LATEST DEFINITION
--    (20260917214300_withdraw_or_pull_own_entry.sql; 20261004181900 names it
--    but leaves it in place, and 20260728120000 only re-grants it). Exactly two
--    things change: the status arm of the eligibility guard now admits
--    'scratched', 'withdrawn' (any reason code, including none) and 'absent';
--    and the sentence it raises names all of them. Still required, unchanged:
--    payment_method 'online', payment_status 'paid', no refund_amount, the
--    show-official authorization, SECURITY DEFINER with an empty search_path,
--    and the same EXECUTE grants. Only 'denied' is accepted; nothing here
--    moves money.
--
-- 2. restrict_entry_refund_decision_columns (the reinstate trigger), copied
--    from the same file. A decision is cleared when the row leaves the state it
--    was decided in; 'absent' joins the two removal states, or a no-show that
--    was denied, marked present and then marked absent again would keep the
--    stale denial and never return to the list. Nothing else changes.
--
-- Rollback: re-run the two CREATE OR REPLACE statements from
-- 20260917214300_withdraw_or_pull_own_entry.sql.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.set_entry_refund_decision(
  p_entry_id uuid,
  p_decision text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show_id uuid;
  v_club_id uuid;
  v_entry_status text;
  v_payment_method text;
  v_payment_status text;
  v_refund_amount numeric;
  v_refund_decision text;
BEGIN
  IF p_decision <> 'denied' THEN
    RAISE EXCEPTION 'unsupported refund decision: %', p_decision
      USING ERRCODE = '22023';
  END IF;

  SELECT e.show_id,
         s.club_id,
         e.entry_status,
         e.payment_method,
         e.payment_status,
         e.refund_amount,
         e.refund_decision
    INTO v_show_id,
         v_club_id,
         v_entry_status,
         v_payment_method,
         v_payment_status,
         v_refund_amount,
         v_refund_decision
    FROM public.entries e
    JOIN public.shows s ON s.id = e.show_id
   WHERE e.id = p_entry_id
     AND e.deleted_at IS NULL
     FOR UPDATE OF e;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'entry % not found', p_entry_id
      USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.is_site_admin()
    OR public.is_show_secretary(v_show_id)
    OR (v_club_id IS NOT NULL AND public.is_club_admin(v_club_id))
  ) THEN
    RAISE EXCEPTION 'not authorized to decide refund for entry %', p_entry_id
      USING ERRCODE = '42501';
  END IF;

  -- The status arm mirrors `refundToDecideRemoval` EXACTLY: the list that
  -- offers the decision and the function that records it must admit the same
  -- rows, or one of them is lying. 'withdrawn' covers an exhibitor withdrawal
  -- (a reason code) and a secretary removal (none); entries_withdrawal_reason_code_check
  -- allows no other code. Every arm COALESCEs, because three-valued logic fails
  -- OPEN here: with a NULL entry_status the IN is NULL, `NOT NULL` is NULL, the
  -- IF falls through, and a denial would be recorded on a row this guard was
  -- meant to refuse.
  IF COALESCE(v_payment_method, '') <> 'online'
     OR COALESCE(v_payment_status, '') <> 'paid'
     OR COALESCE(v_refund_amount, 0) > 0
     OR COALESCE(v_entry_status, '') NOT IN ('scratched', 'withdrawn', 'absent') THEN
    RAISE EXCEPTION 'entry % is not an unresolved paid-online pull, withdrawal, removal or no-show', p_entry_id
      USING ERRCODE = '22023';
  END IF;

  IF v_refund_decision = 'denied' THEN
    RETURN;
  END IF;

  UPDATE public.entries
     SET refund_decision = 'denied',
         refund_decided_at = now(),
         refund_decided_by = auth.uid(),
         updated_at = now()
   WHERE id = p_entry_id;
END;
$$;

COMMENT ON FUNCTION public.set_entry_refund_decision(uuid, text) IS
  'MYK9-2099: records a person''s explicit "Deny refund" for a paid-online entry '
  'that stopped running with no refund and no decision: a pull (scratched), a '
  'withdrawal or secretary removal (withdrawn, with or without a reason code), '
  'or a no-show (absent). The same row set refundToDecideRemoval offers the '
  'control for. A successful Stripe refund is already authoritative via '
  'refund_amount / refunded_at, so only the denial needs a durable decision.';

-- Restated, not assumed: CREATE OR REPLACE preserves the ACL, but naming it
-- keeps this file honest about who may call the function it rewrote.
REVOKE EXECUTE ON FUNCTION public.set_entry_refund_decision(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_entry_refund_decision(uuid, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.restrict_entry_refund_decision_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- A reinstated entry needs a fresh decision if it is removed again later.
  -- This runs for every role, including service-role lifecycle mutations.
  -- MYK9-632: both removal states, and any move BETWEEN them. MYK9-2099: a
  -- no-show too, since it can now carry a decision.
  IF TG_OP = 'UPDATE'
     AND old.entry_status IN ('scratched', 'withdrawn', 'absent')
     AND new.entry_status IS DISTINCT FROM old.entry_status THEN
    new.refund_decision := NULL;
    new.refund_decided_at := NULL;
    new.refund_decided_by := NULL;
    RETURN new;
  END IF;

  IF current_user IN ('postgres', 'service_role') THEN
    RETURN new;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF new.refund_decision IS NOT NULL
       OR new.refund_decided_at IS NOT NULL
       OR new.refund_decided_by IS NOT NULL THEN
      RAISE EXCEPTION 'refund decisions are written only through set_entry_refund_decision'
        USING ERRCODE = '42501';
    END IF;

    RETURN new;
  END IF;

  IF new.refund_decision IS DISTINCT FROM old.refund_decision
     OR new.refund_decided_at IS DISTINCT FROM old.refund_decided_at
     OR new.refund_decided_by IS DISTINCT FROM old.refund_decided_by THEN
    RAISE EXCEPTION 'refund decisions are written only through set_entry_refund_decision'
      USING ERRCODE = '42501';
  END IF;

  RETURN new;
END;
$$;

-- A trigger function: nobody needs EXECUTE on it (same decision as 20260917214300).
REVOKE EXECUTE ON FUNCTION public.restrict_entry_refund_decision_columns()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
