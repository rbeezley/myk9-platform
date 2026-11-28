-- =============================================================================
-- MYK9-2182: payout brake, part B. A payout waiting for approval reminds the
-- operator once a day, through the existing alertAdmin / operator_alerts path,
-- until a site admin approves or holds it. Parent MYK9-1956; part A (the
-- fail-closed brake) is 20261119041300_myk9_2170_payout_brake.sql.
--
-- One alert per payout: operator_alerts source 'cron-process-payouts',
-- dedupe_key 'payout-awaiting-approval-<show_payouts.id>'. cron-process-payouts
-- raises it (cron-process-payouts/approvalReminders.ts); this migration keeps it
-- current and resolves it.
--
-- 1. show_payouts.approval_reminded_at: when the payout run last reminded the
--    operator about this payout. The run claims a due payout by stamping it
--    (only while it is still awaiting_approval) right before raising its
--    reminder, and puts the old value back when the reminder fails, so a failed
--    or unsent reminder is due again on the next run. No new table: the column
--    rides on show_payouts, which authenticated reads (SELECT only, unchanged)
--    and only service_role writes.
--
-- 2. trg_show_payouts_approval_reminder (BEFORE UPDATE OF status): the one place
--    every route out of awaiting_approval passes through, because each of them
--    is a status change on this row: approve_show_payout (-> approved),
--    hold_show_payout (-> held), the payout run's claim (-> processing, if a
--    waiting row is ever claimed, for example after the brake is turned off),
--    and the run's full-refund close-out (-> completed). Leaving
--    awaiting_approval resolves the payout's unresolved reminder alert.
--    Entering awaiting_approval again (an approval withdrawn because the amount
--    rose or the destination changed) clears approval_reminded_at, so the next
--    run reminds at once instead of up to a day later.
--
-- 3. trg_operator_alerts_payout_approval_reminder (BEFORE INSERT on
--    operator_alerts, the reminder key only):
--      payout no longer waiting  -> the alert is inserted already resolved (a
--                                   reminder raced an approval; the record is
--                                   kept, nothing is left asking for approval)
--      an unresolved alert exists -> its title, detail and severity are
--                                   refreshed (the amount follows refunds) and
--                                   the insert is skipped, so there is one
--                                   current alert, never a second one
--      otherwise                  -> inserted as is
--    Both triggers lock the show_payouts row before touching operator_alerts,
--    so they cannot deadlock, and a status change and a reminder for the same
--    payout run one after the other.
--
-- Deploy order: push this migration BEFORE deploying cron-process-payouts. The
--   new function selects and writes approval_reminded_at; without the column
--   its reminder pass fails, which it counts and alerts, and nothing is sent or
--   changed for any payout. The old function never touches the new column or
--   the reminder key, so the migration is safe on its own.
--
-- Behavioral coverage (CI only):
--   supabase/tests/myk9_2182_payout_approval_reminders_test.sql
-- Rollback: drop both triggers and their functions, then the column.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. The reminder stamp
-- -----------------------------------------------------------------------------
ALTER TABLE public.show_payouts
  ADD COLUMN IF NOT EXISTS approval_reminded_at timestamptz;

COMMENT ON COLUMN public.show_payouts.approval_reminded_at IS
  'MYK9-2182: when cron-process-payouts last reminded the operator that this payout is awaiting approval (at most once a day). Cleared when the payout enters awaiting_approval again.';

-- -----------------------------------------------------------------------------
-- 2. Leaving awaiting_approval resolves the reminder; entering it resets the clock
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.show_payouts_approval_reminder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'awaiting_approval' AND NEW.status <> 'awaiting_approval' THEN
    UPDATE public.operator_alerts a
       SET resolved_at = now(),
           resolved_by = auth.uid()
     WHERE a.source = 'cron-process-payouts'
       AND a.dedupe_key = 'payout-awaiting-approval-' || OLD.id::text
       AND a.resolved_at IS NULL;
  END IF;

  IF NEW.status = 'awaiting_approval' AND OLD.status <> 'awaiting_approval' THEN
    NEW.approval_reminded_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.show_payouts_approval_reminder() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_show_payouts_approval_reminder ON public.show_payouts;
CREATE TRIGGER trg_show_payouts_approval_reminder
  BEFORE UPDATE OF status ON public.show_payouts
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.show_payouts_approval_reminder();

-- -----------------------------------------------------------------------------
-- 3. One current reminder alert per payout
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.operator_alerts_payout_approval_reminder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_suffix text := substr(NEW.dedupe_key, length('payout-awaiting-approval-') + 1);
  v_status text;
  v_existing uuid;
BEGIN
  IF v_suffix !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NEW;
  END IF;

  -- Same lock order as the status trigger: the payout row first.
  SELECT sp.status INTO v_status
    FROM public.show_payouts sp
   WHERE sp.id = v_suffix::uuid
     FOR SHARE;

  IF v_status IS DISTINCT FROM 'awaiting_approval' THEN
    NEW.resolved_at := coalesce(NEW.resolved_at, now());
    RETURN NEW;
  END IF;

  SELECT a.id INTO v_existing
    FROM public.operator_alerts a
   WHERE a.source = NEW.source
     AND a.dedupe_key = NEW.dedupe_key
     AND a.resolved_at IS NULL
     FOR UPDATE;

  IF v_existing IS NOT NULL THEN
    UPDATE public.operator_alerts a
       SET title = NEW.title,
           detail = NEW.detail,
           severity = NEW.severity
     WHERE a.id = v_existing;
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.operator_alerts_payout_approval_reminder() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_operator_alerts_payout_approval_reminder ON public.operator_alerts;
CREATE TRIGGER trg_operator_alerts_payout_approval_reminder
  BEFORE INSERT ON public.operator_alerts
  FOR EACH ROW
  WHEN (
    NEW.source = 'cron-process-payouts'
    AND NEW.dedupe_key LIKE 'payout-awaiting-approval-%'
  )
  EXECUTE FUNCTION public.operator_alerts_payout_approval_reminder();

NOTIFY pgrst, 'reload schema';

COMMIT;
