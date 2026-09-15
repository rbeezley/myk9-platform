-- MYK9-579 — enforce the draft->published Stripe-payouts gate in the database.
--
-- publishGateError (ShowEditPanel.helpers.ts) and the equivalent inline check
-- in ShowStatusPill.tsx already refuse a draft->published transition when the
-- club has no club_stripe_accounts row with payouts_enabled=true. Both are
-- CLIENT-SIDE ONLY: public.shows carries four triggers (shows_version_increment,
-- trg_ensure_show_lifecycle_email_steps, trg_sync_trial_registry_from_show,
-- update_shows_updated_at) and none of them is a publish gate, so a direct
-- PostgREST `update shows set status='published'` bypasses it entirely.
-- shows_update RLS is club-scoped, so this is not cross-tenant — it is a
-- backstop against a stale client, a hand-crafted request, or a future caller
-- that forgets the client-side check.
--
-- -- LIVEMODE: OPTION 1 (decided) --------------------------------------------
-- The client's only livemode reader (useClubStripeAccount.ts) used to trust
-- the build-time VITE_STRIPE_LIVEMODE env var. A database trigger cannot read
-- a Vite env var, so livemode needs a server-side source of truth regardless.
-- platform_settings.stripe_livemode (added below) becomes that source for
-- BOTH the client and this trigger: useClubStripeAccount.ts now reads it
-- instead of the env var (MYK9-11's Stripe live-mode cutover flips this one
-- column instead of a coordinated env-var + redeploy across every surface).
-- VITE_STRIPE_LIVEMODE is removed from the client entirely.
--
-- No new grant/policy needed: `authenticated` already holds TABLE-level
-- SELECT on platform_settings (20260615180000) gated only by
-- `is_anonymous IS NOT TRUE` (20260712160000), so the new column is readable
-- by every signed-in, non-anonymous-session caller -- exactly the population
-- that reaches ShowStatusPill, ShowEditPanel, and the (ProtectedRoute-gated)
-- registration wizard. anon and the ringside anonymous-session principal are
-- deliberately NOT extended: the fee-only column grant added by
-- 20260823160000 stays at exactly its three fee columns (see the updated
-- platformSettingsAnonFeeReadContract test), because no anon or passcode-
-- session surface reads Stripe livemode.
--
-- -- SCOPE: UPDATE ONLY, NOT INSERT ------------------------------------------
-- The issue asked to also consider gating INSERT ... status='published'. That
-- path was audited and found unreachable from the app today:
--   * useShowCreationWizardActions.ts's only exported action, handleCreateShow,
--     calls createDraftShow(saveShow), which hardcodes saveShow('draft', ...) --
--     the wizard cannot create an already-published show through the UI.
--   * ShowBulkActionsBar's ShowStatus type excludes 'published' entirely
--     (bulk status changes are completed/cancelled only).
-- The one place shows ARE inserted already-published is supabase/seed-demo.sql
-- (three direct `INSERT INTO public.shows (..., status, ...) VALUES (...,
-- 'published', ...)` statements), including MYK9-109's Load Clubs 2 and 3,
-- which are published WITHOUT a club_stripe_accounts row on purpose (comment:
-- "a club with no payment account is itself a fixture" -- it exercises the
-- exhibitor checkout-refusal state, MYK9-386). Gating INSERT would abort that
-- seed. Since no app path can reach INSERT ... status='published' in the first
-- place, there is no live gap to close by gating it, so this trigger is scoped
-- to UPDATE OF status only -- the actual transition the client-side gate names.
--
-- -- ALREADY-PUBLISHED SHOWS ARE EXEMPT --------------------------------------
-- Mirrors publishGateError exactly: the gate only fires on a transition INTO
-- 'published' (OLD.status IS DISTINCT FROM 'published'). An unrelated edit to
-- an already-published show (name, dates, judges, ...) always passes, and a
-- club that loses its Stripe readiness after publishing is never retroactively
-- un-published by this trigger.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. platform_settings.stripe_livemode
-- ---------------------------------------------------------------------------
ALTER TABLE public.platform_settings
  ADD COLUMN stripe_livemode boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.platform_settings.stripe_livemode IS
  'MYK9-579: the single server-side source of truth for which Stripe mode (test vs live) is authoritative. Read by enforce_show_publish_gate() and by the client (useClubStripeAccount.ts, replacing the removed VITE_STRIPE_LIVEMODE env var). Flip this one column for the MYK9-11 live-mode cutover.';

