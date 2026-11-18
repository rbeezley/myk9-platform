-- =============================================================================
-- MYK9-2170: payout brake, part 1 (server). Parent MYK9-1956.
--
-- Owner decisions (2026-11-13): every payout to every club waits for approval
-- while the brake is on; the brake stays on until the owner switches it off; an
-- unapproved payout never sends by itself and reminds the operator daily.
--
-- 1. platform_settings.payouts_require_approval, default ON. The existing
--    singleton row takes the default. Writes are already site-admin only
--    (RLS platform_settings_update + trg_guard_platform_settings_write); anon
--    holds column grants on the fee columns only, so it cannot read this one.
--    Switching it is recorded in payout_approval_events (who, when) by an
--    AFTER UPDATE trigger, whichever path made the change. Switching it OFF
--    from a client session needs a recent sign-in (require_recent_reauth,
--    MYK9-1208); service_role and SQL-console changes are exempt as there.
--
-- 2. show_payouts gains three statuses:
--      awaiting_approval  cron-process-payouts worked out the amount and the
--                         club can receive it, but the brake is on.
--      approved           a site admin approved it; the next payout run sends
--                         it through the job's one send path (money lock,
--                         recalculation after the claim, transfer_group guard).
--      held               a site admin is keeping it waiting, with a reason.
--                         The run still refreshes its amount.
--    None is 'failed', so the one-live-row-per-show index
--    (show_payouts_one_live_per_show, WHERE status <> 'failed') covers them:
--    a show still has at most one live row.
--    approved_at / approved_amount_cents / approved_stripe_account_id: what a
--      site admin approved. An approval covers that destination account and at
--      most that amount (refunds may lower it); a different destination or a
--      larger amount sends the payout back to awaiting_approval (section 8).
--      A transfer attempt that fails after approval for a self-healing reason
--      (a card-clearing balance delay, stale processing recovery, an entries
--      read after the claim) carries all three onto the retry row; any other
--      failure waits for a new approval (carriedApprovalFrom in
--      _shared/payoutApproval.ts).
--    last_reminded_at: the cron's once-a-day reminder claim.
--
-- 3. payout_approval_events: append-only record of brake switches and of each
--    approve, hold or reopen (with the reason). Kept off show_payouts because
--    club admins and secretaries read every show_payouts column of their own
--    shows; a hold reason is the operator's note, not theirs. Site admins read
--    it; nobody writes it directly (the trigger and the RPCs are SECURITY
--    DEFINER). anon gets nothing: explicit REVOKE, because this project's
--    default privileges grant anon full CRUD on every new table.
--
-- 4. approve_show_payout(uuid, integer) and hold_show_payout(uuid, text): site
--    admin only; approval also needs a recent sign-in. Each is one guarded
--    UPDATE ... WHERE status IN (...) RETURNING, so two approvals at once
--    change the row once and the second reads back 'already_approved'.
--    Neither calls Stripe; the payout run does.
--
-- 5. A payout leaving awaiting_approval by any path (approve, hold, the brake
--    switched off, fully refunded) resolves its daily reminder alert
--    (operator_alerts, source 'cron-process-payouts', dedupe_key
--    'payout-awaiting-approval-<id>') in a trigger.
--
-- 6. claim_show_payout_for_send: the payout run's claim, service_role only.
--    It reads the brake in the same transaction as the claim (FOR SHARE, so a
--    switch waits for the claim or the claim sees the switch): a brake switched
--    on mid-run stops every transfer not yet claimed. An approved row is claimed
--    only for its approved destination and at most its approved amount.
--
-- 7. reopen_show_payout_approval: service_role only. The run sends an approved
--    payout back to awaiting_approval, with the reason recorded, when its
--    destination changed or its amount rose since approval.
--
-- 8. financial_reconciliation_summary: payout_pending_cents (money still owed
--    to clubs) includes the three new statuses.
--
-- 9. system_health_probe (both overloads): payout_ledger.in_flight includes the
--    three new statuses, so the board reads them as in flight, not settled.
--
-- Deploy order: deploy the frontend (the admin payout ledger labels the new
-- statuses), cron-health-check (its ACL contract names payout_approval_events)
-- and cron-process-payouts BEFORE pushing this migration. The new payout
-- function reads payouts_require_approval first and, without the column, stops
-- the run with a 500 before anything is sent or recorded; the old function
-- against the new schema would send without approval.
--
-- Behavioral coverage (CI only): supabase/tests/myk9_2170_payout_brake_test.sql
-- Rollback: drop the functions, triggers and trigger functions added here, the
-- table and the new columns, restore the four-status CHECK (after moving any
-- rows in the new statuses back to 'pending'), and re-run the financial summary
-- and probe definitions from 20261004193700 and 20261008124700.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. The setting
-- -----------------------------------------------------------------------------
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS payouts_require_approval boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.platform_settings.payouts_require_approval IS
  'MYK9-2170 payout brake. true (default): cron-process-payouts records every payout it would send as awaiting_approval and sends only rows a site admin approved (approve_show_payout). false: payouts send on the nightly run as before. Every change is recorded in payout_approval_events; switching it off from a client session needs a recent sign-in.';

-- -----------------------------------------------------------------------------
-- 2. show_payouts statuses and columns
-- -----------------------------------------------------------------------------
ALTER TABLE public.show_payouts DROP CONSTRAINT IF EXISTS show_payouts_status_check;
ALTER TABLE public.show_payouts
  ADD CONSTRAINT show_payouts_status_check
  CHECK (status IN (
    'pending', 'processing', 'completed', 'failed',
    'awaiting_approval', 'approved', 'held'
  ));

