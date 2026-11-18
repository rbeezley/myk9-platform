-- =============================================================================
-- MYK9-2145: Deny refund works on a paid entry pulled at ringside or by the
-- exhibitor's own check-in.
--
-- The at-show entry list's Pull (writeCheckInStatus ->
-- ReplicatedEntriesTable.updateCheckInStatus) and the exhibitor's check-in pull
-- (self_checkin_entry) set only check_in_status = 'pulled'; entry_status stays
-- as entered, usually 'confirmed'. The app's one definition of a refund to
-- decide, `refundToDecideRemoval`
-- (apps/myk9show/src/features/payments/pullReconciliation.ts), now reads that
-- flag through `classifyEntryRemoval`, the same predicate Finish the show
-- already counted the removal with. So these rows are refunds to decide on the
-- Pulls list and in every count, and this function must admit them, or Deny
-- refund raises 22023 on a row the list offers it for.
--
-- What ringside and the self check-in WRITE is unchanged (approach chosen for
-- MYK9-2145): rewriting the check-in toggle to scratch the entry would change
-- the replicated write path and its Undo.
--
-- 1. set_entry_refund_decision, COPIED FROM THE LATEST DEFINITION
--    (20261117152900_myk9_2099_refund_decision_removed_absent.sql). Exactly
--    two things change: the function also reads check_in_status, and the
--    status arm of the eligibility guard admits a row whose check_in_status is
--    'pulled' (case-insensitive, as classifyEntryRemoval reads it) besides
--    entry_status 'scratched', 'withdrawn' or 'absent'. The raised sentence is
--    unchanged; the COMMENT names the check-in pull. Still required, unchanged: payment_method 'online',
--    payment_status 'paid', no refund_amount, the show-official authorization,
--    SECURITY DEFINER with an empty search_path, and the same EXECUTE grants.
--    Only 'denied' is accepted; nothing here moves money.
--
-- 2. restrict_entry_refund_decision_columns (the reinstate trigger), copied
--    from the same file. A decision is cleared when the row leaves the state it
--    was decided in. A check-in pull leaves it when check_in_status moves off
--    'pulled' while entry_status is not a removal (the Clear on the check-in
--    toggle, or the exhibitor checking back in), so a pull that was denied,
--    cleared and pulled again returns to the list for a fresh decision. A
--    check-in pull that the desk then scratches keeps its decision: it is the
--    same pull. Nothing else changes.
--
-- Rollback: re-run the two CREATE OR REPLACE statements from
-- 20261117152900_myk9_2099_refund_decision_removed_absent.sql.
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
  v_check_in_status text;
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
         e.check_in_status,
         e.payment_method,
         e.payment_status,
         e.refund_amount,
         e.refund_decision
    INTO v_show_id,
         v_club_id,
         v_entry_status,
         v_check_in_status,
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

  -- The status arm mirrors `refundToDecideRemoval` (through `classifyEntryRemoval`)
  -- EXACTLY: the list that offers the decision and the function that records it
  -- must admit the same rows, or one of them is lying. 'withdrawn' covers an
  -- exhibitor withdrawal (a reason code) and a secretary removal (none);
  -- entries_withdrawal_reason_code_check allows no other code. MYK9-2145: a
  -- check-in 'pulled' flag (ringside's Pull, or the exhibitor's own check-in
  -- pull) is a pull too, whatever entry_status still says. Every arm COALESCEs,
  -- because three-valued logic fails OPEN here: with a NULL entry_status the IN
  -- is NULL, `NOT NULL` is NULL, the IF falls through, and a denial would be
  -- recorded on a row this guard was meant to refuse.
  IF COALESCE(v_payment_method, '') <> 'online'
     OR COALESCE(v_payment_status, '') <> 'paid'
     OR COALESCE(v_refund_amount, 0) > 0
     OR NOT (
       COALESCE(v_entry_status, '') IN ('scratched', 'withdrawn', 'absent')
       OR lower(COALESCE(v_check_in_status, '')) = 'pulled'
     ) THEN
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
  'MYK9-2099 / MYK9-2145: records a person''s explicit "Deny refund" for a paid-online entry '
  'that stopped running with no refund and no decision: a pull (scratched, or a '
  'check-in pulled flag from ringside or the exhibitor''s own check-in), a '
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
  -- no-show too, since it can now carry a decision. MYK9-2145: a check-in pull
  -- (entry_status not a removal, check_in_status 'pulled') is cleared when the
  -- flag comes off and the entry is still not a removal; a desk scratch of the
  -- same pull keeps it.
  IF TG_OP = 'UPDATE'
     AND (
       (
         old.entry_status IN ('scratched', 'withdrawn', 'absent')
         AND new.entry_status IS DISTINCT FROM old.entry_status
       )
       OR (
         COALESCE(old.entry_status, '') NOT IN ('scratched', 'withdrawn', 'absent')
         AND lower(COALESCE(old.check_in_status, '')) = 'pulled'
         AND lower(COALESCE(new.check_in_status, '')) <> 'pulled'
         AND COALESCE(new.entry_status, '') NOT IN ('scratched', 'withdrawn', 'absent')
       )
     ) THEN
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