-- ---------------------------------------------------------------------------
-- 2. The gate itself
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_show_publish_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_livemode boolean;
  v_ready boolean;
BEGIN
  -- Only a transition INTO 'published'. An already-published show keeps
  -- saving unrelated edits, and a draft-to-draft or draft-to-cancelled write
  -- never reaches this branch at all.
  IF NEW.status IS DISTINCT FROM 'published' OR OLD.status IS NOT DISTINCT FROM 'published' THEN
    RETURN NEW;
  END IF;

  IF NEW.club_id IS NULL THEN
    -- Mirrors ShowStatusPill.tsx's own copy for the same refusal.
    RAISE EXCEPTION 'Assign a club to this show before publishing — entry fees are paid out to the club.'
      USING ERRCODE = 'MK003';
  END IF;

  SELECT stripe_livemode INTO v_livemode FROM public.platform_settings WHERE id = true;

  -- can_accept_online_entry_payment's `p_livemode` parameter carries a
  -- `DEFAULT false` -- never rely on it here, always pass v_livemode
  -- explicitly, or a live-mode cutover would silently re-check test-mode
  -- accounts instead of live ones.
  v_ready := public.can_accept_online_entry_payment(NEW.club_id, v_livemode);

  IF NOT v_ready THEN
    -- Mirrors PUBLISH_BLOCKED_MESSAGE (onlineEntryGate.ts) verbatim. A missing
    -- club_stripe_accounts row is refused by can_accept_online_entry_payment's
    -- own EXISTS check -- no separate "no row" branch needed here.
    RAISE EXCEPTION 'Connect your club''s payment account before publishing — online entry fees need somewhere to go. Find it under My Club → Payments.'
      USING ERRCODE = 'MK003';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_show_publish_gate() IS
  'MYK9-579: server-side backstop for the draft->published Stripe-payouts gate. Mirrors publishGateError (ShowEditPanel.helpers.ts) and the inline check in ShowStatusPill.tsx exactly, including their copy (SQLSTATE MK003, mapped client-side via isPublishGateDbError in onlineEntryGate.ts). Livemode is read from platform_settings.stripe_livemode (Option 1 of the MYK9-579 design decision; flips for the MYK9-11 live cutover). Exempts already-published shows (OLD.status = published) so unrelated edits on a live show are never re-gated or retroactively un-published. Scoped to UPDATE OF status only, not INSERT: no app path can insert an already-published show (useShowCreationWizardActions always creates drafts; ShowBulkActionsBar excludes published from its status union), and gating INSERT would break supabase/seed-demo.sql''s deliberate MYK9-386 fixture (Load Clubs 2/3 published with no Stripe account, to exercise the exhibitor checkout-refusal state).';

DROP TRIGGER IF EXISTS trg_enforce_show_publish_gate ON public.shows;
CREATE TRIGGER trg_enforce_show_publish_gate
  BEFORE UPDATE OF status ON public.shows
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_show_publish_gate();

-- Trigger-only function: nothing calls it directly (mirrors
-- enforce_show_registry_on_trial / sync_trial_registry_from_show,
-- 20260915163500). A trigger fires regardless of EXECUTE privilege, so this
-- is an explicit grant DECISION for migrationGrantDecisionContract, not a
-- functional requirement.
REVOKE ALL ON FUNCTION public.enforce_show_publish_gate() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_show_publish_gate() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_show_publish_gate() FROM authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verify against the APPLIED database, never the migration text:
--
--   select stripe_livemode from public.platform_settings where id = true;
--
--   select tgname, pg_get_triggerdef(oid)
--   from pg_trigger
--   where tgrelid = 'public.shows'::regclass and not tgisinternal
--   order by tgname;
