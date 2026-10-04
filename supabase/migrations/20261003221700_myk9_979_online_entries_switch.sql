-- =============================================================================
-- MYK9-979 — per-show "Online entries" switch; publish needs Stripe payouts
-- only when online entries are on; close the Upcoming / In Progress bypass.
--
-- Owner decision (2026-10-03): a club with no Stripe account (TDTC, Oct 10,
-- check and cash only) must still be able to publish its premium through
-- myK9. Exhibitors then see the premium and mail in their entries.
--
-- 1. COLUMN. shows.online_entries_enabled boolean NOT NULL DEFAULT false.
--    Default false: a new show takes no online entries until the secretary
--    turns them on, so no show can ever collect card payments it has nowhere
--    to pay out. GRANTS: public.shows carries no column-level ACLs (verified
--    on live 2026-10-03: pg_attribute.attacl is empty for every column) and
--    its table-level grants are anon=r, authenticated=arwd, service_role=all.
--    A new column inherits those table grants, which is what this column
--    needs: anon reads it (the public show page hides "Enter this show" when
--    it is false) and the show's managers write it through shows_update RLS.
--    No GRANT/REVOKE statement is therefore needed or added. No view selects
--    `shows.*` (the six views that depend on shows list their columns), so no
--    view widens.
--
-- 2. BACKFILL, so nothing that works today changes. Every show whose club
--    CURRENTLY passes can_accept_online_entry_payment(club_id,
--    platform_settings.stripe_livemode) gets true; every other show keeps
--    false. Justification: for a Stripe-ready club, today's behavior is
--    "publishing opens online entries", so a published show keeps them and a
--    draft keeps the expectation that publishing opens them. For a club that
--    is NOT Stripe-ready, stripe-checkout already refuses card payment today,
--    so false only makes the public page truthful. Read-only queries on live,
--    2026-10-03 (platform stripe_livemode = false), before this migration:
--      true  (club Stripe-ready): Heartland Scent Work Classic (published),
--            Heartland UKC Nosework Trial (published), Heartland Scent Work
--            Week (published, soft-deleted), Heartland ASCA Scent Detection
--            Trial (draft), ZZ MYK9-640 1790440309 (draft, soft-deleted),
--            ZZ Rehearsal 2026-09-26 UKC Nosework (draft, soft-deleted).
--      false (club not Stripe-ready): Prairie Trail Spring Scent Work Trial
--            (published; entry window closed 2026-07-20), Darboshea Tervuren
--            Nosework Club (draft), WALK TEST UKC nosework (draft), ZZ TEST
--            MYK9-819 Oct 10 UKC Nosework (draft, soft-deleted).
--    The UPDATE writes EVERY row (true or false) and bumps updated_at (and,
--    through shows_version_increment, version), because replicas pull shows
--    on updated_at > watermark: a row left at the DEFAULT would never re-sync
--    and a cached copy would carry no value. It runs as the migration role,
--    which the publish gate's API-roles-only carve-out skips. Realtime emits
--    one shows UPDATE per row (10 rows on live), the same as any show edit.
--
-- 3. ONE TRANSITION RULE: "this row becomes publicly visible". The anon read
--    policy shows_anon_select (live, 2026-10-03) exposes a non-deleted show
--    whose status is published, upcoming, in_progress or completed; both
--    gates used to fire only on 'published', so the Edit panel's Status
--    dropdown could move a draft to Upcoming or In Progress with no club
--    authorization, no Stripe and no entry window. private.show_status_is_public
--    is now the ONE place the gates read that set, and both trigger functions
--    key on it:
--      * enforce_show_club_authorization (MK004) — runs on INSERT of a public
--        row and on UPDATE from a non-public status into a public one.
--      * enforce_show_publish_gate (MK003 / MK005) — same transition; checks,
--        in order: club set (MK003), Stripe payouts ONLY when
--        online_entries_enabled (MK003), entry window set and ordered (MK005).
--      The two functions stay separate triggers so MK004 still fires first
--      (trigger names sort trg_enforce_show_club_authorization first), keeping
--      today's precedence: no club (MK003) / unauthorized (MK004) / no Stripe
--      (MK003) / no window (MK005).
--    A show that is ALREADY public (any public status) is never re-gated on
--    its club, authorization or Stripe, and never retroactively, with two
--    exceptions, both on UPDATE:
--      * a change to its entry window must leave a valid window (MK005, the
--        MYK9-716 rule, now for every public status, not only 'published');
--      * turning online_entries_enabled false -> true requires the club set
--        (MK003) and Stripe payouts (MK003, ONLINE_ENTRIES_BLOCKED_MESSAGE),
--        so the switch cannot be flipped after publishing to get round the
--        gate.
--    The trigger therefore also fires on UPDATE OF online_entries_enabled.
--    Moving between two public statuses (published -> upcoming, upcoming ->
--    published) is not a transition into public and is not re-gated.
--    The API-roles-only carve-out is unchanged: only `authenticated` and
--    `anon` are gated; service_role and a direct superuser session bypass.
--
-- 4. SERVER-SIDE REFUSAL OF ONLINE ENTRIES when the switch is off.
--    Exhibitors write entries only through submit_show_entries (entries
--    INSERT RLS requires can_manage_show) and the card path (stripe-checkout
--    edge function, then the webhook as service_role). submit_show_entries
--    now refuses a NON-official caller (42501) when online_entries_enabled is
--    false; officials (site admin, show secretary, club admin) are unaffected,
--    so mail-in / show-desk entry keeps working. stripe-checkout gets the
--    matching refusal in its own code (needs a function deploy).
--    submit_show_entries is rebuilt from
--    20260930214300_myk9_878_junior_handler_fee_pricing.sql, the LATEST
--    migration defining it (`grep -l 'CREATE OR REPLACE FUNCTION
--    public.submit_show_entries' supabase/migrations/ | sort | tail -1`).
--    Edits versus that body: the v_online_entries local, its SELECT column,
--    and the refusal block after the entry-close guard. Nothing else.
--
-- 4b. set_show_online_entries(p_show_id, p_enabled): the switch's only write
--    path, an online-only SECURITY DEFINER RPC that updates that one column
--    (section 3d). Generic client show writes never carry the column.
--
-- 5. create_show_with_children reads p_show.online_entries_enabled (absent or
--    null -> false). Rebuilt from 20260929233100, the LATEST migration
--    defining it; the only differences are that column/value and the COMMENT.
--
-- Function bodies of the two gates are copied from the LATEST migrations that
-- define them (enforce_show_publish_gate: 20260925023700;
-- enforce_show_club_authorization: 20260916004500) and compared with live
-- pg_get_functiondef on 2026-10-03 before editing.
--
-- Behavioral coverage (CI-only): supabase/tests/myk9_979_online_entries_switch_test.sql.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Column
-- ---------------------------------------------------------------------------
ALTER TABLE public.shows
  ADD COLUMN IF NOT EXISTS online_entries_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.shows.online_entries_enabled IS
  'MYK9-979: true when exhibitors may enter this show online (cart / card checkout / exhibitor submit_show_entries). Off: the public page shows the premium with a mail-in note and no Enter button, and both online paths refuse server-side; staff entry (organizer / show desk) is unaffected. Publishing (becoming publicly visible) requires the club''s Stripe payouts only when this is true, and turning it on for an already-public show requires them too (enforce_show_publish_gate).';

