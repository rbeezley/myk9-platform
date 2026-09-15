-- MYK9-572 — gate show publication and the public club directory on a new
-- clubs.authorized_at, closing the self-sustaining delegation tree: clubs_insert
-- (migration 160) lets any active secretary or club_admin create a club, and
-- trg_grant_club_admin_to_club_creator (20260511100000) immediately grants
-- them club_admin of it — a grant rooted in the creator's own appointment,
-- never in site admin. That tree is NOT closed here: the Show Creation
-- Wizard's "my club isn't listed" path must keep working with zero human
-- involvement, so clubs_insert and the auto-club_admin trigger are
-- deliberately left alone (see the COMMENT ON POLICY / COMMENT ON TRIGGER at
-- the bottom of this file). Instead the gate sits at the moment of PUBLIC
-- EXPOSURE: a club cannot open online entries (publish a show) or appear in
-- the public club directory until a site admin marks it authorized_at.
--
-- -- WHAT THIS DOES NOT DO -----------------------------------------------
-- It does not retroactively unpublish a show when a club's authorization is
-- revoked (matches the never-retroactive rule enforce_show_publish_gate
-- already established for Stripe readiness — see its own header). It does
-- not touch club creation, membership, or any existing role grant.
--
-- -- REPLICATION DECISION --------------------------------------------------
-- clubs is a replicated table (clubs_version_increment). ReplicatedClubsTable
-- .sync() pulls incrementally through the AUTHENTICATED (or anon, for a
-- signed-out guest) client (`supabase.from('clubs').select('*')
-- .gt('updated_at', since)`), so RLS applies to every pull — an offline
-- device can never receive a club row it is not allowed to see. But the
-- incremental pull only ever ADDS/UPDATES rows that are still visible; it has
-- no tombstone or deletion signal, so a club an offline client already cached
-- BEFORE it became unauthorized (or before the caller's own membership
-- lapsed) would otherwise stay in local storage, including in the public
-- club directory (BrowseClubsPage), until some other path clears it.
-- ReplicatedClubsTable.reconcileVisibility() closes this: after every
-- successful sync it fetches the complete live/visible id set
-- (`select('id')`, unpaginated — the clubs table is small) and removes any
-- locally-cached, non-dirty club not in that set, the same reconcile-against-
-- live-ids pattern ReplicatedDogsTable.reconcileDeleted() already uses for
-- soft-deleted dogs. A revoked club therefore drops out of a guest's cached
-- directory on their next sync, not only at the server.
--
-- This migration's backfill (`UPDATE public.clubs SET authorized_at = now()
-- WHERE authorized_at IS NULL`, below) fires clubs_version_increment and
-- update_clubs_updated_at on every existing row, so every replicated client
-- re-pulls the whole clubs table on its next incremental sync — benign, it
-- only propagates the new authorized_at/authorized_by columns.
--
-- -- READ-PATH AUDIT (clubs_select going from `true` to a predicate) --------
-- apps/myk9show/src/services/database/clubs/reads.ts — getAllClubs /
--   getClubById / searchClubsByLocation / getActiveClubs all read straight
--   PostgREST through the authenticated client; RLS silently filters an
--   unauthorized club out of list results (matches "hide from the public
--   directory" intent) and getClubById's `.single()` throws PGRST116 for a
--   caller who cannot see the row, which the existing try/catch already maps
--   to a normal `{ data: null, error }` result — no code change needed.
-- apps/myk9show/src/services/replication/ReplicatedClubsTable.ts — see the
--   REPLICATION DECISION above.
-- apps/myk9show/src/components/admin/permissions/ManageUserRolesDialog.tsx
--   and .../admin/users/BulkRoleDialog.tsx — both are site-admin-only
--   surfaces (reached only from admin pages already gated on is_site_admin);
--   the new predicate's `(SELECT public.is_site_admin())` arm means these
--   dialogs keep seeing every club, unauthorized or not, exactly as today.
-- supabase/functions/cron-process-payouts/index.ts — uses the service_role
--   key, which bypasses RLS entirely; unaffected.
-- PostgREST embeds (`club:clubs(...)`) in shows/reads.postgrest.ts,
--   shows/writes.ts, usePlatformPayoutLedger.ts, useAKCSubmissionData.ts,
--   role-requests/index.ts, RoleManager.ts — revocation is NEVER retroactive
--   (see WHAT THIS DOES NOT DO above): a club can lose authorized_at AFTER
--   already publishing a show, so "a show can never be published with an
--   unauthorized club" is true only at the moment of publish, not for the
--   life of the row. club_has_public_show() (section 3b below) closes this:
--   a club that hosts at least one non-deleted, publicly-visible show stays
--   in clubs_select regardless of its current authorization state, so the
--   embed on that show never nulls out for anon or an unrelated viewer.
--   A revoked club with ONLY drafts (never published, or since unpublished)
--   is the one case that DOES null out — correct, since no public row
--   depends on it being visible. showMappers.ts already reads every
--   club.* field through `?.` with a `''` fallback (mapShowRow's
--   clubName/clubAddress/clubEmail), so a null embed in that case renders
--   as an empty club name rather than crashing.
-- Show Creation Wizard's HostClubField / club picker — verified NOT anon:
--   it runs behind ProtectedRoute for a signed-in secretary, and that
--   secretary is club_admin of any club they just created (the
--   trg_grant_club_admin_to_club_creator trigger), so is_club_admin(clubs.id)
--   in the new predicate keeps their own just-created club visible to them
--   even before a site admin authorizes it.
--
-- clubs, club_members, people, and permission_audit_log all carry FORCE ROW
-- LEVEL SECURITY (021_force_rls_all_tables.sql, 086_security_sa016_force_rls.sql),
-- which applies RLS even to the table owner. Every SECURITY DEFINER helper
-- added or relied on below (is_club_member, club_has_public_show,
-- guard_club_authorization_write, set_club_authorization) still reads/writes
-- those tables freely because it runs as the function's OWNER (postgres),
-- and BYPASSRLS on that role — not a FORCE RLS exemption — is what lets it
-- see past the policies its caller could not.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. clubs.authorized_at / authorized_by
-- ---------------------------------------------------------------------------
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS authorized_at timestamptz,
  ADD COLUMN IF NOT EXISTS authorized_by uuid REFERENCES public.people(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.clubs.authorized_at IS
  'MYK9-572: null = not yet authorized by a site admin. Gates show publication (enforce_show_publish_gate, SQLSTATE MK004) and the public club directory (clubs_select). Set/cleared only by set_club_authorization(). Revoking (setting back to null) is deliberately never retroactive — it does not unpublish shows the club already published.';
COMMENT ON COLUMN public.clubs.authorized_by IS
  'MYK9-572: the site admin (people.id) who last called set_club_authorization() for this club, for either direction (authorize or revoke). Null alongside authorized_at when never authorized. NOT cleared on revoke — after a revoke, authorized_by still names the admin who last touched the row (most recently, whoever revoked it) even though authorized_at goes back to null; read it as "last actor", not "who authorized".';

-- All clubs that exist as of this migration are trusted — they predate the
-- authorization gate entirely, most were created by site admins or vetted
-- secretaries, and un-publishing/hiding them on upgrade would be a breaking
-- change with no security benefit (the gate is about NEW exposure going
-- forward, not retroactively distrusting the existing directory). Runs as
-- a plain postgres session (no SET ROLE), which the guard trigger added
-- below carves out anyway (current_setting('role', true) reads 'none') —
-- belt AND suspenders: the guard is also created AFTER this backfill so it
-- is not even attached yet when this UPDATE runs.
UPDATE public.clubs SET authorized_at = now() WHERE authorized_at IS NULL;

-- ---------------------------------------------------------------------------
-- 1b. guard_club_authorization_write(): authorized_at/authorized_by are
--     ordinary columns on a table BOTH secretaries (clubs_insert, migration
--     160) and club admins (clubs_update: is_platform_admin() OR
--     is_club_admin(clubs.id), no WITH CHECK) can otherwise write directly —
--     a club admin could PATCH { authorized_at: now() } on their own club,
--     and a secretary could INSERT a club with authorized_at already set.
--     set_club_authorization() (section 5 below) is meant to be the ONLY
--     write path; this trigger enforces that at the table, mirroring
--     trg_guard_platform_settings_write's own shape (20260615180000).
--
--     Carve-outs, in order:
--       (a) API-roles-only carve-out identical to enforce_show_publish_gate
--           (20260915221500's header) — a direct superuser session (no SET
--           ROLE, reads 'none') and service_role (edge functions, crons,
--           the seed script, supabase/tests/*.sql fixtures) both bypass.
--           This is also why the backfill above is safe even though this
--           trigger did not exist yet when it ran: it would have bypassed
--           regardless.
--       (b) set_club_authorization()'s own write: a transaction-local GUC
--           (myk9.club_authorization_write = 'on') that function sets
--           immediately before its UPDATE and clears immediately after —
--           the one sanctioned path through this trigger.
--     Everything else: an INSERT silently drops any client-supplied
--     authorized_at/authorized_by (a new club is never authorized on
--     creation — this does NOT raise, since clubs_insert is meant to keep
--     working with zero human involvement for the Show Creation Wizard's
--     "my club isn't listed" path); an UPDATE that touches either column
--     raises 42501.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_club_authorization_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF coalesce(current_setting('role', true), 'none') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF coalesce(current_setting('myk9.club_authorization_write', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.authorized_at := NULL;
    NEW.authorized_by := NULL;
    RETURN NEW;
  END IF;

  IF NEW.authorized_at IS DISTINCT FROM OLD.authorized_at
     OR NEW.authorized_by IS DISTINCT FROM OLD.authorized_by THEN
    RAISE EXCEPTION 'Club authorization is set only by a site admin'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_club_authorization_write() IS
  'MYK9-572: authorized_at/authorized_by are writable only through set_club_authorization(). clubs_update (is_platform_admin() OR is_club_admin(clubs.id), no WITH CHECK) and clubs_insert (any active secretary/club_admin) would otherwise let those roles set either column directly. Carve-outs: API-roles-only (mirrors enforce_show_publish_gate, 20260915221500) for direct superuser/service_role sessions, and the myk9.club_authorization_write transaction-local GUC that set_club_authorization() sets immediately before its UPDATE. Otherwise: INSERT silently nulls both columns (a new club is never pre-authorized); UPDATE changing either column raises 42501.';

DROP TRIGGER IF EXISTS trg_guard_club_authorization_write ON public.clubs;
CREATE TRIGGER trg_guard_club_authorization_write
  BEFORE INSERT OR UPDATE ON public.clubs
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_club_authorization_write();

REVOKE ALL ON FUNCTION public.guard_club_authorization_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_club_authorization_write() FROM anon;
REVOKE ALL ON FUNCTION public.guard_club_authorization_write() FROM authenticated;

-- ---------------------------------------------------------------------------
-- 2. enforce_show_publish_gate(): add the authorization check.
--    Copied verbatim from the LATEST migration that defines this function
--    (20260915221500_enforce_show_publish_gate.sql, MYK9-579 — BEFORE INSERT
--    OR UPDATE OF status, TG_OP branching, API-roles-only carve-out), with
--    one new check inserted in the SHARED section (after both TG_OP branches
--    rejoin) BEFORE the Stripe-readiness check and AFTER the club_id NULL
--    check, which must still run first — an authorization check needs a
--    club to check. The INSERT/UPDATE branch-specific early returns are
--    untouched, so this fires for both an INSERT that creates an
--    already-published row and an UPDATE transition INTO published.
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
  -- API-roles-only carve-out (see 20260915221500's header). This gate is a
  -- backstop for PostgREST/API callers only, so it applies exclusively to
  -- the roles a PostgREST request actually runs as (`authenticated`,
  -- `anon`). Everything else -- a direct superuser session with no SET ROLE
  -- ('none'), and `service_role` (edge functions, crons, the seed script,
  -- and every supabase/tests/*.sql fixture) -- bypasses it. Not reachable
  -- from any client path: SECURITY DEFINER changes the effective user this
  -- function body runs as, not current_setting('role', true), which always
  -- reflects the caller's own SET ROLE (the JWT-derived
  -- `authenticated`/`anon` for a PostgREST request) — a client cannot set
  -- this GUC itself. Mirrors trg_guard_platform_settings_write's own
  -- `service_role` carve-out (20260615180000), widened to the roles this
  -- gate needs to exempt.
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

  -- MYK9-572: a club must be authorized before it can open online entries at
  -- all, independent of its Stripe readiness. Distinct SQLSTATE (MK004) so
  -- the client can show a distinct message instead of the Stripe copy.
  -- Shared by both the INSERT and UPDATE branches above.
  IF NOT EXISTS (
    SELECT 1 FROM public.clubs c WHERE c.id = NEW.club_id AND c.authorized_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'This club hasn''t been authorized by myK9 yet. Shows can be built now and published once the club is approved.'
      USING ERRCODE = 'MK004';
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
  'MYK9-579/MYK9-572: server-side backstop for the draft->published gate. Mirrors publishGateError (ShowEditPanel.helpers.ts) and the inline check in ShowStatusPill.tsx exactly, including their copy. Refuses with SQLSTATE MK003 for a missing club or a not-Stripe-ready club (mapped client-side via isPublishGateDbError in onlineEntryGate.ts), and with MK004 when the club exists but is not yet authorized (clubs.authorized_at IS NULL, MYK9-572). Livemode is read from platform_settings.stripe_livemode. Fires on BEFORE INSERT OR UPDATE OF status, branching on TG_OP: INSERT gates any row created already-published (create_show_with_children and createShow() both let the caller set status); UPDATE gates only a transition INTO published and exempts an already-published show (OLD.status = published) so unrelated edits on a live show are never re-gated or retroactively un-published — this applies to BOTH refusal reasons: revoking a club''s authorization never un-publishes its existing shows. Carves out coalesce(current_setting(''role'', true), ''none'') NOT IN (''authenticated'', ''anon'') for direct superuser sessions, service_role (edge functions, crons, the seed script, supabase/tests/*.sql fixtures); unreachable from any client path (see 20260915221500 for the full carve-out rationale).';

-- Trigger definition (name/timing/columns) is unchanged from 20260915221500 —
-- CREATE OR REPLACE FUNCTION above is sufficient; no DROP/CREATE TRIGGER needed.

-- Re-state the grant decision for THIS file too (migrationGrantDecisionContract
-- reads every migration independently): still a trigger-only function, nothing
-- calls it directly.
REVOKE ALL ON FUNCTION public.enforce_show_publish_gate() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_show_publish_gate() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_show_publish_gate() FROM authenticated;

-- ---------------------------------------------------------------------------
-- 3. is_club_member(): SECURITY DEFINER membership check, mirroring
--    is_club_admin/is_trial_secretary's own shape (copied from the LATEST
--    migration that defines is_club_admin, 156_denormalize_auth_user_id_
--    into_user_roles.sql). Needed so clubs_select can check membership
--    WITHOUT referencing public.club_members directly in the policy
--    expression: Postgres ACL-checks every relation a policy's USING clause
--    names at executor start, regardless of OR short-circuiting, so a bare
--    `EXISTS (SELECT 1 FROM club_members ...)` 403s every anon SELECT on
--    clubs the moment anon lacks table-level SELECT on club_members — which
--    it deliberately does (club rosters are not public). Wrapping the same
--    check in a SECURITY DEFINER function sidesteps the caller-privilege ACL
--    check entirely (the function owner's privileges apply instead), the
--    same reason is_club_admin/is_trial_secretary/is_site_admin already
--    exist as functions rather than inline EXISTS clauses.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_club_member(check_club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members cm
    JOIN public.people p ON p.id = cm.person_id
    WHERE cm.club_id = check_club_id
      AND cm.membership_status = 'active'
      AND p.auth_user_id = (SELECT auth.uid())
  );
$$;

COMMENT ON FUNCTION public.is_club_member(uuid) IS
  'MYK9-572: true when the caller has an ACTIVE club_members row for check_club_id. person_id on club_members is a people.id, not auth.uid() — this joins through people.auth_user_id rather than comparing them directly (a prior draft of clubs_select compared cm.person_id = auth.uid() directly, which can never match). SECURITY DEFINER so clubs_select never needs table-level SELECT on club_members for anon/authenticated.';

REVOKE ALL ON FUNCTION public.is_club_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_club_member(uuid) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3b. club_has_public_show(): revocation is non-retroactive (see the header's
--     WHAT THIS DOES NOT DO), so a club that published a show BEFORE it was
--     revoked keeps that show live. Hiding the club from clubs_select in that
--     state would null out every club:clubs(...) embed on that still-public
--     show for anon/unrelated viewers (showMappers.ts already tolerates a
--     null embed, but a public show naming no club at all reads as broken,
--     not gated). Decision: a club that hosts a publicly visible show stays
--     visible. Status list and deleted_at column copied verbatim from the
--     LATEST migration that defines shows_select (20260823190000) — keep
--     these in sync if that policy's status list ever changes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.club_has_public_show(check_club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shows s
    WHERE s.club_id = check_club_id
      AND s.deleted_at IS NULL
      AND s.status = ANY (ARRAY['published'::text, 'upcoming'::text, 'in_progress'::text, 'completed'::text])
  );
$$;

COMMENT ON FUNCTION public.club_has_public_show(uuid) IS
  'MYK9-572: true when check_club_id has at least one non-deleted show in a publicly-visible status (mirrors shows_select''s own status list, 20260823190000). Used by clubs_select so revoking a club''s authorization never hides a show it already published — the club stays visible wherever the show is. SECURITY DEFINER so clubs_select never needs table-level SELECT on shows for anon/authenticated beyond what shows_select itself already grants.';

REVOKE ALL ON FUNCTION public.club_has_public_show(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.club_has_public_show(uuid) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. clubs_select: hide unauthorized clubs from the public directory, but
--    keep them visible to a site admin, the club's own admin(s)/secretary,
--    any ACTIVE club_members row for that club (mirrors club_members_select's
--    own membership check, 053_club_members_officers.sql, via is_club_member()
--    rather than a raw club_members EXISTS — see that function's own comment
--    for why), and a club that hosts at least one publicly-visible show
--    (club_has_public_show(), see 3b above — revocation is never retroactive).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "clubs_select" ON public.clubs;

CREATE POLICY "clubs_select" ON public.clubs
  FOR SELECT USING (
    authorized_at IS NOT NULL
    OR (SELECT public.is_site_admin())
    OR public.is_club_admin(id)
    OR public.is_trial_secretary(id)
    OR public.is_club_member(id)
    OR public.club_has_public_show(id)
  );

COMMENT ON POLICY clubs_select ON public.clubs IS
  'MYK9-572: public once authorized_at IS NOT NULL (superseding the prior "deliberately public" comment from MYK9-93 / 20260725150000), OR once it hosts a publicly-visible show even after a later revoke (club_has_public_show — revocation only ever blocks NEW publishes, see enforce_show_publish_gate''s never-retroactive rule). A site admin, the club''s own club_admin/secretary, or an active club_members row for that club can always see it regardless of authorization state — the creator of a brand-new unauthorized club is covered by is_club_admin(id) via trg_grant_club_admin_to_club_creator (20260511100000). is_site_admin() stays wrapped in a scalar subquery (InitPlan — cached once per statement, it takes no argument); the per-row functions are called bare because they are correlated on clubs.id and vary per row, so wrapping them buys no caching.';

-- authorized_by (the site admin's own people.id) has NO column-level REVOKE
-- from anon: anon already holds TABLE-level SELECT on clubs (needed for the
-- public-directory rows above), and a column-level REVOKE cannot narrow a
-- broader table-level GRANT — Postgres accepts it silently as a no-op (see
-- the Grant Never Narrows lesson), and attempting real column allowlisting
-- here would 403 every anon `select=*` on clubs, which is the shape
-- BrowseClubsPage actually issues (see the Postgrest Count Column trap).
-- authorized_by is therefore readable wherever the row itself is: an opaque
-- people.id, not a name or any other PII, exposed only for rows already
-- visible under the policy above.

-- ---------------------------------------------------------------------------
-- 5. set_club_authorization(): the one write path for authorized_at/_by.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_club_authorization(
  p_club_id uuid,
  p_authorized boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_person_id uuid;
  v_current_authorized_at timestamptz;
BEGIN
  IF NOT public.is_site_admin() THEN
    RAISE EXCEPTION 'Only site admins can authorize or revoke a club'
      USING ERRCODE = '42501';
  END IF;

  SELECT authorized_at INTO v_current_authorized_at
  FROM public.clubs
  WHERE id = p_club_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Club % not found', p_club_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent: already in the requested state (double-click, retry after a
  -- slow network response, two site admins acting at once). Return early —
  -- no authorized_at/authorized_by churn (a repeat "authorize" must not stamp
  -- a fresh now() over the original authorization time or reassign
  -- authorized_by to whoever merely repeated the call) and no duplicate
  -- permission_audit_log row for the same action.
  IF (p_authorized AND v_current_authorized_at IS NOT NULL)
     OR (NOT p_authorized AND v_current_authorized_at IS NULL) THEN
    RETURN;
  END IF;

  SELECT id INTO v_actor_person_id
  FROM public.people
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  -- The one sanctioned path through guard_club_authorization_write()
  -- (section 1b above): open the GUC only for the duration of this UPDATE,
  -- then close it immediately — `true` (transaction-local, per set_config's
  -- own is_local argument) means it also clears automatically at COMMIT or
  -- ROLLBACK even if this function raised between the two calls.
  PERFORM set_config('myk9.club_authorization_write', 'on', true);

  UPDATE public.clubs
  SET authorized_at = CASE WHEN p_authorized THEN now() ELSE NULL END,
      authorized_by = v_actor_person_id
  WHERE id = p_club_id;

  PERFORM set_config('myk9.club_authorization_write', '', true);

  INSERT INTO public.permission_audit_log (
    user_id,
    action,
    target_type,
    target_id,
    new_value
  )
  VALUES (
    v_actor_person_id,
    CASE WHEN p_authorized THEN 'club_authorized' ELSE 'club_authorization_revoked' END,
    'club',
    p_club_id,
    jsonb_build_object('club_id', p_club_id, 'authorized', p_authorized)
  );
END;
$$;

COMMENT ON FUNCTION public.set_club_authorization(uuid, boolean) IS
  'MYK9-572: the only write path for clubs.authorized_at/_by. Site-admin only (restates is_site_admin(), does not rely on clubs_update RLS). Idempotent: a call that would not change authorized_at''s null-ness (already authorized and asked to authorize, or already unauthorized and asked to revoke) returns immediately with no column churn and no audit row. Revoking never unpublishes the club''s existing shows — enforce_show_publish_gate only fires on a transition INTO published. Writes a permission_audit_log row for both directions (except the idempotent no-op case above).';

REVOKE ALL ON FUNCTION public.set_club_authorization(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_club_authorization(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_club_authorization(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Document the deliberate exposure the READ-PATH AUDIT above relies on:
--    clubs_insert and the auto-club_admin trigger stay exactly as they are.
-- ---------------------------------------------------------------------------
COMMENT ON POLICY clubs_insert ON public.clubs IS
  'RATIONALE (MYK9-572): the argument-less is_trial_secretary()/is_club_admin() calls are tolerated on purpose — any existing secretary may create a club so the Show Creation Wizard''s "my club isn''t listed" path needs no human in the loop. Exposure is gated at publication (enforce_show_publish_gate, authorized_at) and at the public directory (clubs_select), not at creation.';

COMMENT ON TRIGGER trg_grant_club_admin_to_club_creator ON public.clubs IS
  'RATIONALE (MYK9-572): granting the creator club_admin of a club they just made is tolerated on purpose — it is what lets the Show Creation Wizard''s "my club isn''t listed" path work with no human in the loop. Exposure is gated at publication (enforce_show_publish_gate, authorized_at) and at the public directory (clubs_select), not at creation or at this grant.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verify against the APPLIED database, never the migration text:
--
--   select authorized_at, authorized_by from public.clubs limit 5;
--
--   select polname, pg_get_expr(polqual, polrelid)
--   from pg_policy where polrelid = 'public.clubs'::regclass and polname = 'clubs_select';
--
--   select proname, prosecdef from pg_proc where proname = 'set_club_authorization';
