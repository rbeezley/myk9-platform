-- =============================================================================
-- MYK9-2197: one list of what blocks a draft show from publishing, read by the
-- app (part B, MYK9-2198; home card, part C, MYK9-2199) and enforced by the
-- publish triggers. Part A, server.
--
-- Before this, "can this show publish?" was answered three times: inline in
-- enforce_show_club_authorization (club approved, MK004), inline in
-- enforce_show_publish_gate (payouts MK003, entry dates MK005), and by an
-- app-side mirror (onlineEntryGate.ts). There was no server rule for the
-- premium list at all. Now:
--
--   private.club_publish_blockers_for(club_id)   the two club lines
--   private.show_publish_blockers_for(shows row) the club lines plus premium
--                                                and entry dates, evaluated on
--                                                a ROW, so a BEFORE trigger can
--                                                pass NEW (the values about to
--                                                be saved) and the RPC can pass
--                                                the stored row
--
-- Both triggers and both RPCs read these two helpers and nothing else, so the
-- list and the refusals cannot disagree. Each line is
--   (key, waiting_on, eta, position)
-- and position is the order the refusals fire in, so the first line the RPC
-- returns is the refusal a publish UPDATE raises.
--
-- KEYS, who each waits on, and the code the trigger raises (existing codes and
-- message texts are unchanged; the premium line is new):
--   club_not_approved        myk9        MK004  about a day
--   payouts_not_enabled      club_admin  MK003  (stripe, a day or two, once a
--                                               bank account is submitted and
--                                               Stripe is reviewing it)
--   premium_not_published    secretary   MK003  NEW message, same style
--   entry_dates_missing      secretary   MK005
--   entry_dates_out_of_order secretary   MK005
--
-- PREMIUM RULE. Read from the database exactly as the app reads it
-- (premiumPublishState.isPremiumPublished): a premium is published when
-- shows.published_premium_url AND shows.published_premium_at are both
-- non-blank; a stale premium (edited after publishing) still counts. A club
-- that publishes its own premium list is exempt: shows.publishes_own_premium
-- (MYK9-1685, resolveShowUses' publishesOwnPremium; NOT NULL default false).
--
-- WHEN IT FIRES. Unchanged from before: a show BECOMING publicly visible
-- (INSERT of a public row, or UPDATE from a non-public status into one) runs
-- every line. An already-public show is never re-gated on club, payouts or
-- premium; it keeps the MYK9-716 rule that a CHANGE to its dates may not clear
-- or reverse the window, and the MYK9-979 rule that turning online entries ON
-- re-checks payouts. A show with no club (cannot exist since MYK9-1008) and a
-- legacy public row with online entries off keep their own inline refusals:
-- neither is a blocker line a person can act on from the list.
--
-- BYPASS UNCHANGED. Both triggers still apply only to `authenticated` and
-- `anon`; a direct superuser session and service_role bypass. Demo clubs
-- (clubs.is_demo) still count as payouts-enabled (private.club_publish_
-- payouts_ok) and are NOT exempt from approval or the premium.
--
-- RPCs (SECURITY DEFINER, search_path = '', authenticated only):
--   public.show_publish_blockers(p_show_id)  who can manage the show
--     (can_manage_show or site admin, exactly set_show_online_entries' rule)
--   public.club_publish_blockers(p_club_id)  the club lines, for a club admin,
--     club secretary or site admin (the roles that manage a club's shows)
-- Both return a jsonb array of {key, waiting_on, eta}; empty means nothing
-- blocks. Neither writes.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. The club lines
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.club_publish_blockers_for(p_club_id uuid)
RETURNS TABLE (key text, waiting_on text, eta text, "position" integer)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  -- A NULL club has no club lines (shows.club_id is NOT NULL; the gate keeps
  -- its own clubless refusal).
  SELECT 'club_not_approved'::text, 'myk9'::text, 'about a day'::text, 10
   WHERE p_club_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.clubs c
        WHERE c.id = p_club_id AND c.authorized_at IS NOT NULL
     )
  UNION ALL
  -- Payouts: private.club_publish_payouts_ok owns the rule (demo clubs
  -- exempt; the platform's Stripe mode). When a bank account was already
  -- submitted in that mode the wait is on Stripe's review, else on the club
  -- admin.
  SELECT 'payouts_not_enabled'::text,
         CASE WHEN EXISTS (
                SELECT 1 FROM public.club_stripe_accounts a
                 WHERE a.club_id = p_club_id
                   AND a.onboarding_complete IS TRUE
                   AND a.livemode IS NOT DISTINCT FROM
                       (SELECT ps.stripe_livemode FROM public.platform_settings ps WHERE ps.id = true)
              ) THEN 'stripe' ELSE 'club_admin' END,
         CASE WHEN EXISTS (
                SELECT 1 FROM public.club_stripe_accounts a
                 WHERE a.club_id = p_club_id
                   AND a.onboarding_complete IS TRUE
                   AND a.livemode IS NOT DISTINCT FROM
                       (SELECT ps.stripe_livemode FROM public.platform_settings ps WHERE ps.id = true)
              ) THEN 'a day or two' ELSE NULL END,
         20
   WHERE p_club_id IS NOT NULL
     AND NOT private.club_publish_payouts_ok(p_club_id);
$$;

COMMENT ON FUNCTION private.club_publish_blockers_for(uuid) IS
  'MYK9-2197: the club-level publish blockers (club_not_approved, payouts_not_enabled) as (key, waiting_on, eta, position) rows. The one source for enforce_show_club_authorization (MK004), enforce_show_publish_gate (payouts, MK003) and public.club_publish_blockers / public.show_publish_blockers. Payouts defer to private.club_publish_payouts_ok (demo clubs exempt). Called only by those SECURITY DEFINER functions.';

REVOKE ALL ON FUNCTION private.club_publish_blockers_for(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.club_publish_blockers_for(uuid) FROM anon;
REVOKE ALL ON FUNCTION private.club_publish_blockers_for(uuid) FROM authenticated;

-- ---------------------------------------------------------------------------
-- 2. The show lines, evaluated on a row
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.show_publish_blockers_for(p_show public.shows)
RETURNS TABLE (key text, waiting_on text, eta text, "position" integer)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT b.key, b.waiting_on, b.eta, b."position"
    FROM private.club_publish_blockers_for(p_show.club_id) b
  UNION ALL
  -- Premium published = url and at both non-blank (premiumPublishState.ts);
  -- a stale premium still counts. A club that publishes its own is exempt.
  SELECT 'premium_not_published'::text, 'secretary'::text, NULL::text, 30
   WHERE NOT coalesce(p_show.publishes_own_premium, false)
     AND NOT (nullif(btrim(p_show.published_premium_url), '') IS NOT NULL
              AND p_show.published_premium_at IS NOT NULL)
  UNION ALL
  SELECT 'entry_dates_missing'::text, 'secretary'::text, NULL::text, 40
   WHERE p_show.entry_open_date IS NULL OR p_show.entry_close_date IS NULL
  UNION ALL
  -- Calendar-day semantics, the UTC day (20260711190000, MYK9-716): equal
  -- days are a one-day window, not an error.
  SELECT 'entry_dates_out_of_order'::text, 'secretary'::text, NULL::text, 50
   WHERE p_show.entry_open_date IS NOT NULL AND p_show.entry_close_date IS NOT NULL
     AND (p_show.entry_open_date AT TIME ZONE 'UTC')::date
         > (p_show.entry_close_date AT TIME ZONE 'UTC')::date;
$$;

COMMENT ON FUNCTION private.show_publish_blockers_for(public.shows) IS
  'MYK9-2197: every blocker on publishing a show, evaluated on the row passed in (a trigger passes NEW, the RPC the stored row), ordered by position, which is the order the refusals fire in. Club lines come from private.club_publish_blockers_for; premium_not_published is exempt when shows.publishes_own_premium; entry dates use the UTC calendar day. Called only by the publish triggers and public.show_publish_blockers (SECURITY DEFINER).';

REVOKE ALL ON FUNCTION private.show_publish_blockers_for(public.shows) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.show_publish_blockers_for(public.shows) FROM anon;
REVOKE ALL ON FUNCTION private.show_publish_blockers_for(public.shows) FROM authenticated;

-- ---------------------------------------------------------------------------
-- 3. enforce_show_club_authorization (MK004), copied from its LATEST
--    definition (20261003221700, MYK9-979); only the approval check now reads
--    the helper.
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

  -- MYK9-2197: the approval question is the shared blocker list's.
  IF EXISTS (
    SELECT 1 FROM private.club_publish_blockers_for(NEW.club_id) b
     WHERE b.key = 'club_not_approved'
  ) THEN
    RAISE EXCEPTION 'This club hasn''t been authorized by myK9 yet. Shows can be built now and published once the club is approved.'
      USING ERRCODE = 'MK004';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_show_club_authorization() IS
  'MYK9-572, widened by MYK9-979, reads the shared blocker list in MYK9-2197: refuses (MK004) a show whose club is not approved (private.club_publish_blockers_for key club_not_approved: clubs.authorized_at null) at the moment it BECOMES PUBLICLY VISIBLE (private.show_status_is_public: INSERT of a public row, or UPDATE OF status from a non-public status into a public one). A show moving between two public statuses, or an already-public show, is never re-gated (never retroactive). Clubless shows step aside (enforce_show_publish_gate owns that MK003). Carves out every role except authenticated and anon. Fires before trg_enforce_show_publish_gate (name order), so MK004 keeps precedence over the MK003 refusals.';

REVOKE ALL ON FUNCTION public.enforce_show_club_authorization() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_show_club_authorization() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_show_club_authorization() FROM authenticated;

-- ---------------------------------------------------------------------------
-- 4. enforce_show_publish_gate, copied from its LATEST definition
--    (20261119051700, MYK9-2163). Every payouts / entry-date condition now
--    reads the shared blocker list; the clubless and online-entries refusals
--    stay inline. Messages and codes are unchanged, plus one new MK003 for
--    premium_not_published.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_show_publish_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_turning_online_on boolean;
  v_dates_changed boolean;
  v_keys text[];
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
    -- An ALREADY-public show is never re-gated on its club, authorization,
    -- Stripe readiness or premium, and never retroactively, with these
    -- exceptions.

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
    v_dates_changed := NEW.entry_open_date IS DISTINCT FROM OLD.entry_open_date
                       OR NEW.entry_close_date IS DISTINCT FROM OLD.entry_close_date;
    -- MYK9-2197: the blocker list is only read when one of its answers is
    -- needed, never on an ordinary edit of an already-public row.
    IF v_turning_online_on OR v_dates_changed THEN
      SELECT coalesce(array_agg(b.key ORDER BY b."position"), ARRAY[]::text[])
        INTO v_keys
        FROM private.show_publish_blockers_for(NEW) b;
    END IF;
    IF v_turning_online_on THEN
      IF NEW.club_id IS NULL THEN
        -- Mirrors CLUB_REQUIRED_MESSAGE (onlineEntryGate.ts) verbatim.
        RAISE EXCEPTION 'Assign a club to this show before publishing. Entry fees are paid out to the club.'
          USING ERRCODE = 'MK003';
      END IF;
      IF 'payouts_not_enabled' = ANY (v_keys) THEN
        -- Mirrors ONLINE_ENTRIES_BLOCKED_MESSAGE (onlineEntryGate.ts) verbatim.
        RAISE EXCEPTION 'Connect your club''s payment account before turning on online entries. Online entry fees need somewhere to go. Find it under My Club → Payments.'
          USING ERRCODE = 'MK003';
      END IF;
    END IF;

    -- MYK9-716: only a CHANGE to its entry window is checked, so an edit that
    -- re-sends unchanged dates (even a legacy row that never had a window)
    -- still passes.
    IF NOT v_dates_changed THEN
      RETURN NEW;
    END IF;
    IF 'entry_dates_missing' = ANY (v_keys)
       OR 'entry_dates_out_of_order' = ANY (v_keys) THEN
      -- Mirrors ENTRY_WINDOW_PUBLISHED_MESSAGE (onlineEntryGate.ts) verbatim.
      RAISE EXCEPTION 'A published show has to keep its entry window: both dates set, and the close on or after the open. Discard this change or fix the dates.'
        USING ERRCODE = 'MK005';
    END IF;
    RETURN NEW;
  END IF;

  -- The row BECOMES publicly visible here: an INSERT of a public row, or an
  -- UPDATE from a non-public status into a public one. Every check runs.
  -- MYK9-2197: the blocker list for the row as it is about to be saved. The
  -- RPC public.show_publish_blockers reads the same function, so the list and
  -- these refusals cannot disagree.
  SELECT coalesce(array_agg(b.key ORDER BY b."position"), ARRAY[]::text[])
    INTO v_keys
    FROM private.show_publish_blockers_for(NEW) b;

  IF NEW.club_id IS NULL THEN
    -- Mirrors CLUB_REQUIRED_MESSAGE (onlineEntryGate.ts) verbatim.
    RAISE EXCEPTION 'Assign a club to this show before publishing. Entry fees are paid out to the club.'
      USING ERRCODE = 'MK003';
  END IF;

  -- MYK9-2163: the club's payouts are required whatever online_entries_enabled
  -- says (every public show takes online entries). Demo / test clubs are
  -- exempt inside the helper, until MYK9-11. A missing club_stripe_accounts
  -- row is refused by can_accept_online_entry_payment's own EXISTS check.
  IF 'payouts_not_enabled' = ANY (v_keys) THEN
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

  -- MYK9-2197: exhibitors need the premium to enter, so it is published
  -- before the show is, unless the club publishes its own premium list.
  IF 'premium_not_published' = ANY (v_keys) THEN
    -- Mirrors PREMIUM_NOT_PUBLISHED_MESSAGE (onlineEntryGate.ts) verbatim.
    RAISE EXCEPTION 'Publish the premium list before publishing the show, or turn on "We publish our own premium list" in the show''s settings. Exhibitors need the premium to enter.'
      USING ERRCODE = 'MK003';
  END IF;

  -- MYK9-716: a draft may have no entry window; publishing requires one.
  -- Checked last so the club and Stripe refusals above keep their precedence.
  -- Mirrors ENTRY_WINDOW_REQUIRED_MESSAGE / ENTRY_WINDOW_ORDER_MESSAGE
  -- (onlineEntryGate.ts) verbatim.
  IF 'entry_dates_missing' = ANY (v_keys) THEN
    RAISE EXCEPTION 'Set the entry window before publishing. Exhibitors need to know when entries open and close.'
      USING ERRCODE = 'MK005';
  END IF;

  IF 'entry_dates_out_of_order' = ANY (v_keys) THEN
    RAISE EXCEPTION 'The entry window can''t close before it opens. Fix the entry dates, then publish.'
      USING ERRCODE = 'MK005';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_show_publish_gate() IS
  'MYK9-579, extended by MYK9-716, MYK9-979, MYK9-2163 and MYK9-2197: server-side backstop for online entries (on ANY status, an INSERT with online_entries_enabled not true, or an UPDATE turning it from true to not true, is refused first, MK003, ONLINE_ENTRIES_ALWAYS_ON_MESSAGE) and for a show BECOMING PUBLICLY VISIBLE (private.show_status_is_public). Every payouts / premium / entry-date condition reads private.show_publish_blockers_for(NEW), the same function public.show_publish_blockers returns, so the list and the refusals cannot disagree. On an INSERT of a public row, or an UPDATE from a non-public status into a public one, refuses in order: a show with no club (MK003, CLUB_REQUIRED_MESSAGE); payouts_not_enabled (MK003, PUBLISH_BLOCKED_MESSAGE; demo clubs exempt); online_entries_enabled not true (MK003, ONLINE_ENTRIES_REQUIRED_MESSAGE); premium_not_published (MK003, PREMIUM_NOT_PUBLISHED_MESSAGE; exempt when publishes_own_premium); entry_dates_missing / entry_dates_out_of_order (MK005, ENTRY_WINDOW_REQUIRED_MESSAGE / ENTRY_WINDOW_ORDER_MESSAGE). On an ALREADY-public show it refuses online_entries_enabled not true (MK003, ONLINE_ENTRIES_REQUIRED_MESSAGE), re-checks the club and payouts only when online_entries_enabled turns false -> true (MK003, CLUB_REQUIRED_MESSAGE / ONLINE_ENTRIES_BLOCKED_MESSAGE), and re-checks the entry window only when a date changes (MK005, ENTRY_WINDOW_PUBLISHED_MESSAGE); never retroactive, never on the premium. A row that is not public is gated only by the online-entries check above. Fires on BEFORE INSERT OR UPDATE OF status, entry_open_date, entry_close_date, online_entries_enabled (trg_enforce_show_publish_gate). Carves out coalesce(current_setting(''role'', true), ''none'') NOT IN (''authenticated'', ''anon''): a direct superuser session and service_role both bypass. INVARIANT: if publish ever moves behind an edge function (service_role), the gate must be restated there. MYK9-572''s club-approval refusal (MK004) is a separate trigger, trg_enforce_show_club_authorization, reading the same list (key club_not_approved), which fires first.';

REVOKE ALL ON FUNCTION public.enforce_show_publish_gate() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_show_publish_gate() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_show_publish_gate() FROM authenticated;

-- ---------------------------------------------------------------------------
-- 5. The RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.show_publish_blockers(p_show_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_show public.shows;
BEGIN
  IF p_show_id IS NULL THEN
    RAISE EXCEPTION 'p_show_id is required' USING ERRCODE = '22023';
  END IF;

  -- Exactly set_show_online_entries' rule (20261003221700): shows_update RLS
  -- plus site admin, which can_manage_show does not cover.
  IF NOT (public.can_manage_show(p_show_id) OR public.is_site_admin()) THEN
    RAISE EXCEPTION 'not authorized to read the publish blockers for show %', p_show_id
      USING ERRCODE = '42501';
  END IF;

  SELECT s.* INTO v_show
    FROM public.shows s
   WHERE s.id = p_show_id AND s.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'show % not found', p_show_id USING ERRCODE = 'P0002';
  END IF;

  -- A show that is already publicly visible has nothing blocking it: the gate
  -- never re-checks it (never retroactive), so the list is empty by design.
  IF private.show_status_is_public(v_show.status) THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN coalesce(
    (SELECT jsonb_agg(jsonb_build_object('key', b.key, 'waiting_on', b.waiting_on, 'eta', b.eta)
                      ORDER BY b."position")
       FROM private.show_publish_blockers_for(v_show) b),
    '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.show_publish_blockers(uuid) IS
  'MYK9-2197: what blocks this show from publishing, as a jsonb array of {key, waiting_on, eta} in refusal order (empty: nothing blocks, and always empty for a show that is already publicly visible). Keys: club_not_approved, payouts_not_enabled, premium_not_published, entry_dates_missing, entry_dates_out_of_order. Reads private.show_publish_blockers_for, the same function the publish triggers enforce, on the stored row. Authorized like set_show_online_entries (can_manage_show or site admin; 42501 otherwise; P0002 for a missing or soft-deleted show). Read-only.';

REVOKE ALL ON FUNCTION public.show_publish_blockers(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.show_publish_blockers(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.show_publish_blockers(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.show_publish_blockers(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.club_publish_blockers(p_club_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_club_id IS NULL THEN
    RAISE EXCEPTION 'p_club_id is required' USING ERRCODE = '22023';
  END IF;

  -- The roles that manage a club's shows (can_manage_show's club arms), plus
  -- site admin. is_club_admin / is_trial_secretary read a NULL as "any club",
  -- which the check above rules out.
  IF NOT (public.is_club_admin(p_club_id)
          OR public.is_trial_secretary(p_club_id)
          OR public.is_site_admin()) THEN
    RAISE EXCEPTION 'not authorized to read the publish blockers for club %', p_club_id
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clubs c WHERE c.id = p_club_id) THEN
    RAISE EXCEPTION 'club % not found', p_club_id USING ERRCODE = 'P0002';
  END IF;

  RETURN coalesce(
    (SELECT jsonb_agg(jsonb_build_object('key', b.key, 'waiting_on', b.waiting_on, 'eta', b.eta)
                      ORDER BY b."position")
       FROM private.club_publish_blockers_for(p_club_id) b),
    '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.club_publish_blockers(uuid) IS
  'MYK9-2197: the club-level lines of the publish blockers (club_not_approved, payouts_not_enabled) as a jsonb array of {key, waiting_on, eta}, for the home card. The same private.club_publish_blockers_for the triggers read. Authorized for a club admin, a club trial secretary or a site admin (42501 otherwise; P0002 for a missing club). Read-only.';

REVOKE ALL ON FUNCTION public.club_publish_blockers(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.club_publish_blockers(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.club_publish_blockers(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.club_publish_blockers(uuid) TO authenticated;
