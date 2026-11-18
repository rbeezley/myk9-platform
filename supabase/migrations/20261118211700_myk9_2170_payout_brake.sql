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
--    AFTER UPDATE trigger, whichever path made the change.
--
-- 2. show_payouts gains three statuses:
--      awaiting_approval  cron-process-payouts worked out the amount and the
--                         club can receive it, but the brake is on.
--      approved           a site admin approved it; the next payout run sends
--                         it through the job's one send path (money lock,
--                         recalculation after the claim, transfer_group guard).
--      held               a site admin is keeping it waiting, with a reason.
--    None is 'failed', so the one-live-row-per-show index
--    (show_payouts_one_live_per_show, WHERE status <> 'failed') covers them:
--    a show still has at most one live row.
--    approved_at: stamped by the approve RPC. A transfer attempt that fails
--      after approval (a card-clearing balance delay) leaves a failed row, and
--      the next run carries this stamp onto the retry row instead of asking for
--      approval again.
--    last_reminded_at: the cron's once-a-day reminder claim.
--
-- 3. payout_approval_events: append-only record of brake switches and of each
--    approve or hold (with the hold reason). Kept off show_payouts because
--    club admins and secretaries read every show_payouts column of their own
--    shows; a hold reason is the operator's note, not theirs. Site admins read
--    it; nobody writes it directly (the trigger and the two RPCs are SECURITY
--    DEFINER). anon gets nothing: explicit REVOKE, because this project's
--    default privileges grant anon full CRUD on every new table.
--
-- 4. approve_show_payout(uuid) and hold_show_payout(uuid, text): site admin
--    only. Each is one guarded UPDATE ... WHERE status IN (...) RETURNING, so
--    two approvals at once change the row once and the second reads back
--    'already_approved'. Neither calls Stripe; the payout run does. Both
--    resolve the payout's daily reminder alert (operator_alerts, source
--    'cron-process-payouts', dedupe_key 'payout-awaiting-approval-<id>').
--
-- Behavioral coverage (CI only): supabase/tests/myk9_2170_payout_brake_test.sql
-- Rollback: drop the two functions, the trigger and its function, the table and
-- the three columns, and restore the four-status CHECK (after moving any rows
-- in the new statuses back to 'pending').
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. The setting
-- -----------------------------------------------------------------------------
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS payouts_require_approval boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.platform_settings.payouts_require_approval IS
  'MYK9-2170 payout brake. true (default): cron-process-payouts records every payout it would send as awaiting_approval and sends only rows a site admin approved (approve_show_payout). false: payouts send on the nightly run as before. Every change is recorded in payout_approval_events.';

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
  ADD COLUMN IF NOT EXISTS last_reminded_at timestamptz;

COMMENT ON COLUMN public.show_payouts.approved_at IS
  'MYK9-2170: when a site admin approved this payout (approve_show_payout). Carried onto the retry row when an approved transfer attempt fails, so a retry is not re-approved.';
COMMENT ON COLUMN public.show_payouts.last_reminded_at IS
  'MYK9-2170: when cron-process-payouts last reminded the operator that this payout is awaiting approval (at most once a day).';

-- -----------------------------------------------------------------------------
-- 3. payout_approval_events
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payout_approval_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  event           text NOT NULL
    CHECK (event IN ('brake_on', 'brake_off', 'approved', 'held')),
  show_payout_id  uuid REFERENCES public.show_payouts (id) ON DELETE CASCADE,
  reason          text,
  actor_person_id uuid REFERENCES public.people (id) ON DELETE SET NULL,
  actor_role      text NOT NULL,
  CONSTRAINT payout_approval_events_payout_shape CHECK (
    (event IN ('approved', 'held')) = (show_payout_id IS NOT NULL)
  ),
  CONSTRAINT payout_approval_events_hold_reason CHECK (
    event <> 'held' OR length(btrim(coalesce(reason, ''))) > 0
  )
);

COMMENT ON TABLE public.payout_approval_events IS
  'MYK9-2170: append-only record of payout brake switches (platform_settings.payouts_require_approval) and of each payout approval or hold. Written only by trg_record_payout_brake_change and the approve_show_payout / hold_show_payout RPCs; site admins read it.';

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
-- 4. Record every brake switch
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_payout_brake_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
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
-- 5. approve_show_payout
--    Returns 'approved' (this call approved it) or 'already_approved' (it was
--    approved, or is being or has been sent, by an earlier call). Anything else
--    raises: 42501 not a site admin, P0002 no such payout, 22023 a payout that
--    is not waiting for approval.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_show_payout(p_payout_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
BEGIN
  IF NOT (SELECT public.is_site_admin()) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  -- One guarded UPDATE: a concurrent second approval waits on the row lock,
  -- re-reads the status as 'approved' and matches nothing.
  UPDATE public.show_payouts sp
     SET status = 'approved',
         approved_at = now()
   WHERE sp.id = p_payout_id
     AND sp.status IN ('awaiting_approval', 'held')
  RETURNING sp.status INTO v_status;

  IF v_status IS NULL THEN
    SELECT sp.status INTO v_status FROM public.show_payouts sp WHERE sp.id = p_payout_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Payout not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_status IN ('approved', 'processing', 'completed') THEN
      RETURN 'already_approved';
    END IF;
    RAISE EXCEPTION 'This payout is %, not waiting for approval', v_status
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.payout_approval_events (event, show_payout_id, actor_person_id, actor_role)
  VALUES (
    'approved', p_payout_id, public.payout_approval_actor_person_id(),
    coalesce(nullif(current_setting('role', true), ''), 'none')
  );

  UPDATE public.operator_alerts a
     SET resolved_at = now(), resolved_by = auth.uid()
   WHERE a.source = 'cron-process-payouts'
     AND a.dedupe_key = 'payout-awaiting-approval-' || p_payout_id::text
     AND a.resolved_at IS NULL;

  RETURN 'approved';
END;
$$;

REVOKE ALL ON FUNCTION public.approve_show_payout(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_show_payout(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.approve_show_payout(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. hold_show_payout
--    Keeps a waiting (or approved, not yet sent) payout waiting, with a reason.
--    A held payout can be approved later. Holding it again records the new
--    reason. Raises 42501 / P0002 as above, 22023 for a blank reason or a
--    payout already being sent or settled.
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
         approved_at = NULL
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

  UPDATE public.operator_alerts a
     SET resolved_at = now(), resolved_by = auth.uid()
   WHERE a.source = 'cron-process-payouts'
     AND a.dedupe_key = 'payout-awaiting-approval-' || p_payout_id::text
     AND a.resolved_at IS NULL;

  RETURN 'held';
END;
$$;

REVOKE ALL ON FUNCTION public.hold_show_payout(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hold_show_payout(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.hold_show_payout(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