ALTER TABLE public.show_payouts
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_amount_cents integer,
  ADD COLUMN IF NOT EXISTS approved_stripe_account_id text,
  ADD COLUMN IF NOT EXISTS last_reminded_at timestamptz;

ALTER TABLE public.show_payouts DROP CONSTRAINT IF EXISTS show_payouts_approval_shape;
ALTER TABLE public.show_payouts
  ADD CONSTRAINT show_payouts_approval_shape CHECK (
    (approved_at IS NULL) = (approved_amount_cents IS NULL)
    AND (approved_at IS NULL) = (approved_stripe_account_id IS NULL)
    AND (approved_amount_cents IS NULL OR approved_amount_cents >= 0)
  );

COMMENT ON COLUMN public.show_payouts.approved_at IS
  'MYK9-2170: when a site admin approved this payout (approve_show_payout). Carried onto the retry row when an approved transfer attempt fails for a self-healing reason.';
COMMENT ON COLUMN public.show_payouts.approved_amount_cents IS
  'MYK9-2170: the most this approval lets the payout run send. A recalculation above it sends the payout back for approval.';
COMMENT ON COLUMN public.show_payouts.approved_stripe_account_id IS
  'MYK9-2170: the Stripe account the approval covers. A different destination at send time sends the payout back for approval.';
COMMENT ON COLUMN public.show_payouts.last_reminded_at IS
  'MYK9-2170: when cron-process-payouts last reminded the operator that this payout is awaiting approval (at most once a day).';

-- -----------------------------------------------------------------------------
-- 3. payout_approval_events
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payout_approval_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  event           text NOT NULL
    CHECK (event IN ('brake_on', 'brake_off', 'approved', 'held', 'reopened')),
  show_payout_id  uuid REFERENCES public.show_payouts (id) ON DELETE CASCADE,
  reason          text,
  actor_person_id uuid REFERENCES public.people (id) ON DELETE SET NULL,
  actor_role      text NOT NULL,
  CONSTRAINT payout_approval_events_payout_shape CHECK (
    (event IN ('approved', 'held', 'reopened')) = (show_payout_id IS NOT NULL)
  ),
  CONSTRAINT payout_approval_events_hold_reason CHECK (
    event NOT IN ('held', 'reopened') OR length(btrim(coalesce(reason, ''))) > 0
  )
);

COMMENT ON TABLE public.payout_approval_events IS
  'MYK9-2170: append-only record of payout brake switches (platform_settings.payouts_require_approval) and of each payout approval, hold or reopen. Written only by trg_record_payout_brake_change and the approve_show_payout / hold_show_payout / reopen_show_payout_approval RPCs; site admins read it.';

CREATE INDEX IF NOT EXISTS payout_approval_events_show_payout_id_idx
  ON public.payout_approval_events (show_payout_id);
CREATE INDEX IF NOT EXISTS payout_approval_events_actor_person_id_idx
  ON public.payout_approval_events (actor_person_id);

ALTER TABLE public.payout_approval_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_approval_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.payout_approval_events FROM anon;
REVOKE ALL ON public.payout_approval_events FROM authenticated;
GRANT SELECT ON public.payout_approval_events TO authenticated;
GRANT ALL ON public.payout_approval_events TO service_role;

DROP POLICY IF EXISTS payout_approval_events_select ON public.payout_approval_events;
CREATE POLICY payout_approval_events_select
  ON public.payout_approval_events
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_site_admin()));

-- The acting person, or NULL for a service-role or SQL-console change (the
-- role column still says which).
CREATE OR REPLACE FUNCTION public.payout_approval_actor_person_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id
    FROM public.people p
   WHERE p.auth_user_id = auth.uid()
     AND auth.uid() IS NOT NULL
   ORDER BY p.created_at
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.payout_approval_actor_person_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payout_approval_actor_person_id() FROM anon;
REVOKE ALL ON FUNCTION public.payout_approval_actor_person_id() FROM authenticated;