-- ---------------------------------------------------------------------------
-- 2. Backfill (see header §2)
-- ---------------------------------------------------------------------------
-- EVERY row is written, false as well as true (Codex P2 on #2707): a replica
-- pulls shows incrementally on updated_at > watermark, so a row left at the
-- column DEFAULT would never re-sync and its cached copy would keep no value
-- at all. update_shows_updated_at sets updated_at = now() on this UPDATE
-- (premium_publish_version is unchanged, so its WHEN holds) and
-- shows_version_increment bumps version; updated_at is also set explicitly so
-- the bump does not depend on that WHEN clause. now() is the transaction
-- start, later than any watermark a client already holds. The publish gate
-- cannot fire here: this runs as the migration role (outside its API-role
-- carve-out) and before the trigger is recreated to watch this column.
-- Soft-deleted rows are included: the replica never reads them, and setting
-- their value keeps every row explicit.
UPDATE public.shows s
   SET online_entries_enabled = (
         s.club_id IS NOT NULL
         AND public.can_accept_online_entry_payment(
               s.club_id,
               (SELECT ps.stripe_livemode FROM public.platform_settings ps WHERE ps.id = true)
             )
       ),
       updated_at = now();

-- ---------------------------------------------------------------------------
-- 3a. The one "publicly visible status" predicate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.show_status_is_public(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  -- Mirrors shows_anon_select's status list (live, 2026-10-03). NULL is not
  -- public. supabase/tests/myk9_979_online_entries_switch_test.sql compares
  -- this list against the applied policy, so a policy change fails CI.
  SELECT p_status IS NOT NULL
     AND p_status = ANY (ARRAY['published'::text, 'upcoming'::text, 'in_progress'::text, 'completed'::text]);
$$;

COMMENT ON FUNCTION private.show_status_is_public(text) IS
  'MYK9-979: true for the shows.status values shows_anon_select makes publicly visible (published, upcoming, in_progress, completed). The one status list the publish gates (enforce_show_publish_gate, enforce_show_club_authorization) key on: a row becomes public when this goes false -> true.';

REVOKE ALL ON FUNCTION private.show_status_is_public(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.show_status_is_public(text) FROM anon;
REVOKE ALL ON FUNCTION private.show_status_is_public(text) FROM authenticated;

-- ---------------------------------------------------------------------------
-- 3b. enforce_show_club_authorization (MK004): keyed on becoming public
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_show_club_authorization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- API-roles-only carve-out, identical in shape to
  -- enforce_show_publish_gate's (20260915221500's header has the full
  -- rationale): a direct superuser session (no SET ROLE, reads 'none') and
  -- service_role (edge functions, crons, the seed script, every
  -- supabase/tests/*.sql fixture) both bypass. Only the two roles
  -- PostgREST actually runs requests as are gated.
  IF coalesce(current_setting('role', true), 'none') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- MYK9-979: gated on BECOMING PUBLICLY VISIBLE (private.show_status_is_public),
  -- not only on 'published': upcoming / in_progress / completed are public too.
  IF NOT private.show_status_is_public(NEW.status) THEN
    RETURN NEW;
  END IF;
  -- UPDATE OF status between two public statuses is not a transition into
  -- public. An already-public show keeps saving unrelated edits without
  -- being re-gated.
  IF TG_OP = 'UPDATE' AND private.show_status_is_public(OLD.status) THEN
    RETURN NEW;
  END IF;

  -- The clubless refusal (MK003) belongs to enforce_show_publish_gate — do
  -- not duplicate its message or SQLSTATE here. A show with no club has
  -- nothing for this trigger to check, so it simply steps aside.
  IF NEW.club_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clubs c WHERE c.id = NEW.club_id AND c.authorized_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'This club hasn''t been authorized by myK9 yet. Shows can be built now and published once the club is approved.'
      USING ERRCODE = 'MK004';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_show_club_authorization() IS
  'MYK9-572, widened by MYK9-979: refuses (MK004) a show whose club has no authorized_at at the moment it BECOMES PUBLICLY VISIBLE (private.show_status_is_public: INSERT of a public row, or UPDATE OF status from a non-public status into a public one — published, upcoming, in_progress or completed). A show moving between two public statuses, or an already-public show, is never re-gated (never retroactive). Clubless shows step aside (enforce_show_publish_gate owns that MK003). Carves out every role except authenticated and anon. Fires before trg_enforce_show_publish_gate (name order), so MK004 keeps precedence over the Stripe MK003.';

REVOKE ALL ON FUNCTION public.enforce_show_club_authorization() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_show_club_authorization() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_show_club_authorization() FROM authenticated;

-- ---------------------------------------------------------------------------
-- 3c. enforce_show_publish_gate (MK003 / MK005)
-- ---------------------------------------------------------------------------
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
        RAISE EXCEPTION 'Assign a club to this show before publishing — entry fees are paid out to the club.'
          USING ERRCODE = 'MK003';
      END IF;
      SELECT stripe_livemode INTO v_livemode FROM public.platform_settings WHERE id = true;
      IF NOT public.can_accept_online_entry_payment(NEW.club_id, v_livemode) THEN
        -- Mirrors ONLINE_ENTRIES_BLOCKED_MESSAGE (onlineEntryGate.ts) verbatim.
        RAISE EXCEPTION 'Connect your club''s payment account before turning on online entries — online entry fees need somewhere to go. Find it under My Club → Payments.'
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
    RAISE EXCEPTION 'Assign a club to this show before publishing — entry fees are paid out to the club.'
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
      RAISE EXCEPTION 'Connect your club''s payment account before publishing — online entry fees need somewhere to go. Find it under My Club → Payments.'
        USING ERRCODE = 'MK003';
    END IF;
  END IF;

  -- MYK9-716: a draft may have no entry window; publishing requires one.
  -- Checked last so the club and Stripe refusals above keep their precedence.
  -- Mirrors ENTRY_WINDOW_REQUIRED_MESSAGE / ENTRY_WINDOW_ORDER_MESSAGE
  -- (onlineEntryGate.ts) verbatim.
  IF NEW.entry_open_date IS NULL OR NEW.entry_close_date IS NULL THEN
    RAISE EXCEPTION 'Set the entry window before publishing — exhibitors need to know when entries open and close.'
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
  'MYK9-579, extended by MYK9-716 and MYK9-979: server-side backstop for a show BECOMING PUBLICLY VISIBLE (private.show_status_is_public: published, upcoming, in_progress, completed — the shows_anon_select set). On an INSERT of a public row, or an UPDATE from a non-public status into a public one, refuses in order: a show with no club (MK003, CLUB_REQUIRED_MESSAGE); when online_entries_enabled is true only, a club with no payouts-enabled Stripe account in the platform''s mode, read from platform_settings.stripe_livemode (MK003, PUBLISH_BLOCKED_MESSAGE); a show with no entry window, or one whose entry_close_date is before its entry_open_date (MK005, ENTRY_WINDOW_REQUIRED_MESSAGE / ENTRY_WINDOW_ORDER_MESSAGE). On an ALREADY-public show it never re-checks the club or Stripe except when online_entries_enabled turns false -> true (MK003, CLUB_REQUIRED_MESSAGE / ONLINE_ENTRIES_BLOCKED_MESSAGE), and re-checks the entry window only when a date changes (MK005, ENTRY_WINDOW_PUBLISHED_MESSAGE); never retroactive. A row that is not public is never gated. Fires on BEFORE INSERT OR UPDATE OF status, entry_open_date, entry_close_date, online_entries_enabled (trg_enforce_show_publish_gate). Carves out coalesce(current_setting(''role'', true), ''none'') NOT IN (''authenticated'', ''anon'') — a direct superuser session and service_role both bypass. INVARIANT: if publish ever moves behind an edge function (service_role), the gate must be restated there. MYK9-572''s club-authorization refusal (MK004) is a separate trigger, trg_enforce_show_club_authorization, keyed on the same predicate, which fires first.';

DROP TRIGGER IF EXISTS trg_enforce_show_publish_gate ON public.shows;
CREATE TRIGGER trg_enforce_show_publish_gate
  BEFORE INSERT OR UPDATE OF status, entry_open_date, entry_close_date, online_entries_enabled ON public.shows
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_show_publish_gate();

-- Trigger-only function: nothing calls it directly. A trigger fires
-- regardless of EXECUTE privilege, so this is an explicit grant DECISION for
-- migrationGrantDecisionContract, not a functional requirement.
REVOKE ALL ON FUNCTION public.enforce_show_publish_gate() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_show_publish_gate() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_show_publish_gate() FROM authenticated;

-- ---------------------------------------------------------------------------
-- 3d. set_show_online_entries: the ONE write path for the switch
--     (Codex round 4 on #2707). The switch is an online-only server action,
--     never a field on a generic (replicated, full-row) show write: a queued
--     full-row UPDATE can be rebuilt on a stale token and would carry every
--     other column with it. This writes online_entries_enabled and nothing
--     else; update_shows_updated_at / shows_version_increment bump the row so
--     replicas re-pull it. Authorized exactly like shows_update RLS (club
--     admin / club trial secretary via can_manage_show, plus site admin,
--     which can_manage_show does not cover). The publish gate still fires
--     (UPDATE OF online_entries_enabled, caller role stays authenticated
--     inside SECURITY DEFINER), so turning it on for a public show without
--     Stripe payouts raises MK003 to the caller.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_show_online_entries(p_show_id uuid, p_enabled boolean)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_version integer;
BEGIN
  IF p_show_id IS NULL OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'p_show_id and p_enabled are required' USING ERRCODE = '22023';
  END IF;

  IF NOT (public.can_manage_show(p_show_id) OR public.is_site_admin()) THEN
    RAISE EXCEPTION 'not authorized to change online entries for show %', p_show_id
      USING ERRCODE = '42501';
  END IF;

  -- RETURNING reads the row after the BEFORE triggers ran, so this is the
  -- bumped version replicas will see; the client holds its confirmed value
  -- until its replica row reaches it (useOnlineEntriesSwitch).
  UPDATE public.shows
     SET online_entries_enabled = p_enabled
   WHERE id = p_show_id
     AND deleted_at IS NULL
  RETURNING version INTO v_version;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'show % not found', p_show_id USING ERRCODE = 'P0002';
  END IF;

  RETURN v_version;
END;
$$;

COMMENT ON FUNCTION public.set_show_online_entries(uuid, boolean) IS
  'MYK9-979: sets shows.online_entries_enabled for one non-deleted show and nothing else, and returns the row''s new version. Callers: the show edit panel''s self-saving switch (useOnlineEntriesSwitch), online only. Authorized like shows_update (can_manage_show or site admin; 42501 otherwise). enforce_show_publish_gate still applies: turning it on for a public show without the club''s Stripe payouts raises MK003.';

REVOKE ALL ON FUNCTION public.set_show_online_entries(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_show_online_entries(uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.set_show_online_entries(uuid, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_show_online_entries(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. submit_show_entries: refuse exhibitor entries when online entries are off
--    (rebuilt from 20260930214300; see header §4)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_show_entries(p_show_id uuid, p_registration_id uuid, p_entries jsonb, p_submission_id uuid, p_payment_method text, p_payment jsonb DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_entry              jsonb;
  v_dog_id             uuid;
  v_class_id           uuid;
  v_handler_name       text;
  v_handler_person_id  uuid;
  v_dog_owner_id       uuid;
  v_caller_person_id   uuid;
  v_exhibitor_profile_id uuid;
  v_client_cents       int;
  v_junior_override    boolean;
  v_priced             record;
  v_submission_source  text;
  v_entry_status       text;

  -- timestamptz, NOT date: `shows.start_date` is a timestamptz stored at
  -- midnight UTC, and assigning it into a `date` casts through the session
  -- TimeZone. The UTC calendar date is the value every other reader of this
  -- column uses, so take it explicitly below instead of inheriting a GUC.
  v_show_start    timestamptz;
  v_server_fee    numeric;
  v_server_cents  int;

  v_show_club_id  uuid;
  v_show_open     timestamptz;
  v_show_close    timestamptz;
  v_show_tz       text;
  v_is_official   boolean;
  v_is_day_of_show boolean;
  v_online_entries boolean;

  v_trial_id      uuid;
  v_class_status  text;
  v_class_name    text;
  v_trial_name    text;
  v_class_running boolean;
  v_class_label   text;
  v_entry_id      uuid;
  v_capacity      record;
  v_entry_pairs   jsonb[] := '{}';
  v_outcomes      jsonb[] := '{}';

  v_result        jsonb;

  -- MYK9-677: the money received with this submission.
  v_created_cents   int := 0;
  v_pay_method      text;
  v_pay_received_on date;
BEGIN
  SELECT s.start_date, s.club_id,
         s.entry_open_date, s.entry_close_date, s.online_entries_enabled,
         COALESCE(
           (SELECT t.timezone
              FROM public.trials t
             WHERE t.show_id = s.id
             ORDER BY t.date NULLS LAST, t.id
             LIMIT 1),
           'America/New_York'
         )
  INTO   v_show_start, v_show_club_id,
         v_show_open, v_show_close, v_online_entries, v_show_tz
  FROM   public.shows s
  WHERE  s.id = p_show_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'show % not found', p_show_id
      USING ERRCODE = '22023';
  END IF;

  -- MYK9-642 round 1. `trials.timezone` is plain text with no CHECK, so a bad
  -- value is storable, and `AT TIME ZONE <bad>` raises 22023 rather than
  -- degrading. The COALESCE above only covers NULL. Resolve the zone against
  -- pg_timezone_names ONCE, here, so every expression below -- the entry-open
  -- and entry-close guards as well as the day-of rule -- is given a zone Postgres
  -- recognizes. Without it the two sides disagreed about what a malformed zone
  -- means: the client's `getTrialTimezone` (features/registries/helpers.ts)
  -- degrades and reports to Sentry, while this function aborted the whole
  -- submission at the desk.
  --
  -- The two are now closer but NOT identical, deliberately recorded rather than
  -- over-claimed: this match is case-sensitive and exact, while `AT TIME ZONE`
  -- and the client's `Intl.DateTimeFormat` both accept a differently-cased name
  -- (and `AT TIME ZONE` also accepts abbreviations like 'EDT'). So a stored
  -- 'america/chicago' would work before this line and falls back after it. No
  -- live row is affected -- `public.trials.timezone` holds only 'America/Chicago'
  -- (13) and 'America/New_York' (6), both exact -- and an exact IANA name is the
  -- only thing the app ever writes. Widen to `lower(n.name) = lower(v_show_tz)`
  -- if that ever stops being true.
  v_show_tz := COALESCE(
    (SELECT n.name FROM pg_catalog.pg_timezone_names n WHERE n.name = v_show_tz),
    'America/New_York'
  );

  v_is_official := (
    public.is_site_admin()
    OR public.is_show_secretary(p_show_id)
    OR public.is_club_admin(v_show_club_id)
  );

  SELECT p.id INTO v_caller_person_id
  FROM public.people p
  WHERE p.auth_user_id = auth.uid();

  SELECT ep.id
  INTO v_exhibitor_profile_id
  FROM public.enrollments en
  JOIN public.exhibitor_profiles ep ON ep.person_id = en.handler_id
  WHERE en.id = p_registration_id
    AND en.show_id = p_show_id
    AND (v_is_official OR en.handler_id = v_caller_person_id)
  LIMIT 1;

  IF NOT v_is_official AND v_exhibitor_profile_id IS NULL THEN
    RAISE EXCEPTION 'registration % does not belong to the caller', p_registration_id
      USING ERRCODE = '42501';
  END IF;

  -- MYK9-677 (Codex round 10). The check above ties the enrollment to this show
  -- only for an exhibitor; an official of show A could pass an enrollment of
  -- show B and have A's entries (and, with p_payment, money) written onto it.
  -- Every write below touches this enrollment, so it must be THIS show's, for
  -- everyone. Locked here, before any write, so it cannot move under us.
  IF p_registration_id IS NOT NULL THEN
    PERFORM 1 FROM public.enrollments en
     WHERE en.id = p_registration_id AND en.show_id = p_show_id
       FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'registration % is not an enrollment on show %', p_registration_id, p_show_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('entrysubmission:' || p_submission_id::text));

  SELECT es.result INTO v_result
  FROM public.entry_submissions es
  WHERE es.id = p_submission_id;

  IF FOUND THEN
    IF v_result->>'registration_id' IS DISTINCT FROM p_registration_id::text THEN
      RAISE EXCEPTION 'submission % belongs to another registration', p_submission_id
        USING ERRCODE = '42501';
    END IF;
    RETURN v_result;
  END IF;

  IF NOT v_is_official
     AND v_show_open IS NOT NULL
     AND (now() AT TIME ZONE v_show_tz)::date < (v_show_open AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'entry period has not opened for show %', p_show_id
      USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_official
     AND v_show_close IS NOT NULL
     AND (now() AT TIME ZONE v_show_tz)::date > (v_show_close AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'entry period has closed for show %', p_show_id
      USING ERRCODE = '42501';
  END IF;

  -- MYK9-979: a show with online entries off takes no exhibitor (self-service)
  -- entries at all; exhibitors mail theirs in. Officials (site admin, show
  -- secretary, club admin) are exempt on the same v_is_official predicate as
  -- the window guards above, so mail-in and show-desk entry keep working.
  -- IS NOT TRUE: fail closed on anything but an explicit true.
  IF NOT v_is_official AND v_online_entries IS NOT TRUE THEN
    RAISE EXCEPTION 'online entries are not open for show %', p_show_id
      USING ERRCODE = '42501';
  END IF;

  IF p_payment_method IN ('waived', 'secretary_paid', 'group_payment') AND NOT v_is_official THEN
    RAISE EXCEPTION 'unauthorized payment method: % requires secretary or admin role', p_payment_method
      USING ERRCODE = '42501';
  END IF;

  -- MYK9-677: money already received, recorded in the payments ledger in THIS
  -- transaction, so entries and payment commit or fail together. The record
  -- predicate is the ledger's own (restated: SECURITY DEFINER drops RLS), and
  -- the method must be the one the entries are written with.
  IF p_payment IS NOT NULL THEN
    IF NOT private.can_record_show_payment(p_show_id) THEN
      RAISE EXCEPTION 'not authorized to record payments for show %', p_show_id
        USING ERRCODE = '42501';
    END IF;
    v_pay_method := p_payment->>'method';
    IF v_pay_method IS NULL OR v_pay_method NOT IN ('cash', 'check')
       OR v_pay_method IS DISTINCT FROM p_payment_method THEN
      RAISE EXCEPTION 'a received payment is cash or check, matching the entries (got %, entries %)',
        v_pay_method, p_payment_method USING ERRCODE = '22023';
    END IF;
    IF p_registration_id IS NULL THEN
      RAISE EXCEPTION 'a received payment needs an enrollment' USING ERRCODE = '22023';
    END IF;
    v_pay_received_on := NULLIF(p_payment->>'received_on', '')::date;
  END IF;

  -- MYK9-642. ONE rule, evaluated once per submission so every entry in the
  -- same call lands in the same registry bucket even if the clock crosses
  -- midnight mid-loop. See the header for the rulebook citations and for why
  -- this is the entry-close deadline rather than the fee's old start-date test.
  --
  -- Placed HERE, after the replay short-circuit, so a submission that was
  -- already recorded returns its cached result without re-deriving anything.
  -- It is deliberately NOT relied on for timezone safety: the entry-open and
  -- entry-close guards above are `NOT v_is_official`-gated, so for an official
  -- this would be the FIRST `AT TIME ZONE v_show_tz` in the function and moving
  -- it below them buys nothing. The zone is validated against pg_timezone_names
  -- where it is read instead, which is what actually makes a bad value safe --
  -- for the exhibitor guards too, which never had that protection.
  v_is_day_of_show := (
    (
      v_show_close IS NOT NULL
      AND (now() AT TIME ZONE v_show_tz)::date > (v_show_close AT TIME ZONE 'UTC')::date
    )
    OR (
      v_show_start IS NOT NULL
      AND (now() AT TIME ZONE v_show_tz)::date >= (v_show_start AT TIME ZONE 'UTC')::date
    )
  );

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    v_dog_id       := (v_entry->>'dog_id')::uuid;
    v_class_id     := (v_entry->>'class_id')::uuid;
    v_handler_name := v_entry->>'handler_name';
    v_handler_person_id := NULLIF(v_entry->>'handler_id', '')::uuid;
    v_client_cents := (v_entry->>'client_fee_cents')::int;
    -- MYK9-878: optional, default false, so older clients behave as before.
    -- Only a show secretary / site admin may set it (private.price_entry_fee
    -- raises 42501 for anyone else).
    v_junior_override := COALESCE((v_entry->>'junior_fee_override')::boolean, false);
    v_submission_source := COALESCE(
      NULLIF(v_entry->>'submission_source', ''),
      CASE WHEN v_is_official THEN 'organizer' ELSE 'self_service' END
    );

    IF v_submission_source NOT IN ('self_service', 'organizer', 'show_desk') THEN
      RAISE EXCEPTION 'invalid submission source: %', v_submission_source
        USING ERRCODE = '22023';
    END IF;

    IF v_submission_source IN ('organizer', 'show_desk') AND NOT v_is_official THEN
      RAISE EXCEPTION 'submission source % requires a show official', v_submission_source
        USING ERRCODE = '42501';
    END IF;

    IF v_handler_person_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.people p WHERE p.id = v_handler_person_id
    ) THEN
      RAISE EXCEPTION 'handler % not found', v_handler_person_id
        USING ERRCODE = '22023';
    END IF;

    IF NOT v_is_official AND v_handler_person_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.dogs d
      WHERE d.id = v_dog_id
        AND v_handler_person_id IN (d.owner_id, d.co_owner_id)
    ) THEN
      RAISE EXCEPTION 'caller cannot assign handler % for dog %', v_handler_person_id, v_dog_id
        USING ERRCODE = '42501';
    END IF;

    -- MYK9-824: a typed handler with no person match must never fall back to
    -- whoever is AT THE KEYBOARD. For a show official taking a mail-in or desk
    -- entry on someone else's behalf, that is staff, not a party to the entry
    -- -- defaulting to them silently reattributed the dog to the secretary
    -- (MYK9-819 dress rehearsal). Default to the dog's OWNER instead, which is
    -- also NULL-safe: `dogs.owner_id` is nullable, and a dog with no owner on
    -- file simply leaves `entries.handler_id` unset, which is what the
    -- acceptance criteria (and MYK9-665's decision to leave `handler_id` alone
    -- rather than invent a person) both call for.
    --
    -- The non-official branch is UNCHANGED: an exhibitor submitting their own
    -- entry with no explicit handler already has `v_caller_person_id` proven
    -- to equal the dog's owner by the ownership guard a few lines below, so
    -- this fallback was never the bug for that caller.
    IF v_handler_person_id IS NULL THEN
      IF v_is_official THEN
        SELECT d.owner_id INTO v_dog_owner_id FROM public.dogs d WHERE d.id = v_dog_id;
        v_handler_person_id := v_dog_owner_id;
      ELSE
        v_handler_person_id := v_caller_person_id;
      END IF;
    END IF;

    -- MYK9-841: staff keying an entry ON BEHALF of someone else is the
    -- reviewer, so the entry is accepted here instead of landing in her own
    -- review lane. Decided from v_is_official (the same caller-manages-the-
    -- show check every other staff-only branch above uses) plus dog
    -- OWNERSHIP -- not the resolved handler. A secretary can key HER OWN
    -- dog with an alternate handler as the handler_id (e.g. entering a dog
    -- she shows for someone else on paper); that is still her own entry,
    -- not one she is reviewing for someone else, so comparing
    -- v_handler_person_id to v_caller_person_id wrongly auto-accepted it.
    -- "Own" is dogs.owner_id = v_caller_person_id, the SAME rule the
    -- self-service authorization check below this loop uses (there via a
    -- people/auth.uid() join to the same owner_id column) -- deliberately
    -- NOT co_owner_id (Codex round 2, P1: an earlier revision of this
    -- classification counted co-owners too, so the two ownership rules in
    -- this function disagreed about what "own dog" means):
    --   - v_is_official = false                          -> exhibitor
    --     self-entry, unchanged ('submitted').
    --   - v_is_official = true, caller owns the dog       -> staff entering
    --     THEIR OWN dog, unchanged ('submitted') -- she is not reviewing
    --     herself, whoever the handler is.
    --   - v_is_official = true, caller does not own the
    --     dog                                             -> on-behalf-of,
    --     auto-accepted ('confirmed').
    -- Never derived from any client-supplied field.
    v_entry_status := CASE
      WHEN v_is_official AND NOT EXISTS (
        SELECT 1 FROM public.dogs d
        WHERE d.id = v_dog_id
          AND d.owner_id = v_caller_person_id
      )
        THEN 'confirmed'
      ELSE 'submitted'
    END;

    IF NOT v_is_official AND NOT EXISTS (
      SELECT 1
      FROM public.dogs d
      JOIN public.people p ON p.id = d.owner_id
      WHERE d.id = v_dog_id
        AND p.auth_user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'caller does not own dog %', v_dog_id
        USING ERRCODE = '42501';
    END IF;

    SELECT t.id, c.status, c.name, t.name
    INTO   v_trial_id, v_class_status, v_class_name, v_trial_name
    FROM   public.classes c
    JOIN   public.trials t ON t.id = c.trial_id
    WHERE  c.id = v_class_id
      AND  t.show_id = p_show_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'class % does not belong to show %', v_class_id, p_show_id
        USING ERRCODE = '22023';
    END IF;

    -- MYK9-516. Entry close is a DATE guard (entry_close_date, above). A class's
    -- own status is a separate axis: on show day the judge starts running a
    -- class and its status moves to 'in_progress', then 'completed', while the
    -- close date may still be days away. Without this the wizard could commit an
    -- entry into a ring that is already running -- a refund and a secretary
    -- phone call, on the money path.
    --
    -- Officials are exempt, on the same v_is_official predicate the entry-open,
    -- entry-close and payment-method guards already use: a secretary taking a
    -- gate entry for a class in the ring is the normal late-entry case. (Product
    -- rule assumed pending Richard's confirmation -- recorded on MYK9-516.)
    --
    -- ERRCODE 42501 matches the sibling non-official guards in this function, so
    -- PostgREST answers 403 and the RAISE message -- not a generic one -- is
    -- what the wizard shows: `submitShowEntries` wraps the PostgREST error with
    -- `createDatabaseError`, which keeps `message`, and `submitPaymentStep`
    -- toasts `getErrorMessage(error)`. The message is therefore exhibitor-facing
    -- prose, deliberately, and is asserted verbatim by
    -- supabase/tests/submit_entries_started_class_test.sql.
    -- Which class, in words. One stale cart line otherwise fails the whole
    -- submission with a message naming nothing, and the exhibitor has to guess
    -- which of five chips to remove.
    v_class_label := COALESCE(NULLIF(v_class_name, ''), 'This class')
      || COALESCE(' (' || NULLIF(v_trial_name, '') || ')', '');

    -- `classes.status` LAGS. `refresh_class_scoring_state` writes 'in_progress'
    -- only once the first score lands, so from the moment dogs are in the ring
    -- until somebody scores one the column still reads 'upcoming' -- the exact
    -- window an exhibitor is most likely to be entering a class being judged.
    -- Ringside never trusts the column alone either (`getEffectiveClassStatus`
    -- derives it from `is_in_ring` and scoring state), so neither does this.
    --
    -- The scored predicate is `is_scored = true`, copied from the LATEST
    -- definition of public.refresh_class_scoring_state
    -- (20260904160000_exclude_absent_entries_from_class_rollup.sql), not invented
    -- here: two notions of "this class has been scored" would drift.
    SELECT EXISTS (
      SELECT 1
      FROM   public.entries e
      WHERE  e.class_id = v_class_id
        AND  e.deleted_at IS NULL
        AND  (e.is_in_ring IS TRUE OR e.is_scored IS TRUE)
    )
    INTO v_class_running;

    -- No NOT v_is_official here, deliberately. A cancelled class is not running
    -- late, it is not happening: no ring, no judge, no paperwork. The official
    -- carve-out below exists for a desk entry into a class that IS running and
    -- has nothing to offer here, so nobody may buy an entry into a cancelled
    -- class. (Assumed product rule, recorded on MYK9-516 with the other one.)
    IF v_class_status = 'cancelled' THEN
      RAISE EXCEPTION 'This class was cancelled, so it can no longer be entered: %', v_class_label
        USING ERRCODE = '42501';
    END IF;

    IF NOT v_is_official AND (v_class_status = 'in_progress' OR v_class_running) THEN
      RAISE EXCEPTION 'This class has already started, so it can no longer be entered online. Contact the show secretary about a late entry: %', v_class_label
        USING ERRCODE = '42501';
    END IF;

    IF NOT v_is_official AND v_class_status = 'completed' THEN
      RAISE EXCEPTION 'This class has finished, so it can no longer be entered: %', v_class_label
        USING ERRCODE = '42501';
    END IF;

    -- MYK9-878: the fee comes from the ONE pricing function (the day-of /
    -- pre-entry / class fee chain that used to live here moved into it
    -- verbatim, with its comments). It also decides whether this entry is
    -- charged the show's junior handler fee; see the header.
    SELECT * INTO v_priced
      FROM private.price_entry_fee(
        p_show_id, v_class_id, v_is_day_of_show, v_junior_override
      );
    v_server_fee := v_priced.fee;

    v_server_cents := ROUND(v_server_fee * 100)::int;
    IF v_client_cents IS NOT NULL AND v_client_cents < v_server_cents THEN
      RAISE EXCEPTION 'fee mismatch: client sent % cents, server requires % cents',
        v_client_cents, v_server_cents
        USING ERRCODE = '22023';
    END IF;

    SELECT *
    INTO v_capacity
    FROM public.evaluate_entry_capacity(
      v_class_id,
      v_dog_id,
      v_exhibitor_profile_id,
      v_handler_person_id,
      v_submission_source,
      v_is_official
    );

    IF v_capacity.outcome = 'waitlisted' THEN
      v_outcomes := array_append(v_outcomes, jsonb_build_object(
        'dog_id', v_dog_id,
        'class_id', v_class_id,
        'outcome', 'waitlisted',
        'entry_id', NULL,
        'waitlist_entry_id', v_capacity.waitlist_entry_id,
        'waitlist_position', v_capacity.waitlist_position,
        'fee_cents', 0,
        'capacity_override', false,
        'denial_reason', NULL
      ));
      CONTINUE;
    END IF;

    IF v_capacity.outcome = 'denied' THEN
      v_outcomes := array_append(v_outcomes, jsonb_build_object(
        'dog_id', v_dog_id,
        'class_id', v_class_id,
        'outcome', 'denied',
        'entry_id', NULL,
        'waitlist_entry_id', NULL,
        'waitlist_position', NULL,
        'fee_cents', 0,
        'capacity_override', false,
        'denial_reason', v_capacity.denial_reason
      ));
      CONTINUE;
    END IF;

    INSERT INTO public.entries (
      show_id,
      trial_id,
      class_id,
      dog_id,
      handler,
      handler_id,
      entry_fee,
      entry_status,
      payment_status,
      payment_method,
      submitted_at,
      registration_id,
      capacity_override,
      is_day_of_show,
      junior_fee_override_by
    )
    VALUES (
      p_show_id,
      v_trial_id,
      v_class_id,
      v_dog_id,
      v_handler_name,
      v_handler_person_id,
      v_server_fee,
      v_entry_status,
      CASE
        WHEN p_payment_method IN ('secretary_paid', 'group_payment') THEN 'paid'
        WHEN p_payment_method IN ('waived') THEN 'waived'
        ELSE 'pending'
      END,
      p_payment_method,
      now(),
      p_registration_id,
      COALESCE(v_capacity.capacity_override, false),
      v_is_day_of_show,
      CASE WHEN v_junior_override AND v_priced.junior_fee_applied THEN v_caller_person_id END
    )
    RETURNING id INTO v_entry_id;
    v_created_cents := v_created_cents + v_server_cents;

    v_entry_pairs := array_append(v_entry_pairs,
      jsonb_build_object('entry_id', v_entry_id, 'dog_id', v_dog_id));
    v_outcomes := array_append(v_outcomes, jsonb_build_object(
      'dog_id', v_dog_id,
      'class_id', v_class_id,
      'outcome', 'created',
      'entry_id', v_entry_id,
      'waitlist_entry_id', NULL,
      'waitlist_position', NULL,
      'fee_cents', v_server_cents,
      'junior_fee_applied', v_priced.junior_fee_applied,
      'capacity_override', COALESCE(v_capacity.capacity_override, false),
      'denial_reason', NULL
    ));
  END LOOP;

  -- MYK9-677: the created entries' server fees are the amount received. The
  -- enrollment total grows by them here (the client no longer writes it on
  -- this path), then the ledger core records the payment and moves paid_amount
  -- and payment_status once. Keyed on the submission id, so the replay branch
  -- above (which returns the stored result before reaching this) and a direct
  -- retry of the key can never record it twice.
  IF p_payment IS NOT NULL AND v_created_cents > 0 THEN
    UPDATE public.enrollments
       SET total_amount = COALESCE(total_amount, 0) + v_created_cents,
           payment_method = v_pay_method,
           updated_at = now()
     WHERE id = p_registration_id;

    PERFORM private.record_enrollment_payment_core(
      p_registration_id, 'payment', v_created_cents / 100.0, v_pay_method, v_pay_received_on,
      NULLIF(btrim(p_payment->>'reference'), ''), NULL, p_submission_id
    );
  END IF;

  v_result := jsonb_build_object(
    'entries', to_jsonb(v_entry_pairs),
    'outcomes', to_jsonb(v_outcomes),
    'registration_id', p_registration_id,
    'submission_id', p_submission_id
  );

  INSERT INTO public.entry_submissions (id, result)
  VALUES (p_submission_id, v_result);

  RETURN v_result;
END;
$function$;

-- Explicit role decisions, restating the LIVE grants rather than inventing them
-- (matches 20260926214700_myk9_824_submit_entries_handler_defaults_to_owner.sql,
-- which last set them for this signature). CREATE OR REPLACE preserves
-- privileges, so these are a no-op against the current database and exist so
-- the grant decision is recorded with the definition.
REVOKE ALL ON FUNCTION public.submit_show_entries(uuid, uuid, jsonb, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_show_entries(uuid, uuid, jsonb, uuid, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_show_entries(uuid, uuid, jsonb, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_show_entries(uuid, uuid, jsonb, uuid, text, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. create_show_with_children: write online_entries_enabled
--    (rebuilt from 20260929233100; see header §5)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_show_with_children(
  p_show      jsonb,
  p_trials    jsonb,
  p_classes   jsonb,
  p_judge_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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
    COALESCE(NULLIF(p_show->>'online_entries_enabled', '')::boolean, false),
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
    FROM pg_catalog.pg_timezone_names n
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
$$;

-- Show creation is a secretary/club-admin action; anon must never execute it.
-- Stated explicitly (not just via PUBLIC) per the migration grant-decision contract.
REVOKE ALL ON FUNCTION public.create_show_with_children(jsonb, jsonb, jsonb, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_show_with_children(jsonb, jsonb, jsonb, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_show_with_children(jsonb, jsonb, jsonb, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.create_show_with_children(jsonb, jsonb, jsonb, uuid[]) IS
  'Atomically creates a show, trials (incl. registry_id derived from the show organization and a pg_timezone_names-validated timezone, MYK9-831), classes (incl. the rule-derived num_hides hide count), and CLASS-LEVEL judge assignments (one judge_assignments row per class that carries p_classes[].judge_id). Accepts p_show.style for premium experience style, p_show.junior_handler_fee (MYK9-662) and p_show.online_entries_enabled (MYK9-979; absent or null -> false). Every ON CONFLICT no-op re-checks the pre-existing row''s owner under FOR UPDATE and raises 42501 on cross-tenant id re-use (SA-2026-07-30-01).';

COMMIT;

-- Verify against the APPLIED database, never the migration text:
--
--   select pg_get_triggerdef(oid) from pg_trigger
--   where tgrelid = 'public.shows'::regclass and tgname = 'trg_enforce_show_publish_gate';
--   -- expect: BEFORE INSERT OR UPDATE OF status, entry_open_date, entry_close_date, online_entries_enabled
--
--   select id, name, status, online_entries_enabled from public.shows order by status, name;
--   -- expect true exactly for the rows listed in header §2
--
--   select a.attname, unnest(a.attacl)::text from pg_attribute a
--   where a.attrelid = 'public.shows'::regclass and a.attacl is not null;
--   -- expect: no rows (table-level grants only)
