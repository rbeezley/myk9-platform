-- MYK9-716 — publishing a show requires an entry window.
--
-- Richard's decision (2026-09-24, recorded on MYK9-716): a DRAFT may have no
-- entry window, but PUBLISHING requires one. MYK9-649 / PR #2406 made a
-- windowless show safe to render (`window_unknown`), and this makes it
-- unreachable for a newly published show.
--
-- WHAT CHANGES: enforce_show_publish_gate() gains a third refusal, checked
-- LAST (after the missing-club and Stripe-readiness refusals, so every
-- existing MK003 case keeps its message): both shows.entry_open_date and
-- shows.entry_close_date must be set, and the window must not close before
-- it opens. A same-day window is valid: entry dates are persisted as calendar
-- days (the wizard's online create writes toLocalDateOnly, so a window that
-- opens and closes on one day lands as the same midnight) and the close day
-- is inclusive. It raises its own SQLSTATE, MK005, so the status pill can
-- link to the entry dates instead of the payments page
-- (PUBLISH_GATE_ERRCODE_ENTRY_WINDOW, onlineEntryGate.ts). The two RAISE texts
-- are ENTRY_WINDOW_REQUIRED_MESSAGE and ENTRY_WINDOW_ORDER_MESSAGE verbatim
-- (pinned by publishGateMigrationContract.test.ts).
--
-- WHAT DOES NOT CHANGE: the trigger (trg_enforce_show_publish_gate, BEFORE
-- INSERT OR UPDATE OF status, created by 20260916003500) is untouched, and so
-- is everything else in the body: the API-roles-only carve-out, the TG_OP
-- branching (only a transition INTO 'published' is gated; an already
-- published show is never re-gated or retroactively un-published), and the
-- two MK003 refusals. Body copied from the LATEST migration that defines this
-- function (20260916003500_enforce_show_publish_gate.sql), compared against
-- the live pg_get_functiondef on 2026-09-25 before editing.
--
-- EXISTING ROWS: none affected. A read-only query on 2026-09-25 found no live
-- show, draft or published, with a missing or inverted entry window (the one
-- windowless draft MYK9-649 counted on 2026-09-18 has since been given one).
-- A published show that lost its window would not be touched by this gate
-- anyway (never retroactive).
--
-- Drafts stay saveable without a window: a draft never reaches the check
-- (INSERT/UPDATE into any status other than 'published' returns early).

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_show_publish_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_livemode boolean;
  v_ready boolean;
