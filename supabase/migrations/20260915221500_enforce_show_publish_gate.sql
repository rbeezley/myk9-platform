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
-- This column is NOT a "single server-side source of truth" on its own — see
-- the COMMENT ON COLUMN below and MYK9-579's P2-5 fix note: every Stripe edge
-- function (stripe-checkout, stripe-connect-onboard, stripe-webhook,
-- stripe-customer-portal, stripe-payment-link, cron-process-payouts) derives
-- livemode from `isStripeLiveMode(STRIPE_SECRET_KEY)` independently, and
-- stripe-connect-onboard is what writes club_stripe_accounts.livemode. This
-- column and STRIPE_SECRET_KEY must be flipped TOGETHER for the MYK9-11
-- cutover — flipping the column alone blocks every publish platform-wide
-- (every account looks like it is in the wrong mode), and flipping the key
-- alone silently re-checks live accounts against the old (test-mode) gate.
--
-- No new grant/policy needed: `authenticated` already holds TABLE-level
-- SELECT on platform_settings (20260615180000) gated only by
-- `is_anonymous IS NOT TRUE` (20260712160000). That is a whole-ROW grant, not
-- a column-scoped one — unlike the three fee columns anon can read
-- (20260823160000, column-level SELECT to the `anon` ROLE only), an
-- authenticated, NON-anonymous-session caller reading platform_settings sees
-- every column, stripe_livemode included. That covers exactly the population
-- that reaches ShowStatusPill, ShowEditPanel, and the (ProtectedRoute-gated)
-- registration wizard. anon and the ringside anonymous-session principal are
-- deliberately NOT extended: the anon column grant added by 20260823160000
-- stays at exactly its three fee columns (see the updated
-- platformSettingsAnonFeeReadContract test), because no anon or passcode-
-- session surface reads Stripe livemode.
--
-- -- SCOPE: INSERT AND UPDATE OF status ---------------------------------------
-- An earlier draft of this migration scoped the trigger to UPDATE OF status
-- only, reasoning that no app path inserts an already-published show. That
-- reasoning covered the WIZARD (useShowCreationWizardActions.ts always
-- hardcodes 'draft') and the BULK ACTIONS bar (its ShowStatus type excludes
-- 'published'), but missed two others:
--   * `create_show_with_children` (SECURITY DEFINER, latest def
--     20260731140000_create_show_with_children_lock_owner_reads.sql) takes
--     `status` straight from the caller's JSON payload
--     (`COALESCE(NULLIF(p_show->>'status',''), 'draft')`) with no server-side
--     override, and is GRANTed to `authenticated`.
--   * `createShow()` (apps/myk9show/src/services/database/shows/writes.ts)
--     performs a plain PostgREST `insert` on `public.shows`, and shows_insert
--     RLS (135_allow_secretary_create_show.sql) admits club admins, trial
--     secretaries, and site admins for their own club.
-- A hand-crafted request through either path could INSERT an
-- already-published show for a club with no Stripe account. The trigger is
-- now BEFORE INSERT OR UPDATE OF status, branching on TG_OP:
--   * INSERT: gate whenever NEW.status = 'published' (a show cannot have a
--     prior status to compare against).
--   * UPDATE: unchanged — gate only a transition INTO 'published'
--     (OLD.status IS DISTINCT FROM 'published'), so an already-published show
--     keeps saving unrelated edits without being re-gated.
--
-- -- SERVICE_ROLE CARVE-OUT (seed fixture) -------------------------------------
-- supabase/seed-demo.sql inserts three shows directly as 'published',
-- including MYK9-109's Load Clubs 2 and 3, which are published WITHOUT a
-- club_stripe_accounts row ON PURPOSE (comment: "a club with no payment
-- account is itself a fixture" — it exercises the exhibitor checkout-refusal
-- state, MYK9-386). Gating INSERT unconditionally would abort that seed.
-- Mirrors trg_guard_platform_settings_write's own carve-out
-- (20260615180000): `IF current_setting('role', true) = 'service_role' THEN
-- RETURN NEW; END IF;` at the top of the function. The seed now wraps its
-- three `INSERT INTO public.shows` statements in `SET LOCAL ROLE
-- service_role; ... RESET ROLE;` to reach this carve-out — it does not run as
-- service_role by default (it connects over psql as the `postgres` user, the
-- same reason trg_guard_platform_settings_write's own manual-fix runbook
-- calls this out).
--
-- This carve-out is NOT reachable from any client path: `create_show_with_children`
-- is SECURITY DEFINER, which changes the EFFECTIVE USER the function body runs
-- as (so its internal checks like is_site_admin()/is_club_admin() see the
-- function owner's privileges), but it does NOT change `current_setting('role',
-- true)` — that GUC reflects the session's SET ROLE, which for a PostgREST
-- request is always the JWT-derived role (`authenticated` or `anon`), never
-- `service_role`. A client cannot set that GUC itself. Only a connection
-- authenticated as the Postgres `service_role` role (the seed script, cron
-- jobs, and edge functions using the service-role key) reaches this branch.
--
-- -- ALREADY-PUBLISHED SHOWS ARE EXEMPT (UPDATE only) -------------------------
-- Mirrors publishGateError exactly: on UPDATE the gate only fires on a
-- transition INTO 'published' (OLD.status IS DISTINCT FROM 'published'). An
-- unrelated edit to an already-published show (name, dates, judges, ...)
-- always passes, and a club that loses its Stripe readiness after publishing
-- is never retroactively un-published by this trigger.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. platform_settings.stripe_livemode
-- ---------------------------------------------------------------------------
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS stripe_livemode boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.platform_settings.stripe_livemode IS
  'MYK9-579: which Stripe mode (test vs live) enforce_show_publish_gate() and the client (useClubStripeAccount.ts, replacing the removed VITE_STRIPE_LIVEMODE env var) treat as authoritative. NOT independently authoritative: every Stripe edge function (stripe-checkout, stripe-connect-onboard, stripe-webhook, stripe-customer-portal, stripe-payment-link, cron-process-payouts) derives its own livemode from isStripeLiveMode(STRIPE_SECRET_KEY), and stripe-connect-onboard is what writes club_stripe_accounts.livemode. Flip this column and STRIPE_SECRET_KEY TOGETHER for the MYK9-11 cutover — flipping the column alone blocks every publish platform-wide, flipping the key alone silently re-checks live accounts against the old gate.';

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
  -- Seed-fixture carve-out (see header). Mirrors
  -- trg_guard_platform_settings_write's own carve-out. Not reachable from any
  -- client path: SECURITY DEFINER changes the effective user this function
  -- body runs as, not current_setting('role', true), which always reflects
  -- the caller's own SET ROLE (the JWT-derived `authenticated`/`anon` for a
  -- PostgREST request) — a client cannot set this GUC itself.
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'published' THEN
      RETURN NEW;
    END IF;
  ELSE
    -- UPDATE OF status. Only a transition INTO 'published'. An
    -- already-published show keeps saving unrelated edits, and a
    -- draft-to-draft or draft-to-cancelled write never reaches this branch.
    IF NEW.status IS DISTINCT FROM 'published' OR OLD.status IS NOT DISTINCT FROM 'published' THEN
      RETURN NEW;
    END IF;
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
  'MYK9-579: server-side backstop for the draft->published Stripe-payouts gate. Mirrors publishGateError (ShowEditPanel.helpers.ts) and the inline check in ShowStatusPill.tsx exactly, including their copy (SQLSTATE MK003, mapped client-side via isPublishGateDbError in onlineEntryGate.ts). Livemode is read from platform_settings.stripe_livemode (Option 1 of the MYK9-579 design decision; flips together with STRIPE_SECRET_KEY for the MYK9-11 live cutover, see the column comment). Fires on BEFORE INSERT OR UPDATE OF status, branching on TG_OP: INSERT gates any row created already-published (create_show_with_children and createShow() both let the caller set status); UPDATE gates only a transition INTO published and exempts an already-published show (OLD.status = published) so unrelated edits on a live show are never re-gated or retroactively un-published. Carves out current_setting(''role'', true) = ''service_role'' for supabase/seed-demo.sql''s deliberate MYK9-386 fixture (Load Clubs 2/3 published with no Stripe account); unreachable from any client path, since SECURITY DEFINER changes the effective user the function runs as, not this GUC.';

DROP TRIGGER IF EXISTS trg_enforce_show_publish_gate ON public.shows;
CREATE TRIGGER trg_enforce_show_publish_gate
  BEFORE INSERT OR UPDATE OF status ON public.shows
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
