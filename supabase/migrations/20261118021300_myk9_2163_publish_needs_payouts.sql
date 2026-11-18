-- =============================================================================
-- MYK9-2163: online entries are always on, and publishing needs the club's
-- payouts (part 1, server).
--
-- Reverses the MYK9-979 owner decision (2026-10-03) that let a club with no
-- Stripe account publish a mail-in-only show. From here on every publicly
-- visible show takes online entries, so becoming public needs the club's
-- payouts whatever online_entries_enabled says.
--
-- CHOICE: shows.online_entries_enabled is KEPT AND CONSTRAINED, not removed.
-- About 95 files read it (submit_show_entries, stripe-checkout, the public
-- show page), so dropping it would be a wide change for no behaviour gain.
-- Instead the server guarantees it is never false for a publicly visible
-- show, and new shows start with it on.
--
-- 1. COLUMN DEFAULT true (was false), so a new row starts with online entries
--    on. No grant change: the column keeps the table-level grants
--    (20261003221700 header, section 1).
--
-- 2. DATA. Every show with online_entries_enabled false is set true, soft-
--    deleted rows included, so no row can later be restored or re-published
--    into an illegal state. Applied database, read-only, 2026-11-17, before
--    this migration:
--      * 2 live PUBLISHED shows have it off. Both belong to non-demo test
--        clubs with no payouts. They STAY published and now take online
--        entries; exhibitor checkout for them is still refused by
--        stripe-checkout's own payouts check until the club connects a bank
--        account (payouts after publishing are out of scope here).
--      * 7 live DRAFTS have it off.
--      * 11 SOFT-DELETED shows have it off.
--      * No clubless shows (shows.club_id is NOT NULL since MYK9-1008).
--      * All 14 clubs are owner-confirmed test clubs; no real club exists.
--    NOT changed: accept_check_payments / accept_cash_payments on any row,
--    and clubs.is_demo on any club.
--    Side effects of the UPDATE, per row it changes (about 20 on live):
--      * update_shows_updated_at sets updated_at = now() and
--        shows_version_increment bumps version, which is what makes cached
--        replicas re-pull the row (they sync shows on updated_at). updated_at
--        is also set explicitly so the bump does not depend on that
--        trigger's WHEN clause.
--      * A changed show that already has a published premium will show
--        "Republish premium" (updated_at is now past published_premium_at).
--        That is accurate: a premium printed for a mail-in show no longer
--        matches a show that takes online entries.
--      * No other trigger fires: the remaining shows UPDATE triggers watch
--        other columns, and trg_enforce_show_publish_gate (which watches
--        this one) returns at once for the migration role, which is outside
--        its API-roles-only carve-out ('authenticated' / 'anon').
--      * Realtime emits one shows UPDATE per changed row, like any edit.
--
-- 3. private.club_publish_payouts_ok(club_id): the ONE place the publish gate
--    asks "may this club's show go public?". True when the club's Stripe
--    payouts are enabled in the platform's mode
--    (can_accept_online_entry_payment with platform_settings.stripe_livemode),
--    OR when the club is a demo/test club (clubs.is_demo, which only a
--    non-API session can set: guard_club_is_demo_write, MYK9-952). The demo
--    exemption covers the publish gate ONLY: checkout and submit_show_entries
--    still call can_accept_online_entry_payment directly, so a demo club
--    still cannot take a card payment without a real account.
--    AFTER THE STRIPE LIVE CUTOVER (MYK9-11) the exemption is inert for real
--    clubs (no real club has is_demo) and demo clubs only ever hold sandbox
--    data that stays off public listings (MYK9-952). It can be deleted with
--    one function edit: drop the is_demo arm of this function.
--
-- 4. enforce_show_publish_gate(), re-created from its LATEST definition
--    (20261113204300_myk9_1887_publish_gate_messages_no_em_dash.sql; no later
--    migration redefines it). Changes, nothing else:
--      a. Becoming public: the payouts check runs whatever
--         online_entries_enabled says (was: only when it is true), through
--         private.club_publish_payouts_ok. Its message
--         (PUBLISH_BLOCKED_MESSAGE) now says payouts are not enabled yet,
--         where a club admin fixes it, and that a Stripe review usually takes
--         a day or two.
--      b. ANY status, before the non-public early return: an API-role INSERT
--         of a row with online_entries_enabled not true, or an UPDATE that
--         turns it off (OLD true, NEW not true), is refused (MK003,
--         ONLINE_ENTRIES_ALWAYS_ON_MESSAGE). This keeps a draft from being
--         switched off (the deployed client's wizard sends an explicit false,
--         and its edit panel switch calls set_show_online_entries(id, false)),
--         since once the switch leaves the UI nothing could turn it back on.
--         The trigger already fires on UPDATE OF online_entries_enabled, so
--         this covers a direct write and set_show_online_entries alike. That
--         RPC is SECURITY DEFINER, but the gate keys on
--         current_setting('role'), which SECURITY DEFINER does not change, so
--         an API caller of the RPC is still gated; no second mechanism is
--         needed. Turning it ON, and any write that leaves an already-off row
--         off, pass this check, so a legacy off draft stays editable and can
--         be turned on.
--      c. Becoming public (UPDATE from a non-public status) with it still not
--         true is refused (MK003, ONLINE_ENTRIES_REQUIRED_MESSAGE), checked
--         after the club and payouts checks and before the entry window. Only
--         a legacy off row reaches this (an INSERT with it off is already
--         refused by b). Refused rather than silently flipped: a trigger that
--         rewrites what the caller sent would leave the client's replica
--         disagreeing with the server with no error to explain it. The message
--         is truthful because set_show_online_entries(id, true) can still
--         turn it on.
--      d. An already-public row with it not true is refused on any watched
--         edit (MK003, ONLINE_ENTRIES_REQUIRED_MESSAGE). Turning it off is
--         caught by b first, so only a legacy public row that is already off
--         (written outside the API roles) reaches this; it can be turned on.
--      e. Turning it on for an already-public show checks payouts through the
--         same helper (so the demo exemption applies there too). Its message
--         (ONLINE_ENTRIES_BLOCKED_MESSAGE) is unchanged.
--    Unchanged: the role carve-out (only 'authenticated' / 'anon' are gated),
--    the non-public early return (apart from b, a draft is never gated, so it
--    can be built in full before payouts are enabled), CLUB_REQUIRED_MESSAGE,
--    every MK005 entry-window check and message, and MK003 as the code for
--    every club / payouts / online refusal. No message has an em dash
--    (MYK9-1887).
--    The client mirrors the texts verbatim in
--    apps/myk9show/src/features/payments/onlineEntryGate.ts, pinned by
--    publishGateMigrationContract.test.ts.
--
-- 5. create_show_with_children, re-created from its LATEST definition
--    (20261028024100_myk9_1460_timezone_names_snapshot.sql; no later migration
--    redefines it), verbatim except that the new show is always created with
--    online_entries_enabled true: p_show.online_entries_enabled is ignored
--    (it used to be read, absent or null meaning false). The deployed
--    client's wizard sends an explicit false; ignoring it keeps that create
--    working instead of tripping the gate's section 4b refusal.
--
-- CREATE OR REPLACE keeps each function's owner, ACL and the trigger binding;
-- the REVOKE / GRANT lines restate the existing decisions for
-- migrationGrantDecisionContract and leave the ACLs as they are.
--
-- Ship order: merge, supabase db push, then the next Deploy myK9Show. Between
-- the push and the deploy an old client still offers the mail-in switch and
-- the old payouts text; the server refuses what it must, and the old client
-- shows the server's new message text.
--
-- Behavioral coverage (CI-only): supabase/tests/myk9_2163_publish_needs_payouts_test.sql,
-- with show_publish_gate_trigger_test.sql and myk9_979_online_entries_switch_test.sql
-- updated for the reversed rules.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. New shows start with online entries on
-- ---------------------------------------------------------------------------
ALTER TABLE public.shows
  ALTER COLUMN online_entries_enabled SET DEFAULT true;

