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
-- -- API-ROLES-ONLY CARVE-OUT (not just service_role) --------------------------
-- The gate is a backstop for API callers — PostgREST always `SET ROLE` to
-- `anon` or `authenticated` (or, when a request uses the service-role key,
-- `service_role`) before running a request. A direct superuser session — a
-- migration, `supabase/seed-demo.sql`, or a `supabase/tests/*.sql` fixture
-- connecting over psql as the `postgres` user — never issues a `SET ROLE` at
-- all, so `current_setting('role', true)` reads `'none'` (Postgres's
-- documented default/reset value for the `role` GUC when no `SET ROLE` is
-- active in the session). A carve-out scoped to `= 'service_role'` only
-- would still gate that `'none'` session: 34 existing `supabase/tests/*.sql`
-- files insert `status='published'` fixtures as plain postgres with no `SET
-- ROLE` at all (e.g. `admin_soft_deleted_show_visibility_test.sql`), and
-- `supabase/seed-demo.sql` inserts three shows directly as 'published' the
-- same way, including MYK9-109's Load Clubs 2 and 3, published WITHOUT a
-- club_stripe_accounts row ON PURPOSE ("a club with no payment account is
-- itself a fixture" — it exercises the exhibitor checkout-refusal state,
-- MYK9-386). Wrapping every one of those fixtures in `SET LOCAL ROLE
-- service_role; ... RESET ROLE;` is the wrong fix for a backstop that exists
-- only for API callers. Scope the gate to the roles PostgREST actually uses
-- instead:
--
--   IF coalesce(current_setting('role', true), 'none') NOT IN ('authenticated', 'anon') THEN
--     RETURN NEW;
--   END IF;
--
-- This bypasses postgres/superuser sessions (`'none'`) AND `service_role`
-- (edge functions, crons, and the service-role key) in one branch, while
-- still gating exactly the two roles a PostgREST request ever runs as. The
-- `coalesce(..., 'none')` only guards the case where the GUC comes back
-- unset rather than the string `'none'`; either value takes the bypass
-- branch.
--
-- This carve-out is NOT reachable from any client path: `create_show_with_children`
-- is SECURITY DEFINER, which changes the EFFECTIVE USER the function body runs
-- as (so its internal checks like is_site_admin()/is_club_admin() see the
-- function owner's privileges), but it does NOT change `current_setting('role',
-- true)` — that GUC reflects the session's `SET ROLE`, which for a PostgREST
-- request is always the JWT-derived role (`authenticated` or `anon`), never
-- `'none'` or `service_role`. A client cannot set that GUC itself. Only a
-- direct superuser session (no SET ROLE) or a connection actually
-- authenticated as the Postgres `service_role` role (the seed script, cron
-- jobs, and edge functions using the service-role key) reaches the bypass.
-- Mirrors trg_guard_platform_settings_write's own `service_role` carve-out
-- (20260615180000) in spirit, widened to the roles this gate needs to exempt.
--
-- Behavioural SQL tests (`supabase/tests/show_publish_gate_trigger_test.sql`)
-- must therefore `SET LOCAL ROLE authenticated` plus a JWT
-- (`set_config('request.jwt.claim.sub', <person's auth_user_id>, true)`) for
-- every case that expects the gate to actually fire — a plain postgres
-- session (the default for every other fixture in this file) no longer
-- exercises it at all.
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
  -- API-roles-only carve-out (see header). This gate is a backstop for
  -- PostgREST/API callers only, so it applies exclusively to the roles a
  -- PostgREST request actually runs as (`authenticated`, `anon`). Everything
  -- else -- a direct superuser session with no SET ROLE ('none'), and
  -- `service_role` (edge functions, crons, the seed script, and every
  -- supabase/tests/*.sql fixture) -- bypasses it. Not reachable from any
  -- client path: SECURITY DEFINER changes the effective user this function
  -- body runs as, not current_setting('role', true), which always reflects
  -- the caller's own SET ROLE (the JWT-derived `authenticated`/`anon` for a
  -- PostgREST request) — a client cannot set this GUC itself. Mirrors
  -- trg_guard_platform_settings_write's own `service_role` carve-out
  -- (20260615180000), widened to the roles this gate needs to exempt.
  -- INVARIANT: service_role bypasses this gate; if publish ever moves behind
  -- an edge function (which runs as service_role), the gate must be
  -- restated there, not assumed inherited from this trigger.
  IF coalesce(current_setting('role', true), 'none') NOT IN ('authenticated', 'anon') THEN
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
  'MYK9-579: server-side backstop for the draft->published Stripe-payouts gate. Mirrors publishGateError (ShowEditPanel.helpers.ts) and the inline check in ShowStatusPill.tsx exactly, including their copy (SQLSTATE MK003, mapped client-side via isPublishGateDbError in onlineEntryGate.ts). Livemode is read from platform_settings.stripe_livemode (Option 1 of the MYK9-579 design decision; flips together with STRIPE_SECRET_KEY for the MYK9-11 live cutover, see the column comment). Fires on BEFORE INSERT OR UPDATE OF status, branching on TG_OP: INSERT gates any row created already-published (create_show_with_children and createShow() both let the caller set status); UPDATE gates only a transition INTO published and exempts an already-published show (OLD.status = published) so unrelated edits on a live show are never re-gated or retroactively un-published. Carves out coalesce(current_setting(''role'', true), ''none'') NOT IN (''authenticated'', ''anon'') -- a direct superuser session (no SET ROLE, reads ''none'') and service_role (edge functions, crons, the seed script, supabase/tests/*.sql fixtures) both bypass; only the two roles PostgREST actually runs requests as are gated. Unreachable from any client path, since SECURITY DEFINER changes the effective user the function runs as, not this GUC. INVARIANT: if publish ever moves behind an edge function (service_role), the gate must be restated there.';

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
