-- =============================================================================
-- MYK9-1887: the show publish-gate refusals lose their em dashes.
--
-- Re-creates public.enforce_show_publish_gate() from its LATEST definition,
-- 20261003221700_myk9_979_online_entries_switch.sql (MYK9-979; no later
-- migration redefines it), verbatim except four RAISE EXCEPTION strings,
-- whose em dash becomes a full stop:
--   * CLUB_REQUIRED_MESSAGE (raised twice: becoming public, and turning
--     online entries on for a public show)
--   * ONLINE_ENTRIES_BLOCKED_MESSAGE
--   * PUBLISH_BLOCKED_MESSAGE
--   * ENTRY_WINDOW_REQUIRED_MESSAGE
-- No other wording changes. The client mirrors these strings verbatim in
-- apps/myk9show/src/features/payments/onlineEntryGate.ts, pinned by
-- publishGateMigrationContract.test.ts.
--
-- CREATE OR REPLACE keeps the function's owner, ACL and COMMENT, and the
-- trigger trg_enforce_show_publish_gate keeps pointing at it, so no COMMENT
-- or trigger statement is restated here and no GRANT is added. The three
-- REVOKEs at the end are 20261003221700's own, restated verbatim as this
-- migration's explicit grant decision for migrationGrantDecisionContract;
-- they leave the ACL exactly as it is. SECURITY DEFINER and
-- SET search_path = '' are kept as the latest definition has them.
--
-- Ship order: merge, supabase db push, then the next Deploy myK9Show, back to
-- back. Between the push and the deploy an old client reads the new text and
-- its exact-match checks miss: the publish pill shows the server's message
-- with the generic payments action, and the sync-failure toast falls back to
-- its generic "We couldn't save this show change" line. The publish is still
-- refused and nothing is lost; only the reason text is less specific.
-- =============================================================================

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
  v_turning_online_on boolean;
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

  -- MYK9-979: the gated set is every PUBLICLY VISIBLE status
  -- (private.show_status_is_public), not only 'published'. A row that is not
  -- (or no longer) public is never gated: a draft may clear or reverse its
  -- window or turn online entries on, and moving a show back to draft always
  -- passes.
  IF NOT private.show_status_is_public(NEW.status) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND private.show_status_is_public(OLD.status) THEN
    -- An ALREADY-public show is never re-gated on its club, authorization or
    -- Stripe readiness, and never retroactively, with two exceptions.

    -- MYK9-979: turning online entries ON for a public show needs the same
    -- Stripe readiness publishing with them on would, so the switch cannot
    -- be flipped after publishing to get round the gate.
    v_turning_online_on := NEW.online_entries_enabled IS TRUE
                           AND OLD.online_entries_enabled IS NOT TRUE;
    IF v_turning_online_on THEN
      IF NEW.club_id IS NULL THEN
        -- Mirrors CLUB_REQUIRED_MESSAGE (onlineEntryGate.ts) verbatim.
        RAISE EXCEPTION 'Assign a club to this show before publishing. Entry fees are paid out to the club.'
          USING ERRCODE = 'MK003';
      END IF;
      SELECT stripe_livemode INTO v_livemode FROM public.platform_settings WHERE id = true;
      IF NOT public.can_accept_online_entry_payment(NEW.club_id, v_livemode) THEN
        -- Mirrors ONLINE_ENTRIES_BLOCKED_MESSAGE (onlineEntryGate.ts) verbatim.
        RAISE EXCEPTION 'Connect your club''s payment account before turning on online entries. Online entry fees need somewhere to go. Find it under My Club → Payments.'
          USING ERRCODE = 'MK003';
      END IF;
    END IF;

    -- MYK9-716: only a CHANGE to its entry window is checked, so an edit that
    -- re-sends unchanged dates (even a legacy row that never had a window)
    -- still passes.
    IF NEW.entry_open_date IS NOT DISTINCT FROM OLD.entry_open_date
       AND NEW.entry_close_date IS NOT DISTINCT FROM OLD.entry_close_date THEN
      RETURN NEW;
    END IF;
    IF NEW.entry_open_date IS NULL OR NEW.entry_close_date IS NULL
       OR (NEW.entry_open_date AT TIME ZONE 'UTC')::date
          > (NEW.entry_close_date AT TIME ZONE 'UTC')::date THEN
      -- Mirrors ENTRY_WINDOW_PUBLISHED_MESSAGE (onlineEntryGate.ts) verbatim.
      RAISE EXCEPTION 'A published show has to keep its entry window: both dates set, and the close on or after the open. Discard this change or fix the dates.'
        USING ERRCODE = 'MK005';
    END IF;
    RETURN NEW;
  END IF;

  -- The row BECOMES publicly visible here: an INSERT of a public row, or an
  -- UPDATE from a non-public status into a public one. Every check runs.
  IF NEW.club_id IS NULL THEN
    -- Mirrors CLUB_REQUIRED_MESSAGE (onlineEntryGate.ts) verbatim.
    RAISE EXCEPTION 'Assign a club to this show before publishing. Entry fees are paid out to the club.'
      USING ERRCODE = 'MK003';
  END IF;

  -- MYK9-979: Stripe payouts are required ONLY when the show takes online
  -- entries. A show with online entries off (mail-in / at-the-show only)
  -- collects no card payments, so it needs no payout account.
  IF NEW.online_entries_enabled IS TRUE THEN
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
      RAISE EXCEPTION 'Connect your club''s payment account before publishing. Online entry fees need somewhere to go. Find it under My Club → Payments.'
        USING ERRCODE = 'MK003';
    END IF;
  END IF;

  -- MYK9-716: a draft may have no entry window; publishing requires one.
  -- Checked last so the club and Stripe refusals above keep their precedence.
  -- Mirrors ENTRY_WINDOW_REQUIRED_MESSAGE / ENTRY_WINDOW_ORDER_MESSAGE
  -- (onlineEntryGate.ts) verbatim.
  IF NEW.entry_open_date IS NULL OR NEW.entry_close_date IS NULL THEN
    RAISE EXCEPTION 'Set the entry window before publishing. Exhibitors need to know when entries open and close.'
      USING ERRCODE = 'MK005';
  END IF;

  -- Calendar-day semantics: equal days are a one-day window, not an error.
  -- Compared as the UTC calendar day, the same reading the entry-open/close
  -- guards use (20260711190000), so a legacy non-midnight value is judged by
  -- the day every other guard sees, never by its time of day.
  IF (NEW.entry_open_date AT TIME ZONE 'UTC')::date
     > (NEW.entry_close_date AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'The entry window can''t close before it opens. Fix the entry dates, then publish.'
      USING ERRCODE = 'MK005';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger-only function: nothing calls it directly. A trigger fires
-- regardless of EXECUTE privilege, so this is an explicit grant DECISION for
-- migrationGrantDecisionContract, not a functional requirement.
REVOKE ALL ON FUNCTION public.enforce_show_publish_gate() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_show_publish_gate() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_show_publish_gate() FROM authenticated;

COMMIT;
