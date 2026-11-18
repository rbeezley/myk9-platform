-- =============================================================================
-- MYK9-2170: payout brake, part A (fail-closed brake only). Parent MYK9-1956.
--
-- Owner decision (2026-11-13, re-cut 2026-11-18): every payout waits for a site
-- admin's approval while the brake is on, and the brake is on by default.
--
-- 1. platform_settings.payouts_require_approval, default ON (the singleton row
--    takes the default). Writes are already site-admin or service_role only
--    (RLS + trg_guard_platform_settings_write). Every switch stamps
--    payouts_require_approval_changed_at / _changed_by (the acting person, NULL
--    for a service_role or SQL-console change) in a BEFORE UPDATE trigger, which
--    also keeps a client from writing the stamp itself. Switching it OFF from a
--    client session needs a recent sign-in (require_recent_reauth, MYK9-1208);
--    service_role and no-JWT (migration, SQL console) callers are exempt there.
--
-- 2. show_payouts gains three statuses. None is 'failed', so the one-live-row
--    index (show_payouts_one_live_per_show, WHERE status <> 'failed') covers
--    them and a show still has at most one live row.
--      awaiting_approval  the payout run worked out the amount and the club can
--                         receive it, but it may not send without approval.
--      approved           a site admin approved this amount to this destination.
--      held               a site admin is keeping it waiting, with a reason.
--    approved_at / approved_by / approved_amount_cents / approved_stripe_account_id
--    are the approval binding: set together or not at all (CHECK). approved_by
--    is the approver's people.id, deliberately without a foreign key, so a
--    person delete cannot break the all-or-nothing shape.
--    hold_reason: why a site admin held it.
--    approval_reset_reason: why the payout run sent an approved payout back to
--    awaiting_approval (amount rose or destination changed since approval).
--
-- 3. approve_show_payout(uuid, integer, text): site admin, recent sign-in;
--    the amount and the Stripe destination the approver reviewed are both
--    required and must equal the stored ones. Locks the row first, so a
--    second approval at the same time waits and reads back 'already_approved'.
--    hold_show_payout(uuid, text): site admin, reason required. Neither calls
--    Stripe.
--
-- 4. claim_show_payout_for_send: the payout run's ONLY way to put a row into
--    'processing' (service_role). It reads the brake FOR SHARE in its own
--    transaction, so a switch waits for the claim or the claim sees the switch.
--      brake on, no row or 'pending'   -> recorded as awaiting_approval
--      brake off, no row or 'pending'  -> processing (the existing behaviour)
--      awaiting_approval               -> stays waiting (amount refreshed),
--                                         whatever the brake says: a waiting
--                                         payout never sends without approval
--      held                            -> stays held, amount refreshed
--      approved, binding holds         -> processing
--      approved, amount above the approval or a different destination
--                                      -> back to awaiting_approval, approval
--                                         cleared, approval_reset_reason set
--
-- 5. Money owed (financial_reconciliation_summary.payout_pending_cents) and the
--    health board (system_health_probe payout_ledger.in_flight, both overloads)
--    count the three statuses as not yet sent, never as failed or settled.
--    Both are copied from their latest definitions with that one change each.
--
-- Deploy order: deploy cron-process-payouts FIRST, then push this migration.
--   The new function calls claim_show_payout_for_send; until the migration
--   lands that RPC is missing, the claim errors, and the run sends nothing
--   (fails closed). The old function against the new schema would send with no
--   approval, so the migration must not land first. The frontend can follow at
--   any time (the new statuses render as "Not sent yet" / labelled in the
--   admin ledger).
--
-- Behavioral coverage (CI only): supabase/tests/myk9_2170_payout_brake_test.sql
-- Rollback: drop the three functions and the trigger + its function, move rows
--   in the new statuses back to 'pending', restore the four-status CHECK, drop
--   the new columns, and re-run financial_reconciliation_summary from
--   20261004193700 and both system_health_probe overloads from 20261008124700.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. The setting and its change stamp
-- -----------------------------------------------------------------------------
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS payouts_require_approval boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payouts_require_approval_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payouts_require_approval_changed_by uuid
    REFERENCES public.people (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.platform_settings.payouts_require_approval IS
  'MYK9-2170 payout brake. true (default): cron-process-payouts records each payout as awaiting_approval and sends only rows a site admin approved. false: new payouts send on the nightly run as before; rows already awaiting approval still need approval.';
COMMENT ON COLUMN public.platform_settings.payouts_require_approval_changed_at IS
  'MYK9-2170: when payouts_require_approval last changed. Stamped by trg_stamp_payout_brake_change; a client cannot write it.';
COMMENT ON COLUMN public.platform_settings.payouts_require_approval_changed_by IS
  'MYK9-2170: who last changed payouts_require_approval (people.id). NULL means a service_role or SQL-console change.';

CREATE OR REPLACE FUNCTION public.stamp_payout_brake_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.payouts_require_approval IS DISTINCT FROM OLD.payouts_require_approval THEN
    -- Releasing every payout is a release like an approval: a stale session
    -- may not do it. Raising here rolls the UPDATE back.
    IF NOT NEW.payouts_require_approval THEN
      PERFORM public.require_recent_reauth();
    END IF;
    NEW.payouts_require_approval_changed_at := now();
    NEW.payouts_require_approval_changed_by := (
      SELECT p.id
        FROM public.people p
       WHERE auth.uid() IS NOT NULL
         AND p.auth_user_id = auth.uid()
       LIMIT 1
    );
  ELSE
    -- Nobody writes the stamp except this trigger.
    NEW.payouts_require_approval_changed_at := OLD.payouts_require_approval_changed_at;
    NEW.payouts_require_approval_changed_by := OLD.payouts_require_approval_changed_by;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_payout_brake_change() FROM PUBLIC, anon, authenticated;

-- Fires after trg_guard_platform_settings_write (same event, name order).
DROP TRIGGER IF EXISTS trg_stamp_payout_brake_change ON public.platform_settings;
CREATE TRIGGER trg_stamp_payout_brake_change
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_payout_brake_change();

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
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_amount_cents integer,
  ADD COLUMN IF NOT EXISTS approved_stripe_account_id text,
  ADD COLUMN IF NOT EXISTS hold_reason text,
  ADD COLUMN IF NOT EXISTS approval_reset_reason text;

ALTER TABLE public.show_payouts DROP CONSTRAINT IF EXISTS show_payouts_approval_shape;
ALTER TABLE public.show_payouts
  ADD CONSTRAINT show_payouts_approval_shape CHECK (
    (approved_at IS NULL) = (approved_by IS NULL)
    AND (approved_at IS NULL) = (approved_amount_cents IS NULL)
    AND (approved_at IS NULL) = (approved_stripe_account_id IS NULL)
    AND (approved_amount_cents IS NULL OR approved_amount_cents > 0)
    AND (status <> 'approved' OR approved_at IS NOT NULL)
    AND (status <> 'held' OR length(btrim(coalesce(hold_reason, ''))) > 0)
  );

COMMENT ON COLUMN public.show_payouts.approved_at IS
  'MYK9-2170: when a site admin approved this payout (approve_show_payout).';
COMMENT ON COLUMN public.show_payouts.approved_by IS
  'MYK9-2170: the approving site admin (people.id). No foreign key on purpose: the approval columns are set together or not at all.';
COMMENT ON COLUMN public.show_payouts.approved_amount_cents IS
  'MYK9-2170: the most this approval lets the payout run send. A larger amount sends the payout back for approval.';
COMMENT ON COLUMN public.show_payouts.approved_stripe_account_id IS
  'MYK9-2170: the Stripe account the approval covers. A different destination sends the payout back for approval.';
COMMENT ON COLUMN public.show_payouts.hold_reason IS
  'MYK9-2170: why a site admin held this payout (hold_show_payout).';
COMMENT ON COLUMN public.show_payouts.approval_reset_reason IS
  'MYK9-2170: why the payout run withdrew an approval and sent the payout back to awaiting_approval.';

-- -----------------------------------------------------------------------------
-- 3a. approve_show_payout
--    Returns 'approved' (this call approved it) or 'already_approved' (an
--    earlier call did). Raises 42501 not a site admin or no person record,
--    MKAUT no recent sign-in, P0002 no such payout, 22023 not waiting for
--    approval, no destination account, or an amount or destination other than
--    the one the approver reviewed (p_expected_stripe_account_id).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_show_payout(
  p_payout_id uuid,
  p_amount_cents integer,
  p_expected_stripe_account_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.show_payouts;
  v_destination text;
  v_person uuid;
BEGIN
  IF NOT (SELECT public.is_site_admin()) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;
  PERFORM public.require_recent_reauth();

  IF p_amount_cents IS NULL THEN
    RAISE EXCEPTION 'Say which amount you are approving' USING ERRCODE = '22023';
  END IF;
  IF nullif(btrim(coalesce(p_expected_stripe_account_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Say which bank account you are approving' USING ERRCODE = '22023';
  END IF;

  SELECT p.id INTO v_person
    FROM public.people p
   WHERE p.auth_user_id = auth.uid()
   LIMIT 1;
  IF v_person IS NULL THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  -- Row lock first: a second approval at the same time waits here, then reads
  -- the row as approved.
  SELECT * INTO v_row FROM public.show_payouts sp WHERE sp.id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.approved_at IS NOT NULL AND v_row.status IN ('approved', 'processing') THEN
    -- A second approval of the SAME amount is a no-op. A different amount is
    -- refused, so nobody is told they approved a figure that was never bound.
    IF v_row.approved_amount_cents IS DISTINCT FROM p_amount_cents
       OR v_row.approved_stripe_account_id IS DISTINCT FROM p_expected_stripe_account_id THEN
      RAISE EXCEPTION 'This payout is already approved for % cents to %',
        v_row.approved_amount_cents, v_row.approved_stripe_account_id
        USING ERRCODE = '22023';
    END IF;
    RETURN 'already_approved';
  END IF;
  IF v_row.status NOT IN ('awaiting_approval', 'held') THEN
    RAISE EXCEPTION 'This payout is %, not waiting for approval', v_row.status
      USING ERRCODE = '22023';
  END IF;

  SELECT csa.stripe_account_id INTO v_destination
    FROM public.club_stripe_accounts csa
   WHERE csa.id = v_row.club_stripe_account_id;
  IF v_destination IS NULL THEN
    RAISE EXCEPTION 'This payout has no bank account to send to yet' USING ERRCODE = '22023';
  END IF;
  -- Bind what the approver reviewed, never a destination looked up now.
  IF v_destination <> p_expected_stripe_account_id THEN
    RAISE EXCEPTION 'The club''s bank account changed since you looked; review it again'
      USING ERRCODE = '22023';
  END IF;
  IF v_row.amount_cents <> p_amount_cents OR v_row.amount_cents <= 0 THEN
    RAISE EXCEPTION 'The amount is now % cents; review it again', v_row.amount_cents
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.show_payouts sp
     SET status = 'approved',
         approved_at = now(),
         approved_by = v_person,
         approved_amount_cents = p_amount_cents,
         approved_stripe_account_id = v_destination,
         hold_reason = NULL,
         approval_reset_reason = NULL
   WHERE sp.id = p_payout_id;

  RETURN 'approved';
END;
$$;

REVOKE ALL ON FUNCTION public.approve_show_payout(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_show_payout(uuid, integer, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3b. hold_show_payout
--    Keeps a waiting or approved (not yet sent) payout waiting, with a reason,
--    and withdraws any approval. A held payout can be approved later. Raises
--    42501 / P0002 as above, 22023 for a blank or long reason or a payout that
--    is not waiting. Holding stops a release, so no recent sign-in is needed.
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

  SELECT sp.status INTO v_status FROM public.show_payouts sp WHERE sp.id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status NOT IN ('awaiting_approval', 'approved', 'held') THEN
    RAISE EXCEPTION 'This payout is %, so it cannot be held', v_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.show_payouts sp
     SET status = 'held',
         hold_reason = v_reason,
         approved_at = NULL,
         approved_by = NULL,
         approved_amount_cents = NULL,
         approved_stripe_account_id = NULL
   WHERE sp.id = p_payout_id;

  RETURN 'held';
END;
$$;

REVOKE ALL ON FUNCTION public.hold_show_payout(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hold_show_payout(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. claim_show_payout_for_send (service_role only)
--    Returns jsonb {outcome, payout_id, approved_amount_cents}. outcome:
--      claimed            the row is 'processing'; send p_amount_cents
--      awaiting_approval  recorded or kept waiting; send nothing
--      approval_reset     an approval no longer covers this send; send nothing
--      held               a site admin is holding it (amount refreshed); send nothing
--      busy               another run owns the show, or it is already settled
--      account_mismatch   p_account_id is not this show's club's account with
--                         destination p_destination; send nothing
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_show_payout_for_send(
  p_show_id uuid,
  p_account_id uuid,
  p_destination text,
  p_amount_cents integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_brake boolean;
  v_row public.show_payouts;
  v_id uuid;
  v_next text;
BEGIN
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'A payout claim needs a positive amount' USING ERRCODE = '22023';
  END IF;

  -- Same transaction as the claim: switching the brake on waits for this
  -- claim to commit, or this claim sees it on. No row reads as on.
  SELECT ps.payouts_require_approval INTO v_brake
    FROM public.platform_settings ps
   WHERE ps.id
     FOR SHARE;
  v_brake := coalesce(v_brake, true);

  IF NOT EXISTS (
    SELECT 1
      FROM public.club_stripe_accounts csa
      JOIN public.shows s ON s.club_id = csa.club_id
     WHERE csa.id = p_account_id
       AND s.id = p_show_id
       AND csa.stripe_account_id = p_destination
  ) THEN
    RETURN jsonb_build_object('outcome', 'account_mismatch');
  END IF;

  SELECT * INTO v_row
    FROM public.show_payouts sp
   WHERE sp.show_id = p_show_id
     AND sp.status <> 'failed'
     FOR UPDATE;

  IF NOT FOUND THEN
    v_next := CASE WHEN v_brake THEN 'awaiting_approval' ELSE 'processing' END;
    BEGIN
      INSERT INTO public.show_payouts (
        show_id, club_stripe_account_id, amount_cents, status, scheduled_date
      )
      VALUES (p_show_id, p_account_id, p_amount_cents, v_next, current_date)
      RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
      -- Another run inserted this show's live row first.
      RETURN jsonb_build_object('outcome', 'busy');
    END;
    RETURN jsonb_build_object(
      'outcome', CASE WHEN v_brake THEN 'awaiting_approval' ELSE 'claimed' END,
      'payout_id', v_id
    );
  END IF;

  IF v_row.status = 'pending' THEN
    v_next := CASE WHEN v_brake THEN 'awaiting_approval' ELSE 'processing' END;
    UPDATE public.show_payouts sp
       SET status = v_next,
           amount_cents = p_amount_cents,
           club_stripe_account_id = p_account_id
     WHERE sp.id = v_row.id;
    RETURN jsonb_build_object(
      'outcome', CASE WHEN v_brake THEN 'awaiting_approval' ELSE 'claimed' END,
      'payout_id', v_row.id
    );
  END IF;

  IF v_row.status = 'awaiting_approval' THEN
    UPDATE public.show_payouts sp
       SET amount_cents = p_amount_cents,
           club_stripe_account_id = p_account_id
     WHERE sp.id = v_row.id;
    RETURN jsonb_build_object('outcome', 'awaiting_approval', 'payout_id', v_row.id);
  END IF;

  IF v_row.status = 'approved' THEN
    IF v_row.approved_stripe_account_id = p_destination
       AND p_amount_cents <= v_row.approved_amount_cents THEN
      UPDATE public.show_payouts sp
         SET status = 'processing',
             amount_cents = p_amount_cents,
             club_stripe_account_id = p_account_id
       WHERE sp.id = v_row.id;
      RETURN jsonb_build_object(
        'outcome', 'claimed',
        'payout_id', v_row.id,
        'approved_amount_cents', v_row.approved_amount_cents
      );
    END IF;
    UPDATE public.show_payouts sp
       SET status = 'awaiting_approval',
           amount_cents = p_amount_cents,
           club_stripe_account_id = p_account_id,
           approved_at = NULL,
           approved_by = NULL,
           approved_amount_cents = NULL,
           approved_stripe_account_id = NULL,
           approval_reset_reason = CASE
             WHEN v_row.approved_stripe_account_id IS DISTINCT FROM p_destination
               THEN 'The club''s bank account changed after approval'
             ELSE format('The amount rose from %s to %s cents after approval',
                         v_row.approved_amount_cents, p_amount_cents)
           END
     WHERE sp.id = v_row.id;
    RETURN jsonb_build_object('outcome', 'approval_reset', 'payout_id', v_row.id);
  END IF;

  IF v_row.status = 'held' THEN
    -- Keep the hold and its reason; only the amount follows refunds, so the
    -- figure owed and the figure a site admin approves later stay current.
    UPDATE public.show_payouts sp
       SET amount_cents = p_amount_cents
     WHERE sp.id = v_row.id;
    RETURN jsonb_build_object('outcome', 'held', 'payout_id', v_row.id);
  END IF;

  -- processing or completed: another run has it, or it is done.
  RETURN jsonb_build_object('outcome', 'busy', 'payout_id', v_row.id);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_show_payout_for_send(uuid, uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_show_payout_for_send(uuid, uuid, text, integer)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 5a. Money owed counts payouts waiting on the brake.
--    financial_reconciliation_summary, COPIED FROM THE LATEST DEFINITION
--    (20261004193700_myk9_997_platform_income_club_funded_refunds.sql). One
--    change: payout_pending_cents also sums awaiting_approval, approved and
--    held. Same return type, so CREATE OR REPLACE; grants restated.
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
-- 5b. The health board counts payouts waiting on the brake as in flight.
--    Both system_health_probe overloads, COPIED FROM THE LATEST DEFINITIONS
--    (20261008124700_myk9_1052_health_probe_cron_history_one_pass.sql). One
--    change in each: payout_ledger.in_flight also counts awaiting_approval,
--    approved and held, so the board reads them as in flight instead of
--    "all N payouts settled". stale_in_flight still counts only 'processing':
--    a payout waiting for a person is not a stalled run.
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