BEGIN
  -- API-roles-only carve-out (see 20260916003500's header). This gate is a
  -- backstop for PostgREST/API callers only, so it applies exclusively to the
  -- roles a PostgREST request actually runs as (`authenticated`, `anon`).
  -- Everything else -- a direct superuser session with no SET ROLE ('none'),
  -- and `service_role` (edge functions, crons, the seed script, and every
  -- supabase/tests/*.sql fixture) -- bypasses it. Not reachable from any
  -- client path: SECURITY DEFINER changes the effective user this function
  -- body runs as, not current_setting('role', true), which always reflects
  -- the caller's own SET ROLE (the JWT-derived `authenticated`/`anon` for a
  -- PostgREST request) — a client cannot set this GUC itself.
  -- INVARIANT: service_role bypasses this gate; if publish ever moves behind
  -- an edge function (which runs as service_role), the gate must be
  -- restated there, not assumed inherited from this trigger.
  IF coalesce(current_setting('role', true), 'none') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- The gated set is 'published' only ('accepting_entries' is not a permitted
  -- shows.status, 072_align_show_class_statuses.sql). NULL-safe membership
  -- checks: IS DISTINCT FROM never collapses to NULL the way IN (...) would.
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'published' THEN
      RETURN NEW;
    END IF;
  ELSE
    -- UPDATE OF status. Only a transition INTO 'published' from OUTSIDE it.
    -- An already-published show keeps saving unrelated edits without being
    -- re-gated, and a draft-to-draft or draft-to-cancelled write never
    -- reaches this branch.
    IF NEW.status IS DISTINCT FROM 'published' OR OLD.status IS NOT DISTINCT FROM 'published' THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.club_id IS NULL THEN
    -- Mirrors CLUB_REQUIRED_MESSAGE (onlineEntryGate.ts) verbatim.
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

  -- MYK9-716: a draft may have no entry window; publishing requires one.
  -- Checked last so the club and Stripe refusals above keep their precedence.
  -- Mirrors ENTRY_WINDOW_REQUIRED_MESSAGE / ENTRY_WINDOW_ORDER_MESSAGE
  -- (onlineEntryGate.ts) verbatim.
  IF NEW.entry_open_date IS NULL OR NEW.entry_close_date IS NULL THEN
    RAISE EXCEPTION 'Set the entry window before publishing — exhibitors need to know when entries open and close.'
      USING ERRCODE = 'MK005';
  END IF;

  -- Calendar-day semantics: equal dates are a one-day window, not an error.
  IF NEW.entry_open_date > NEW.entry_close_date THEN
    RAISE EXCEPTION 'The entry window can''t close before it opens. Fix the entry dates, then publish.'
      USING ERRCODE = 'MK005';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_show_publish_gate() IS
  'MYK9-579, extended by MYK9-716: server-side backstop for a show entering ''published''. Refuses, in order: a show with no club (MK003, CLUB_REQUIRED_MESSAGE); a club with no payouts-enabled Stripe account in the platform''s mode, read from platform_settings.stripe_livemode (MK003, PUBLISH_BLOCKED_MESSAGE); and (MYK9-716) a show with no entry window, or one whose entry_close_date is before its entry_open_date (a same-day window is valid: the dates are calendar days and the close day is inclusive) (MK005, ENTRY_WINDOW_REQUIRED_MESSAGE / ENTRY_WINDOW_ORDER_MESSAGE). A draft may have no entry window; only publishing requires one. The gated set is (''published'') only — ''accepting_entries'' is not a permitted shows.status (072_align_show_class_statuses.sql). The status pill (ShowStatusPill.tsx) is the only surface that transitions a show INTO ''published''; isPublishGateDbError (onlineEntryGate.ts) maps MK003/MK004/MK005 client-side. Fires on BEFORE INSERT OR UPDATE OF status (trg_enforce_show_publish_gate), branching on TG_OP: INSERT gates any row created already published; UPDATE gates only a transition INTO ''published'' FROM a different status, and exempts an already-published show (unrelated edits are never re-gated or retroactively un-published). All membership checks use IS DISTINCT FROM, never IN/NOT IN. Carves out coalesce(current_setting(''role'', true), ''none'') NOT IN (''authenticated'', ''anon'') — a direct superuser session and service_role (edge functions, crons, the seed script, supabase/tests/*.sql fixtures) both bypass. INVARIANT: if publish ever moves behind an edge function (service_role), the gate must be restated there. MYK9-572''s club-authorization refusal (MK004) is a separate trigger, trg_enforce_show_club_authorization, which fires first.';

-- Trigger-only function: nothing calls it directly. A trigger fires
-- regardless of EXECUTE privilege, so this is an explicit grant DECISION for
-- migrationGrantDecisionContract, not a functional requirement.
REVOKE ALL ON FUNCTION public.enforce_show_publish_gate() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_show_publish_gate() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_show_publish_gate() FROM authenticated;

COMMIT;

-- Verify against the APPLIED database, never the migration text:
--
--   select pg_get_functiondef('public.enforce_show_publish_gate'::regproc) ~ 'MK005';
--
--   select tgname, pg_get_triggerdef(oid)
--   from pg_trigger
--   where tgrelid = 'public.shows'::regclass and tgname = 'trg_enforce_show_publish_gate';