COMMENT ON COLUMN public.shows.online_entries_enabled IS
  'MYK9-979, constrained by MYK9-2163: true when exhibitors may enter this show online (cart / card checkout / exhibitor submit_show_entries). Never false for a publicly visible show: enforce_show_publish_gate refuses publishing with it off and turning it off on a public show (MK003). A draft may hold either value. Defaults to true. Publishing needs the club''s payouts whatever this says (private.club_publish_payouts_ok).';

-- ---------------------------------------------------------------------------
-- 2. Data: every show takes online entries (see header section 2)
-- ---------------------------------------------------------------------------
UPDATE public.shows
   SET online_entries_enabled = true,
       updated_at = now()
 WHERE online_entries_enabled IS DISTINCT FROM true;

-- ---------------------------------------------------------------------------
-- 3. The publish gate's payouts question, with the demo-club exemption
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.club_publish_payouts_ok(p_club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  -- Demo / test clubs (clubs.is_demo) count as payouts-enabled for the
  -- publish gate ONLY, until the Stripe live cutover (MYK9-11). After it the
  -- exemption is inert for real clubs, and demo clubs stay off the public
  -- listings (MYK9-952); delete the is_demo arm below to remove it.
  -- can_accept_online_entry_payment's p_livemode has a DEFAULT false: always
  -- pass the platform's mode explicitly, or a live cutover would keep
  -- checking test-mode accounts.
  SELECT EXISTS (
           SELECT 1 FROM public.clubs c
            WHERE c.id = p_club_id AND c.is_demo IS TRUE
         )
      OR public.can_accept_online_entry_payment(
           p_club_id,
           (SELECT ps.stripe_livemode FROM public.platform_settings ps WHERE ps.id = true)
         );
$$;

COMMENT ON FUNCTION private.club_publish_payouts_ok(uuid) IS
  'MYK9-2163: true when a show of this club may become publicly visible as far as money goes: the club''s Stripe payouts are enabled in the platform''s mode (can_accept_online_entry_payment with platform_settings.stripe_livemode), or the club is a demo/test club (clubs.is_demo). The demo exemption applies to the publish gate only, never to checkout; it is inert for real clubs after the live cutover (MYK9-11) and is removed by deleting its is_demo arm. Called only by enforce_show_publish_gate (SECURITY DEFINER).';

-- Called only from enforce_show_publish_gate, which runs as its owner, so no
-- API role needs EXECUTE.
REVOKE ALL ON FUNCTION private.club_publish_payouts_ok(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.club_publish_payouts_ok(uuid) FROM anon;
REVOKE ALL ON FUNCTION private.club_publish_payouts_ok(uuid) FROM authenticated;

-- ---------------------------------------------------------------------------
-- 4. enforce_show_publish_gate (see header section 4)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_show_publish_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
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
  -- PostgREST request); a client cannot set this GUC itself.
  -- INVARIANT: service_role bypasses this gate; if publish ever moves behind
  -- an edge function (which runs as service_role), the gate must be
  -- restated there, not assumed inherited from this trigger.
  IF coalesce(current_setting('role', true), 'none') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- MYK9-2163: every show takes online entries, whatever its status. An API
  -- write may never create a row with them off or turn them off (directly or
  -- through set_show_online_entries). Turning them on, and a write that
  -- leaves an already-off legacy row off, pass here.
  IF (TG_OP = 'INSERT' AND NEW.online_entries_enabled IS NOT TRUE)
     OR (TG_OP = 'UPDATE' AND OLD.online_entries_enabled IS TRUE
         AND NEW.online_entries_enabled IS NOT TRUE) THEN
    -- Mirrors ONLINE_ENTRIES_ALWAYS_ON_MESSAGE (onlineEntryGate.ts) verbatim.
    RAISE EXCEPTION 'Every show takes online entries. This can''t be turned off.'
      USING ERRCODE = 'MK003';
  END IF;

  -- MYK9-979: the gated set is every PUBLICLY VISIBLE status
  -- (private.show_status_is_public), not only 'published'. A row that is not
  -- (or no longer) public is not gated past the check above: a draft may
  -- clear or reverse its window, turn online entries on, and be built in full
  -- before the club's payouts are enabled; moving a show back to draft always
  -- passes.
  IF NOT private.show_status_is_public(NEW.status) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND private.show_status_is_public(OLD.status) THEN
    -- An ALREADY-public show is never re-gated on its club, authorization or
    -- Stripe readiness, and never retroactively, with these exceptions.

    -- MYK9-2163: a public show always takes online entries. Turning them off
    -- is refused above; this catches a legacy public row that is already off
    -- (written outside the API roles) on any other watched edit.
    IF NEW.online_entries_enabled IS NOT TRUE THEN
      -- Mirrors ONLINE_ENTRIES_REQUIRED_MESSAGE (onlineEntryGate.ts) verbatim.
      RAISE EXCEPTION 'A published show always takes online entries. Turn online entries on, or keep this show as a draft.'
        USING ERRCODE = 'MK003';
    END IF;

    -- MYK9-979: turning online entries ON for a public show needs the same
    -- payouts publishing does, so the switch cannot be flipped after
    -- publishing to get round the gate. Only a row written outside the API
    -- roles can be public with it off (MYK9-2163 set every row on).
    v_turning_online_on := NEW.online_entries_enabled IS TRUE
                           AND OLD.online_entries_enabled IS NOT TRUE;
    IF v_turning_online_on THEN
      IF NEW.club_id IS NULL THEN
        -- Mirrors CLUB_REQUIRED_MESSAGE (onlineEntryGate.ts) verbatim.
        RAISE EXCEPTION 'Assign a club to this show before publishing. Entry fees are paid out to the club.'
          USING ERRCODE = 'MK003';
      END IF;
      IF NOT private.club_publish_payouts_ok(NEW.club_id) THEN
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

  -- MYK9-2163: the club's payouts are required whatever online_entries_enabled
  -- says (every public show takes online entries). Demo / test clubs are
  -- exempt inside the helper, until MYK9-11. A missing club_stripe_accounts
  -- row is refused by can_accept_online_entry_payment's own EXISTS check.
  IF NOT private.club_publish_payouts_ok(NEW.club_id) THEN
    -- Mirrors PUBLISH_BLOCKED_MESSAGE (onlineEntryGate.ts) verbatim.
    RAISE EXCEPTION 'This club''s payouts aren''t enabled yet, so the show can''t be published. A club admin connects the bank account on the club''s Payments tab. If Stripe is reviewing the account, that usually takes a day or two.'
      USING ERRCODE = 'MK003';
  END IF;

  -- MYK9-2163: refused, never silently flipped (header section 4c). Only a
  -- legacy off row reaches this: an INSERT with it off was refused above.
  IF NEW.online_entries_enabled IS NOT TRUE THEN
    -- Mirrors ONLINE_ENTRIES_REQUIRED_MESSAGE (onlineEntryGate.ts) verbatim.
    RAISE EXCEPTION 'A published show always takes online entries. Turn online entries on, or keep this show as a draft.'
      USING ERRCODE = 'MK003';
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

COMMENT ON FUNCTION public.enforce_show_publish_gate() IS
  'MYK9-579, extended by MYK9-716, MYK9-979 and MYK9-2163: server-side backstop for online entries (MYK9-2163: on ANY status, an INSERT with online_entries_enabled not true, or an UPDATE turning it from true to not true, is refused first, MK003, ONLINE_ENTRIES_ALWAYS_ON_MESSAGE) and for a show BECOMING PUBLICLY VISIBLE (private.show_status_is_public: published, upcoming, in_progress, completed, the shows_anon_select set). On an INSERT of a public row, or an UPDATE from a non-public status into a public one, refuses in order: a show with no club (MK003, CLUB_REQUIRED_MESSAGE); a club whose payouts are not enabled in the platform''s mode, whatever online_entries_enabled says, with demo clubs exempt (private.club_publish_payouts_ok; MK003, PUBLISH_BLOCKED_MESSAGE); online_entries_enabled not true (MK003, ONLINE_ENTRIES_REQUIRED_MESSAGE); a show with no entry window, or one whose entry_close_date is before its entry_open_date (MK005, ENTRY_WINDOW_REQUIRED_MESSAGE / ENTRY_WINDOW_ORDER_MESSAGE). On an ALREADY-public show it refuses online_entries_enabled not true (MK003, ONLINE_ENTRIES_REQUIRED_MESSAGE), re-checks the club and payouts only when online_entries_enabled turns false -> true (MK003, CLUB_REQUIRED_MESSAGE / ONLINE_ENTRIES_BLOCKED_MESSAGE), and re-checks the entry window only when a date changes (MK005, ENTRY_WINDOW_PUBLISHED_MESSAGE); never retroactive. A row that is not public is gated only by the online-entries check above. Fires on BEFORE INSERT OR UPDATE OF status, entry_open_date, entry_close_date, online_entries_enabled (trg_enforce_show_publish_gate). Carves out coalesce(current_setting(''role'', true), ''none'') NOT IN (''authenticated'', ''anon''): a direct superuser session and service_role both bypass. INVARIANT: if publish ever moves behind an edge function (service_role), the gate must be restated there. MYK9-572''s club-authorization refusal (MK004) is a separate trigger, trg_enforce_show_club_authorization, keyed on the same predicate, which fires first.';

-- Trigger-only function: nothing calls it directly. A trigger fires
-- regardless of EXECUTE privilege, so this is an explicit grant DECISION for
-- migrationGrantDecisionContract, not a functional requirement.
REVOKE ALL ON FUNCTION public.enforce_show_publish_gate() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_show_publish_gate() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_show_publish_gate() FROM authenticated;

-- ---------------------------------------------------------------------------
-- 5. create_show_with_children: online_entries_enabled is always true
--    (rebuilt from 20261028024100; see header section 5)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_show_with_children(p_show jsonb, p_trials jsonb, p_classes jsonb, p_judge_ids uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller_auth        uuid;
  v_club_id            uuid;
  v_show_id            uuid;
  v_trial              jsonb;
  v_class              jsonb;
  v_inserted_trial_ids uuid[] := ARRAY[]::uuid[];
  v_class_trial_id     uuid;
  v_class_judge_id     uuid;
  v_inserted_class_id  uuid;
  v_inserted_show_id   uuid;
  v_trial_id           uuid;
  v_inserted_trial_id  uuid;
  v_class_id           uuid;
  v_owner_club_id      uuid;
  v_owner_show_id      uuid;
  v_owner_trial_id     uuid;
  v_trial_timezone     text;
BEGIN
  v_caller_auth := auth.uid();
  IF v_caller_auth IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  v_club_id := (p_show->>'club_id')::uuid;
  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'p_show must include a non-null club_id'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.is_site_admin()
    OR public.is_club_admin(v_club_id)
    OR public.is_trial_secretary(v_club_id)
  ) THEN
    RAISE EXCEPTION 'not authorized to create shows for club %', v_club_id
      USING ERRCODE = '42501';
  END IF;

  v_show_id := (p_show->>'id')::uuid;
  IF v_show_id IS NULL THEN
    RAISE EXCEPTION 'p_show must include a non-null id'
      USING ERRCODE = '22023';
  END IF;

  IF p_judge_ids IS NOT NULL AND array_length(p_judge_ids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM unnest(p_judge_ids) AS j(judge_uuid)
      WHERE NOT EXISTS (SELECT 1 FROM public.people WHERE id = j.judge_uuid)
    ) THEN
      RAISE EXCEPTION 'one or more p_judge_ids do not exist in public.people'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.shows (
    id, name, organization, start_date, end_date, location, status,
    club_id, entry_open_date, entry_close_date, pre_entry_fee,
    day_of_show_fee, accept_check_payments, accept_cash_payments,
    style, latitude, longitude, junior_handler_fee, online_entries_enabled, updated_at
  ) VALUES (
    v_show_id,
    p_show->>'name',
    p_show->>'organization',
    (p_show->>'start_date')::date,
    (p_show->>'end_date')::date,
    NULLIF(p_show->>'location', ''),
    COALESCE(NULLIF(p_show->>'status', ''), 'draft'),
    v_club_id,
    NULLIF(p_show->>'entry_open_date', '')::date,
    NULLIF(p_show->>'entry_close_date', '')::date,
    NULLIF(p_show->>'pre_entry_fee', '')::numeric,
    NULLIF(p_show->>'day_of_show_fee', '')::numeric,
    (p_show->>'accept_check_payments')::boolean,
    (p_show->>'accept_cash_payments')::boolean,
    COALESCE(NULLIF(p_show->>'style', ''), 'monogram'),
    NULLIF(p_show->>'latitude', '')::double precision,
    NULLIF(p_show->>'longitude', '')::double precision,
    NULLIF(p_show->>'junior_handler_fee', '')::numeric,
    true,  -- MYK9-2163: always on; p_show.online_entries_enabled is ignored.
    NOW()
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO v_inserted_show_id;

  -- A NULL return means the id already existed. The authorization above proved
  -- the caller may create shows for v_club_id — it proved nothing about a show
  -- that some other club already owns, so re-check the stored owner.
  -- FOR UPDATE: hold the row so the owner cannot change before the children land.
  IF v_inserted_show_id IS NULL THEN
    SELECT club_id INTO v_owner_club_id
    FROM public.shows
    WHERE id = v_show_id
    FOR UPDATE;

    IF v_owner_club_id IS DISTINCT FROM v_club_id THEN
      RAISE EXCEPTION 'show % belongs to another club', v_show_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  FOR v_trial IN SELECT value FROM jsonb_array_elements(COALESCE(p_trials, '[]'::jsonb))
  LOOP
    v_trial_id := (v_trial->>'id')::uuid;

    -- Only a value pg_catalog recognises as a real IANA zone ever reaches the
    -- column; anything else (missing key, empty string, typo) falls through
    -- to the column's own 'America/New_York' DEFAULT, exactly like
    -- getTrialTimezone() falls back client-side for the same bad input.
    SELECT n.name INTO v_trial_timezone
    FROM public.timezone_names n
    WHERE n.name = NULLIF(v_trial->>'timezone', '');

    INSERT INTO public.trials (
      id, show_id, name, date, trial_number, status, trial_type,
      planned_start_time, event_number, display_order, category, registry_id,
      timezone, updated_at
    ) VALUES (
      v_trial_id,
      v_show_id,
      v_trial->>'name',
      (v_trial->>'date')::date,
      NULLIF(v_trial->>'trial_number', ''),
      COALESCE(NULLIF(v_trial->>'status', ''), 'upcoming'),
      NULLIF(v_trial->>'trial_type', ''),
      NULLIF(v_trial->>'planned_start_time', ''),
      NULLIF(v_trial->>'event_number', ''),
      NULLIF(v_trial->>'display_order', '')::int,
      NULLIF(v_trial->>'category', ''),
      COALESCE(NULLIF(v_trial->>'registry_id', ''), 'AKC'),
      COALESCE(v_trial_timezone, 'America/New_York'),
      NOW()
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id INTO v_inserted_trial_id;

    -- Same guard, one level down: a conflicting trial id that hangs off a
    -- different show would otherwise become a legal parent for p_classes.
    IF v_inserted_trial_id IS NULL THEN
      SELECT show_id INTO v_owner_show_id
      FROM public.trials
      WHERE id = v_trial_id
      FOR UPDATE;

      IF v_owner_show_id IS DISTINCT FROM v_show_id THEN
        RAISE EXCEPTION 'trial % belongs to another show', v_trial_id
          USING ERRCODE = '42501';
      END IF;
    END IF;

    v_inserted_trial_ids := array_append(v_inserted_trial_ids, v_trial_id);
  END LOOP;

  FOR v_class IN SELECT value FROM jsonb_array_elements(COALESCE(p_classes, '[]'::jsonb))
  LOOP
    v_class_trial_id := (v_class->>'trial_id')::uuid;
    v_class_id := (v_class->>'id')::uuid;

    IF NOT v_class_trial_id = ANY(v_inserted_trial_ids) THEN
      RAISE EXCEPTION 'class trial_id % is not part of this show creation request', v_class_trial_id
        USING ERRCODE = '22023';
    END IF;

    -- num_hides is listed explicitly so a NULL payload records "judge sets it"
    -- rather than silently taking the column's DEFAULT 1.
    INSERT INTO public.classes (
      id, trial_id, name, level, element, section, entry_fee,
      max_entries, status, start_time, timer_mode, hides_known,
      distraction_count, num_areas, num_hides, time_limit_seconds, updated_at
    ) VALUES (
      v_class_id,
      v_class_trial_id,
      v_class->>'name',
      NULLIF(v_class->>'level', ''),
      NULLIF(v_class->>'element', ''),
      NULLIF(v_class->>'section', ''),
      NULLIF(v_class->>'entry_fee', '')::numeric,
      NULLIF(v_class->>'max_entries', '')::int,
      COALESCE(NULLIF(v_class->>'status', ''), 'upcoming'),
      NULLIF(v_class->>'start_time', '')::time,
      NULLIF(v_class->>'timer_mode', ''),
      NULLIF(v_class->>'hides_known', '')::boolean,
      NULLIF(v_class->>'distraction_count', '')::int,
      NULLIF(v_class->>'num_areas', '')::int,
      NULLIF(v_class->>'num_hides', '')::int,
      NULLIF(v_class->>'time_limit_seconds', '')::int,
      NOW()
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id INTO v_inserted_class_id;

    -- A conflicting class id under a different trial is another club's row.
    -- Under the SAME trial it is an ordinary idempotent re-run, which falls
    -- through to the judge-assignment guard below and stays a no-op.
    IF v_inserted_class_id IS NULL THEN
      SELECT trial_id INTO v_owner_trial_id
      FROM public.classes
      WHERE id = v_class_id
      FOR UPDATE;

      IF v_owner_trial_id IS DISTINCT FROM v_class_trial_id THEN
        RAISE EXCEPTION 'class % belongs to another trial', v_class_id
          USING ERRCODE = '42501';
      END IF;
    END IF;

    -- Class-level judge assignment. Only when (a) the class was freshly inserted
    -- (v_inserted_class_id is NULL on an ON CONFLICT no-op, keeping re-runs of
    -- this atomic function idempotent) and (b) the wizard assigned a judge to
    -- this class. person_id is the real column; status 'confirmed' is what the
    -- dashboard treats as active (ACTIVE_ASSIGNMENT_STATUSES).
    v_class_judge_id := NULLIF(v_class->>'judge_id', '')::uuid;
    IF v_inserted_class_id IS NOT NULL AND v_class_judge_id IS NOT NULL THEN
      INSERT INTO public.judge_assignments (
        person_id, show_id, trial_id, class_id, status, confirmed_at,
        created_at, updated_at
      ) VALUES (
        v_class_judge_id, v_show_id, v_class_trial_id, v_inserted_class_id,
        'confirmed', NOW(), NOW(), NOW()
      );
    END IF;
  END LOOP;

  RETURN v_show_id;
END;
$function$;

COMMENT ON FUNCTION public.create_show_with_children(jsonb, jsonb, jsonb, uuid[]) IS
  'Atomically creates a show, trials (incl. registry_id derived from the show organization and a pg_timezone_names-validated timezone, MYK9-831), classes (incl. the rule-derived num_hides hide count), and CLASS-LEVEL judge assignments (one judge_assignments row per class that carries p_classes[].judge_id). Accepts p_show.style for premium experience style, p_show.junior_handler_fee (MYK9-662) and creates every show with online_entries_enabled true, ignoring p_show.online_entries_enabled (MYK9-2163; MYK9-979 used to read it). Every ON CONFLICT no-op re-checks the pre-existing row''s owner under FOR UPDATE and raises 42501 on cross-tenant id re-use (SA-2026-07-30-01).';

REVOKE ALL ON FUNCTION public.create_show_with_children(jsonb, jsonb, jsonb, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_show_with_children(jsonb, jsonb, jsonb, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_show_with_children(jsonb, jsonb, jsonb, uuid[]) TO authenticated, service_role;

COMMIT;