-- -----------------------------------------------------------------------------
-- 4. Record every brake switch; switching it off needs a recent sign-in
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_payout_brake_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Releasing every payout is a release path like approval: a stale session
  -- may not do it. require_recent_reauth exempts service_role and no-JWT
  -- (SQL console) callers. Raising here rolls the UPDATE back.
  IF NOT NEW.payouts_require_approval THEN
    PERFORM public.require_recent_reauth();
  END IF;

  INSERT INTO public.payout_approval_events (event, actor_person_id, actor_role)
  VALUES (
    CASE WHEN NEW.payouts_require_approval THEN 'brake_on' ELSE 'brake_off' END,
    public.payout_approval_actor_person_id(),
    coalesce(nullif(current_setting('role', true), ''), 'none')
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.record_payout_brake_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_payout_brake_change() FROM anon;
REVOKE ALL ON FUNCTION public.record_payout_brake_change() FROM authenticated;

DROP TRIGGER IF EXISTS trg_record_payout_brake_change ON public.platform_settings;
CREATE TRIGGER trg_record_payout_brake_change
  AFTER UPDATE OF payouts_require_approval ON public.platform_settings
  FOR EACH ROW
  WHEN (OLD.payouts_require_approval IS DISTINCT FROM NEW.payouts_require_approval)
  EXECUTE FUNCTION public.record_payout_brake_change();

-- -----------------------------------------------------------------------------
-- 5. A payout leaving awaiting_approval resolves its daily reminder
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_payout_approval_reminder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.operator_alerts a
     SET resolved_at = now(), resolved_by = auth.uid()
   WHERE a.source = 'cron-process-payouts'
     AND a.dedupe_key = 'payout-awaiting-approval-' || NEW.id::text
     AND a.resolved_at IS NULL;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_payout_approval_reminder() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_payout_approval_reminder() FROM anon;
REVOKE ALL ON FUNCTION public.resolve_payout_approval_reminder() FROM authenticated;

DROP TRIGGER IF EXISTS trg_resolve_payout_approval_reminder ON public.show_payouts;
CREATE TRIGGER trg_resolve_payout_approval_reminder
  AFTER UPDATE OF status ON public.show_payouts
  FOR EACH ROW
  WHEN (OLD.status = 'awaiting_approval' AND NEW.status IS DISTINCT FROM 'awaiting_approval')
  EXECUTE FUNCTION public.resolve_payout_approval_reminder();

-- -----------------------------------------------------------------------------
-- 6. approve_show_payout
--    Approves the payout's current amount to its current destination account.
--    p_amount_cents, when given, is the amount the approver was shown; if the
--    payout run has refreshed the amount since, the approval is refused so the
--    approver looks again. Returns 'approved' (this call approved it) or
--    'already_approved' (it was approved, or is being or has been sent, by an
--    earlier call). Anything else raises: 42501 not a site admin, MKAUT no
--    recent sign-in, P0002 no such payout, 22023 a payout that is not waiting
--    for approval, has no destination account, or whose amount changed.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_show_payout(
  p_payout_id uuid,
  p_amount_cents integer DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_amount integer;
  v_destination text;
BEGIN
  IF NOT (SELECT public.is_site_admin()) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;
  PERFORM public.require_recent_reauth();

  -- One guarded UPDATE: a concurrent second approval waits on the row lock,
  -- re-reads the status as 'approved' and matches nothing.
  UPDATE public.show_payouts sp
     SET status = 'approved',
         approved_at = now(),
         approved_amount_cents = sp.amount_cents,
         approved_stripe_account_id = csa.stripe_account_id
    FROM public.club_stripe_accounts csa
   WHERE sp.id = p_payout_id
     AND sp.status IN ('awaiting_approval', 'held')
     AND csa.id = sp.club_stripe_account_id
     AND csa.stripe_account_id IS NOT NULL
     AND (p_amount_cents IS NULL OR sp.amount_cents = p_amount_cents)
  RETURNING sp.status INTO v_status;

  IF v_status IS NULL THEN
    SELECT sp.status, sp.amount_cents, csa.stripe_account_id
      INTO v_status, v_amount, v_destination
      FROM public.show_payouts sp
      LEFT JOIN public.club_stripe_accounts csa ON csa.id = sp.club_stripe_account_id
     WHERE sp.id = p_payout_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Payout not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_status IN ('approved', 'processing', 'completed') THEN
      RETURN 'already_approved';
    END IF;
    IF v_status NOT IN ('awaiting_approval', 'held') THEN
      RAISE EXCEPTION 'This payout is %, not waiting for approval', v_status
        USING ERRCODE = '22023';
    END IF;
    IF v_destination IS NULL THEN
      RAISE EXCEPTION 'This payout has no bank account to send to yet'
        USING ERRCODE = '22023';
    END IF;
    RAISE EXCEPTION 'The amount changed to % cents since you looked; review it again', v_amount
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.payout_approval_events (event, show_payout_id, actor_person_id, actor_role)
  VALUES (
    'approved', p_payout_id, public.payout_approval_actor_person_id(),
    coalesce(nullif(current_setting('role', true), ''), 'none')
  );

  RETURN 'approved';
END;
$$;

REVOKE ALL ON FUNCTION public.approve_show_payout(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_show_payout(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.approve_show_payout(uuid, integer) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. hold_show_payout
--    Keeps a waiting (or approved, not yet sent) payout waiting, with a reason,
--    and withdraws any approval. A held payout can be approved later. Holding
--    it again records the new reason. Raises 42501 / P0002 as above, 22023 for
--    a blank reason or a payout already being sent or settled. Holding stops a
--    release, so it does not need a recent sign-in.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hold_show_payout(p_payout_id uuid, p_reason text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reason text := btrim(coalesce(p_reason, ''));
  v_status text;
BEGIN
  IF NOT (SELECT public.is_site_admin()) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;
  IF v_reason = '' THEN
    RAISE EXCEPTION 'Say why the payout is held' USING ERRCODE = '22023';
  END IF;
  IF length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Keep the reason under 500 characters' USING ERRCODE = '22023';
  END IF;

  -- Same guard shape as approval: if the payout run has already claimed an
  -- approved row (processing), this matches nothing and the hold is refused.
  UPDATE public.show_payouts sp
     SET status = 'held',
         approved_at = NULL,
         approved_amount_cents = NULL,
         approved_stripe_account_id = NULL
   WHERE sp.id = p_payout_id
     AND sp.status IN ('awaiting_approval', 'approved', 'held')
  RETURNING sp.status INTO v_status;

  IF v_status IS NULL THEN
    SELECT sp.status INTO v_status FROM public.show_payouts sp WHERE sp.id = p_payout_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Payout not found' USING ERRCODE = 'P0002';
    END IF;
    RAISE EXCEPTION 'This payout is %, so it can no longer be held', v_status
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.payout_approval_events (
    event, show_payout_id, reason, actor_person_id, actor_role
  )
  VALUES (
    'held', p_payout_id, v_reason, public.payout_approval_actor_person_id(),
    coalesce(nullif(current_setting('role', true), ''), 'none')
  );

  RETURN 'held';
END;
$$;

REVOKE ALL ON FUNCTION public.hold_show_payout(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hold_show_payout(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.hold_show_payout(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 8. claim_show_payout_for_send (service_role only; the payout run's claim)
--    Moves the show's live row (or a new row) to 'processing' for a transfer of
--    p_amount_cents to p_destination, and returns its id; NULL when the claim
--    is refused (another run holds the show, the row changed, the brake is on
--    and the payout is not approved for this destination and amount).
--    The brake is read FOR SHARE in this transaction, so switching it on waits
--    for this claim to commit or is seen by it.
--    p_carried_*: the approval of the show's latest failed attempt, when that
--    attempt failed for a self-healing reason (carriedApprovalFrom decides).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_show_payout_for_send(
  p_show_id uuid,
  p_live_row_id uuid,
  p_live_status text,
  p_account_id uuid,
  p_destination text,
  p_amount_cents integer,
  p_carried_approved_at timestamptz DEFAULT NULL,
  p_carried_amount_cents integer DEFAULT NULL,
  p_carried_destination text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_brake boolean;
  v_id uuid;
BEGIN
  SELECT ps.payouts_require_approval INTO v_brake
    FROM public.platform_settings ps
   WHERE ps.id
     FOR SHARE;
  -- No readable setting: treat as on.
  v_brake := coalesce(v_brake, true);

  IF p_live_row_id IS NOT NULL THEN
    UPDATE public.show_payouts sp
       SET status = 'processing',
           amount_cents = p_amount_cents,
           club_stripe_account_id = p_account_id
     WHERE sp.id = p_live_row_id
       AND sp.show_id = p_show_id
       AND sp.status = p_live_status
       AND sp.status IN ('pending', 'awaiting_approval', 'approved')
       AND CASE
             WHEN sp.status = 'approved' THEN
               sp.approved_stripe_account_id = p_destination
               AND p_amount_cents <= sp.approved_amount_cents
             ELSE NOT v_brake
           END
    RETURNING sp.id INTO v_id;
    RETURN v_id;
  END IF;

  IF p_carried_approved_at IS NOT NULL THEN
    IF p_carried_destination IS DISTINCT FROM p_destination
       OR p_carried_amount_cents IS NULL
       OR p_amount_cents > p_carried_amount_cents THEN
      RETURN NULL;
    END IF;
  ELSIF v_brake THEN
    RETURN NULL;
  END IF;

  BEGIN
    INSERT INTO public.show_payouts (
      show_id, club_stripe_account_id, amount_cents, status, scheduled_date,
      approved_at, approved_amount_cents, approved_stripe_account_id
    )
    VALUES (
      p_show_id, p_account_id, p_amount_cents, 'processing', current_date,
      p_carried_approved_at,
      CASE WHEN p_carried_approved_at IS NULL THEN NULL ELSE p_carried_amount_cents END,
      CASE WHEN p_carried_approved_at IS NULL THEN NULL ELSE p_carried_destination END
    )
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    -- Another run already owns this show.
    RETURN NULL;
  END;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_show_payout_for_send(
  uuid, uuid, text, uuid, text, integer, timestamptz, integer, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_show_payout_for_send(
  uuid, uuid, text, uuid, text, integer, timestamptz, integer, text
) TO service_role;

-- -----------------------------------------------------------------------------
-- 9. reopen_show_payout_approval (service_role only)
--    The payout run found that an approved payout (still 'approved', or just
--    claimed to 'processing') would go to a different destination or for more
--    than was approved. Back to awaiting_approval with the fresh facts, the
--    approval withdrawn and the reason recorded. Returns false if the row was
--    not in p_from_status.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reopen_show_payout_approval(
  p_payout_id uuid,
  p_from_status text,
  p_amount_cents integer,
  p_account_id uuid,
  p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_from_status NOT IN ('approved', 'processing') THEN
    RAISE EXCEPTION 'Only an approved payout can be reopened' USING ERRCODE = '22023';
  END IF;

  UPDATE public.show_payouts sp
     SET status = 'awaiting_approval',
         amount_cents = p_amount_cents,
         club_stripe_account_id = p_account_id,
         approved_at = NULL,
         approved_amount_cents = NULL,
         approved_stripe_account_id = NULL,
         last_reminded_at = NULL
   WHERE sp.id = p_payout_id
     AND sp.status = p_from_status
  RETURNING sp.id INTO v_id;

  IF v_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.payout_approval_events (
    event, show_payout_id, reason, actor_person_id, actor_role
  )
  VALUES (
    'reopened', p_payout_id, p_reason, NULL,
    coalesce(nullif(current_setting('role', true), ''), 'none')
  );
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_show_payout_approval(uuid, text, integer, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_show_payout_approval(uuid, text, integer, uuid, text)
  TO service_role;


-- -----------------------------------------------------------------------------
-- 10. Money owed counts payouts waiting on the brake
--    financial_reconciliation_summary, COPIED FROM THE LATEST DEFINITION
--    (20261004193700_myk9_997_platform_income_club_funded_refunds.sql). One
--    change: payout_pending_cents (not yet sent, still owed to the club) also
--    sums awaiting_approval, approved and held, so the outstanding figure
--    (pending + failed, financialSummary.ts) no longer drops them. Same return
--    type, so CREATE OR REPLACE; grants restated as that migration did.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.financial_reconciliation_summary(
  p_scope   text,
  p_club_id uuid DEFAULT NULL,
  p_show_id uuid DEFAULT NULL
)
RETURNS TABLE (
  -- Charge verification side (stripe_orders, ENTRY orders only)
  order_count                  bigint,
  gross_charged_cents          bigint,
  entry_subtotal_cents         bigint,
  platform_fee_cents           bigint,
  processing_fee_cents         bigint,  -- SUM of CAPTURED fees only (NULLs excluded)
  processing_fee_pending_count bigint,  -- orders whose fee is not yet captured (pending, not zero)
  -- PENDING-FEE RESIDUAL inputs: the entry totals restricted to the orders whose
  -- processing fee is NOT captured (see 20260717130000 for the derivation).
  pending_fee_platform_fee_cents bigint,
  pending_fee_refunded_cents     bigint,
  refunded_cents               bigint,  -- every POST-HOC refund (club- and platform-funded)
  make_whole_refunded_cents    bigint,  -- cart-overflow make-whole: returned, but NOT a platform loss
  snapshot_missing_count       bigint,  -- legacy ENTRY orders missing EITHER snapshot column
  non_entry_order_count        bigint,
  non_entry_gross_cents        bigint,
  non_entry_refunded_cents     bigint,
  non_entry_make_whole_refunded_cents bigint,
  -- Payout settlement side (show_payouts) — kept independent of charge facts
  payout_count                 bigint,
  payout_completed_cents       bigint,
  payout_pending_cents         bigint,
  payout_failed_cents          bigint,
  payout_failed_count          bigint,
  -- MYK9-997 (appended)
  club_funded_refunded_cents             bigint,
  pending_fee_club_funded_refunded_cents bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  PERFORM public._financial_reconciliation_authorize(p_scope, p_club_id, p_show_id);

  RETURN QUERY
  WITH scoped_charges AS (
    SELECT o.order_type,
           o.amount_cents,
           o.entry_subtotal_cents,
           o.platform_fee_cents,
           o.stripe_processing_fee_cents,
           o.refunded_cents,
           o.make_whole_refunded_cents,
           o.club_funded_refunded_cents
    FROM public.stripe_orders o
    WHERE (
        o.status IN ('succeeded', 'refunded')
        OR o.refunded_cents > 0
        OR o.make_whole_refunded_cents > 0
      )
      AND (
        p_scope = 'platform'
        OR (p_scope = 'show' AND o.show_id = p_show_id)
        OR (p_scope = 'club' AND o.show_id IN (
              SELECT s.id FROM public.shows s WHERE s.club_id = p_club_id))
      )
  ),
  -- Entry accounting covers ENTRY orders only (see ORDER-TYPE SCOPING in
  -- 20260717130000).
  scoped_orders AS (
    SELECT * FROM scoped_charges WHERE order_type = 'entry'
  ),
  scoped_non_entry AS (
    SELECT * FROM scoped_charges WHERE order_type IS DISTINCT FROM 'entry'
  ),
  -- SUPERSEDED FAILED PAYOUTS: see 20260717130000. A failed row is
  -- outstanding only when its show has no live payout row and it is the
  -- show's latest failed attempt.
  scoped_payouts AS (
    SELECT sp.amount_cents,
           sp.status,
           EXISTS (
             SELECT 1 FROM public.show_payouts live
             WHERE live.show_id = sp.show_id
               AND live.status <> 'failed'
           ) AS has_live_payout,
           NOT EXISTS (
             SELECT 1 FROM public.show_payouts newer
             WHERE newer.show_id = sp.show_id
               AND newer.status = 'failed'
               AND (newer.created_at, newer.id) > (sp.created_at, sp.id)
           ) AS is_latest_failed
    FROM public.show_payouts sp
    WHERE (
        p_scope = 'platform'
        OR (p_scope = 'show' AND sp.show_id = p_show_id)
        OR (p_scope = 'club' AND sp.show_id IN (
              SELECT s.id FROM public.shows s WHERE s.club_id = p_club_id))
      )
  )
  -- EVERY column reference below is qualified with a CTE alias: the RETURNS
  -- TABLE output columns are PL/pgSQL variables, and an unqualified reference
  -- raises "column reference ... is ambiguous" at RUNTIME.
  SELECT
    (SELECT count(*)                                            FROM scoped_orders so),
    (SELECT COALESCE(SUM(so.amount_cents), 0)                   FROM scoped_orders so),
    (SELECT COALESCE(SUM(so.entry_subtotal_cents), 0)           FROM scoped_orders so),
    (SELECT COALESCE(SUM(so.platform_fee_cents), 0)             FROM scoped_orders so),
    (SELECT COALESCE(SUM(so.stripe_processing_fee_cents), 0)    FROM scoped_orders so),
    (SELECT count(*) FROM scoped_orders so WHERE so.stripe_processing_fee_cents IS NULL),
    (SELECT COALESCE(SUM(so.platform_fee_cents), 0) FROM scoped_orders so
      WHERE so.stripe_processing_fee_cents IS NULL),
    (SELECT COALESCE(SUM(so.refunded_cents), 0)     FROM scoped_orders so
      WHERE so.stripe_processing_fee_cents IS NULL),
    (SELECT COALESCE(SUM(so.refunded_cents), 0)                 FROM scoped_orders so),
    (SELECT COALESCE(SUM(so.make_whole_refunded_cents), 0)      FROM scoped_orders so),
    (SELECT count(*) FROM scoped_orders so
      WHERE so.platform_fee_cents IS NULL OR so.entry_subtotal_cents IS NULL),
    (SELECT count(*)                                            FROM scoped_non_entry ne),
    (SELECT COALESCE(SUM(ne.amount_cents), 0)                   FROM scoped_non_entry ne),
    (SELECT COALESCE(SUM(ne.refunded_cents), 0)                 FROM scoped_non_entry ne),
    (SELECT COALESCE(SUM(ne.make_whole_refunded_cents), 0)      FROM scoped_non_entry ne),
    (SELECT count(*)                                            FROM scoped_payouts sp),
    (SELECT COALESCE(SUM(sp.amount_cents), 0) FROM scoped_payouts sp WHERE sp.status = 'completed'),
    (SELECT COALESCE(SUM(sp.amount_cents), 0) FROM scoped_payouts sp WHERE sp.status IN ('pending', 'processing', 'awaiting_approval', 'approved', 'held')),
    (SELECT COALESCE(SUM(sp.amount_cents), 0) FROM scoped_payouts sp
      WHERE sp.status = 'failed' AND NOT sp.has_live_payout AND sp.is_latest_failed),
    (SELECT count(*) FROM scoped_payouts sp
      WHERE sp.status = 'failed' AND NOT sp.has_live_payout AND sp.is_latest_failed),
    -- MYK9-997: the club-funded share of the post-hoc refunds above, overall
    -- and on the not-yet-captured orders. Net income subtracts only the rest.
    (SELECT COALESCE(SUM(so.club_funded_refunded_cents), 0)     FROM scoped_orders so),
    (SELECT COALESCE(SUM(so.club_funded_refunded_cents), 0)     FROM scoped_orders so
      WHERE so.stripe_processing_fee_cents IS NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.financial_reconciliation_summary(text, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.financial_reconciliation_summary(text, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financial_reconciliation_summary(text, uuid, uuid)
  TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 11. The health board counts payouts waiting on the brake as in flight
--    Both system_health_probe overloads, COPIED FROM THE LATEST DEFINITIONS
--    (20261008124700_myk9_1052_health_probe_cron_history_one_pass.sql). One
--    change in each: payout_ledger.in_flight also counts awaiting_approval,
--    approved and held, so the payout ledger check reports them as in flight
--    instead of "all N payouts settled". stale_in_flight still counts only
--    'processing': a payout waiting for a person is not a stalled run.
-- -----------------------------------------------------------------------------
create or replace function public.system_health_probe()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return jsonb_build_object(
    'probed_at', now(),
    'latest_migration', (
      select version
      from supabase_migrations.schema_migrations
      order by version desc
      limit 1
    ),
    'migration_count', (
      select count(*)
      from supabase_migrations.schema_migrations
    ),
    'ringside_conflict_counter', (
      select coalesce(last_value, 0)
      from pg_sequences
      where schemaname = 'public' and sequencename = 'ringside_conflict_seq'
    ),
    'ringside_containment', (
      select jsonb_build_object(
        'state',                     c.state,
        'tripped_at',                c.tripped_at,
        'trip_conflict_delta',       c.trip_conflict_delta,
        'trip_reason',               c.trip_reason,
        'trip_conflicts_per_minute', c.trip_conflicts_per_minute,
        'backpressure_ms',           c.backpressure_ms,
        'calibrated',                c.calibrated,
        'last_sample_at',            c.last_sample_at
      )
      from public.ringside_containment c
    ),
    -- One row per show: its most recent payout attempt.
    'payout_ledger', (
      with latest as (
        select distinct on (p.show_id) p.*
        from public.show_payouts p
        order by p.show_id, p.created_at desc
      )
      select jsonb_build_object(
        'total',               count(*),
        'failed',              count(*) filter (where l.status = 'failed'),
        'failed_amount_cents', coalesce(sum(l.amount_cents) filter (where l.status = 'failed'), 0),
        'in_flight',           count(*) filter (where l.status in ('pending', 'processing', 'awaiting_approval', 'approved', 'held')),
        'stale_in_flight',     count(*) filter (
                                 where l.status = 'processing'
                                   and l.updated_at < now() - interval '26 hours'
                               ),
        'oldest_in_flight_at', min(l.updated_at) filter (where l.status = 'processing'),
        'last_completed_at',   max(l.completed_at) filter (where l.status = 'completed'),
        'failure_reasons', (
          select coalesce(jsonb_agg(distinct f.failure_reason), '[]'::jsonb)
          from latest f
          where f.status = 'failed' and f.failure_reason is not null
        )
      )
      from latest l
    ),
    'anon_grants', jsonb_build_object(
      'tables', (
        select coalesce(jsonb_agg(t order by t->>'name'), '[]'::jsonb)
        from (
          select jsonb_build_object(
            'name',  c.relname,
            'kind',  c.relkind::text,
            'privs', split_part(split_part(acl::text, '=', 2), '/', 1)
          ) as t
          from pg_class c
          cross join lateral unnest(coalesce(c.relacl, '{}'::aclitem[])) as acl
          where c.relnamespace = 'public'::regnamespace
            and c.relkind in ('r', 'p', 'v', 'm')
            and split_part(acl::text, '=', 1) = 'anon'
        ) sub
      ),
      'columns', (
        select coalesce(jsonb_agg(x order by x->>'name', x->>'column'), '[]'::jsonb)
        from (
          select jsonb_build_object(
            'name',   c.relname,
            'column', a.attname,
            'privs',  split_part(split_part(acl::text, '=', 2), '/', 1)
          ) as x
          from pg_class c
          join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
          cross join lateral unnest(coalesce(a.attacl, '{}'::aclitem[])) as acl
          where c.relnamespace = 'public'::regnamespace
            and split_part(acl::text, '=', 1) = 'anon'
        ) sub
      ),
      'defaults', (
        select coalesce(jsonb_agg(d order by d->>'grantor', d->>'objtype'), '[]'::jsonb)
        from (
          select jsonb_build_object(
            'grantor', da.defaclrole::regrole::text,
            'objtype', da.defaclobjtype::text,
            'privs',   split_part(split_part(acl::text, '=', 2), '/', 1)
          ) as d
          from pg_default_acl da
          join pg_namespace n on n.oid = da.defaclnamespace
          cross join lateral unnest(coalesce(da.defaclacl, '{}'::aclitem[])) as acl
          where n.nspname = 'public'
            and split_part(acl::text, '=', 1) = 'anon'
        ) sub
      )
    ),
    'applied_acl_grants', jsonb_build_object(
      -- Every public table is emitted, including the empty-grant rows, so a
      -- missing authenticated grant cannot disappear from the snapshot.
      'tables', (
        select coalesce(jsonb_agg(t order by t->>'name'), '[]'::jsonb)
        from (
          select jsonb_build_object(
            'name', c.relname,
            'privs', array_to_string(
              array(
                select p.privilege
                from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as p(privilege)
                where has_table_privilege(
                  'authenticated', format('public.%I', c.relname), p.privilege
                )
              ), ','
            )
          ) as t
          from pg_class c
          where c.relnamespace = 'public'::regnamespace
            and c.relkind = 'r'
        ) sub
      ),
      -- These privileges are not constrained by RLS. Emit any occurrence for
      -- either API role; the runner turns it red regardless of CRUD status.
      'forbidden_tables', (
        select coalesce(jsonb_agg(x order by x->>'role', x->>'name'), '[]'::jsonb)
        from (
          select jsonb_build_object(
            'name', c.relname,
            'role', r.role_name,
            'privs', array_to_string(
              array(
                select p.privilege
                from unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) as p(privilege)
                where has_table_privilege(
                  r.role_name, format('public.%I', c.relname), p.privilege
                )
              ), ','
            )
          ) as x
          from pg_class c
          cross join (values ('anon'), ('authenticated')) as r(role_name)
          where c.relnamespace = 'public'::regnamespace
            and c.relkind = 'r'
            and exists (
              select 1
              from unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) as p(privilege)
              where has_table_privilege(
                r.role_name, format('public.%I', c.relname), p.privilege
              )
            )
        ) sub
      ),
      -- Include all three API roles for every public sequence. This captures
      -- service_role's intentional grants and authenticated's withheld UPDATE
      -- on registration_confirmation_seq as applied privileges, not text.
      'sequences', (
        select coalesce(jsonb_agg(s order by s->>'name', s->>'role'), '[]'::jsonb)
        from (
          select jsonb_build_object(
            'name', c.relname,
            'role', r.role_name,
            'privs', array_to_string(
              array(
                select p.privilege
                from unnest(array['SELECT', 'UPDATE', 'USAGE']) as p(privilege)
                where has_sequence_privilege(
                  r.role_name, format('public.%I', c.relname), p.privilege
                )
              ), ','
            )
          ) as s
          from pg_class c
          cross join (values ('anon'), ('authenticated'), ('service_role')) as r(role_name)
          where c.relnamespace = 'public'::regnamespace
            and c.relkind = 'S'
        ) sub
      ),
      -- `supabase_admin` defaults are the known hosted-role exception. Any
      -- PUBLIC/anon/authenticated sequence default under another grantor means
      -- a revoked default has regrown and must fail the daily snapshot.
      'defaults', (
        select coalesce(jsonb_agg(d order by d->>'grantor', d->>'role'), '[]'::jsonb)
        from (
          select jsonb_build_object(
            'grantor', da.defaclrole::regrole::text,
            'role', coalesce(nullif(split_part(acl::text, '=', 1), ''), 'PUBLIC'),
            'objtype', da.defaclobjtype::text,
            'privs', split_part(split_part(acl::text, '=', 2), '/', 1)
          ) as d
          from pg_default_acl da
          join pg_namespace n on n.oid = da.defaclnamespace
          cross join lateral unnest(coalesce(da.defaclacl, '{}'::aclitem[])) as acl
          where n.nspname = 'public'
            and da.defaclobjtype = 'S'
            and coalesce(nullif(split_part(acl::text, '=', 1), ''), 'PUBLIC')
              in ('PUBLIC', 'anon', 'authenticated')
        ) sub
      )
    ),
    'cron_jobs', (
      select coalesce(jsonb_agg(j order by j->>'jobname'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'jobname',          job.jobname,
          'active',           job.active,
          'dispatches_http',  (position('net.http_post' in coalesce(job.command, '')) > 0),
          'last_status',      lr.status,
          'last_start',       lr.start_time,
          'last_end',         lr.end_time,
          'last_message',     lr.return_message
        ) as j
        from cron.job job
        -- One pass over the run history for every job. A lateral lookup per job seq-scanned
        -- cron.job_run_details once per job (there is no usable index and the table belongs
        -- to supabase_admin), about 1 GB of reads per probe once the history reached 144k rows.
        -- The last 8 days only bounds the sort; every job runs at least daily, so its latest run is in it.
        left join (
          select distinct on (d.jobid) d.jobid, d.status, d.start_time, d.end_time, d.return_message
          from cron.job_run_details d
          where d.start_time > now() - interval '8 days' or d.start_time is null
          order by d.jobid, d.start_time desc nulls last, d.runid desc
        ) lr on lr.jobid = job.jobid
      ) sub
    )
  );
end;
$$;

comment on function public.system_health_probe() is
  'Read-only health facts (scheduled cron jobs + last-run outcome, newest applied migration, ringside OCC conflict counter, MYK9-115 containment breaker state, payout-ledger outcomes as the latest attempt per show, applied anon ACLs, and applied authenticated/table/sequence ACLs) for the cron-health-check runner. SECURITY DEFINER so service_role can read cron.* / supabase_migrations.* / pg_default_acl which PostgREST does not expose. Runs no health logic; the ok/warn/fail mapping lives in the runner.';

revoke all on function public.system_health_probe() from public;
revoke all on function public.system_health_probe() from anon;
revoke all on function public.system_health_probe() from authenticated;
grant execute on function public.system_health_probe() to service_role;

-- 1b.
create or replace function public.system_health_probe(p_include_expensive boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_facts jsonb;
begin
  if p_include_expensive then
    v_facts := public.system_health_probe();

    return v_facts || jsonb_build_object(
      'sign_in_email_drift', public.sign_in_email_drift(),
      'applied_acl_grants', coalesce(v_facts->'applied_acl_grants', '{}'::jsonb)
        || jsonb_build_object(
          'service_role_tables', (
            select coalesce(jsonb_agg(t order by t->>'name'), '[]'::jsonb)
            from (
              select jsonb_build_object(
                'name', c.relname,
                'privs', array_to_string(
                  array(
                    select p.privilege
                    from unnest(
                      array[
                        'SELECT', 'INSERT', 'UPDATE', 'DELETE',
                        'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
                      ]
                    ) as p(privilege)
                    where has_table_privilege(
                      'service_role', format('public.%I', c.relname), p.privilege
                    )
                  ), ','
                )
              ) as t
              from pg_class c
              where c.relnamespace = 'public'::regnamespace
                and c.relkind = 'r'
            ) sub
          )
        )
    );
  end if;

  return jsonb_build_object(
    'probed_at', now(),
    'latest_migration', (
      select version
      from supabase_migrations.schema_migrations
      order by version desc
      limit 1
    ),
    'migration_count', (
      select count(*)
      from supabase_migrations.schema_migrations
    ),
    'ringside_conflict_counter', (
      select coalesce(last_value, 0)
      from pg_sequences
      where schemaname = 'public' and sequencename = 'ringside_conflict_seq'
    ),
    'sign_in_email_drift', public.sign_in_email_drift(),
    'ringside_containment', (
      select jsonb_build_object(
        'state',                     c.state,
        'tripped_at',                c.tripped_at,
        'trip_conflict_delta',       c.trip_conflict_delta,
        'trip_reason',               c.trip_reason,
        'trip_conflicts_per_minute', c.trip_conflicts_per_minute,
        'backpressure_ms',           c.backpressure_ms,
        'calibrated',                c.calibrated,
        'last_sample_at',            c.last_sample_at
      )
      from public.ringside_containment c
    ),
    'payout_ledger', (
      with latest as (
        select distinct on (p.show_id) p.*
        from public.show_payouts p
        order by p.show_id, p.created_at desc
      )
      select jsonb_build_object(
        'total',               count(*),
        'failed',              count(*) filter (where l.status = 'failed'),
        'failed_amount_cents', coalesce(sum(l.amount_cents) filter (where l.status = 'failed'), 0),
        'in_flight',           count(*) filter (where l.status in ('pending', 'processing', 'awaiting_approval', 'approved', 'held')),
        'stale_in_flight',     count(*) filter (
                                 where l.status = 'processing'
                                   and l.updated_at < now() - interval '26 hours'
                               ),
        'oldest_in_flight_at', min(l.updated_at) filter (where l.status = 'processing'),
        'last_completed_at',   max(l.completed_at) filter (where l.status = 'completed'),
        'failure_reasons', (
          select coalesce(jsonb_agg(distinct f.failure_reason), '[]'::jsonb)
          from latest f
          where f.status = 'failed' and f.failure_reason is not null
        )
      )
      from latest l
    ),
    'cron_jobs', (
      select coalesce(jsonb_agg(j order by j->>'jobname'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'jobname',          job.jobname,
          'active',           job.active,
          'dispatches_http',  (position('net.http_post' in coalesce(job.command, '')) > 0),
          'last_status',      lr.status,
          'last_start',       lr.start_time,
          'last_end',         lr.end_time,
          'last_message',     lr.return_message
        ) as j
        from cron.job job
        -- One pass over the run history for every job. A lateral lookup per job seq-scanned
        -- cron.job_run_details once per job (there is no usable index and the table belongs
        -- to supabase_admin), about 1 GB of reads per probe once the history reached 144k rows.
        -- The last 8 days only bounds the sort; every job runs at least daily, so its latest run is in it.
        left join (
          select distinct on (d.jobid) d.jobid, d.status, d.start_time, d.end_time, d.return_message
          from cron.job_run_details d
          where d.start_time > now() - interval '8 days' or d.start_time is null
          order by d.jobid, d.start_time desc nulls last, d.runid desc
        ) lr on lr.jobid = job.jobid
      ) sub
    )
  );
end;
$$;

comment on function public.system_health_probe(boolean) is
  'Read-only health facts for MYK9-157 and MYK9-236. The cheap path omits catalog-wide ACL scans; the full path adds applied service_role table privileges to applied_acl_grants and preserves sign-in email drift facts.';

revoke all on function public.system_health_probe(boolean) from public;
revoke all on function public.system_health_probe(boolean) from anon;
revoke all on function public.system_health_probe(boolean) from authenticated;
grant execute on function public.system_health_probe(boolean) to service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
