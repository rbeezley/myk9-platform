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
--       (c) round 4 (P3-1): the `authorized_by` FK's ON DELETE SET NULL
--           action — deleting the site admin who authorized a club fires
--           this trigger as a referential-integrity side effect, under
--           whatever role GUC the DELETE's caller happens to hold (not
--           necessarily carve-out (a)'s API roles). That is not a
--           disguised authorization write: it only ever NULLs
--           authorized_by while leaving authorized_at untouched, so it is
--           permitted when NEW.authorized_by IS NULL and authorized_at is
--           unchanged.
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
    -- (c) ON DELETE SET NULL carve-out: see header. Only a bare
    -- authorized_by -> NULL with authorized_at untouched qualifies.
    IF NEW.authorized_by IS NULL AND NEW.authorized_at IS NOT DISTINCT FROM OLD.authorized_at THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Club authorization is set only by a site admin'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_club_authorization_write() IS
  'MYK9-572: authorized_at/authorized_by are writable only through set_club_authorization(). clubs_update (is_platform_admin() OR is_club_admin(clubs.id), no WITH CHECK) and clubs_insert (any active secretary/club_admin) would otherwise let those roles set either column directly. Carve-outs: API-roles-only (mirrors enforce_show_publish_gate, 20260915221500) for direct superuser/service_role sessions, the myk9.club_authorization_write transaction-local GUC that set_club_authorization() sets immediately before its UPDATE, and (round 4) the authorized_by FK''s ON DELETE SET NULL action (permitted only when authorized_at is unchanged). Otherwise: INSERT silently nulls both columns (a new club is never pre-authorized); UPDATE changing either column raises 42501.';

DROP TRIGGER IF EXISTS trg_guard_club_authorization_write ON public.clubs;
CREATE TRIGGER trg_guard_club_authorization_write
  BEFORE INSERT OR UPDATE ON public.clubs
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_club_authorization_write();

REVOKE ALL ON FUNCTION public.guard_club_authorization_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_club_authorization_write() FROM anon;
REVOKE ALL ON FUNCTION public.guard_club_authorization_write() FROM authenticated;

-- ---------------------------------------------------------------------------
-- 2. enforce_show_club_authorization(): its OWN trigger, separate from
--    enforce_show_publish_gate() (20260915221500, MYK9-579). An earlier
--    version of this migration CREATE OR REPLACE'd that function's body to
--    splice an authorization check into it, but that means redefining a
--    function 579 owns every time either gate's logic changes independently
--    — round 3 undoes that coupling. This trigger mirrors 579's structure
--    exactly (same API-roles-only carve-out, same TG_OP branching over the
--    SAME gated set) but owns its own function, its own trigger, and its
--    own SQLSTATE (MK004), and never touches 579's function body.
--
--    GATED SET: 'published' ONLY — NOT 'accepting_entries'. That status was
--    removed from the live shows.status CHECK constraint entirely by
--    072_align_show_class_statuses.sql; the enum today is draft/published/
--    upcoming/in_progress/completed/cancelled. Do not widen this trigger's
--    gated set to include it.
--
--    CLUBLESS REFUSAL BELONGS TO 579: when NEW.club_id IS NULL this trigger
--    returns NEW rather than raising — enforce_show_publish_gate already
--    raises MK003 ("Assign a club to this show before publishing") for that
--    case, and duplicating its message/SQLSTATE here would just race it.
--
--    TRIGGER ORDERING DEPENDENCY: Postgres fires multiple BEFORE triggers
--    for the SAME event in ALPHABETICAL ORDER BY TRIGGER NAME, not
--    declaration or migration order. trg_enforce_show_club_authorization
--    sorts BEFORE trg_enforce_show_publish_gate ('c' < 'p'), so this
--    trigger's MK004 always wins over 579's MK003 when a show is both
--    unauthorized AND not Stripe-ready — pinned by
--    supabase/tests/club_authorization_gate_test.sql's doubly-blocked-
--    precedence case. If either trigger is ever renamed, re-verify this
--    ordering still holds (a wiring test below also asserts it directly via
--    pg_trigger).
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

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'published' THEN
      RETURN NEW;
    END IF;
  ELSE
    -- UPDATE OF status. Only a transition INTO 'published' from OUTSIDE it.
    -- An already-published show keeps saving unrelated edits without being
    -- re-gated.
    IF NEW.status IS DISTINCT FROM 'published' OR OLD.status IS NOT DISTINCT FROM 'published' THEN
      RETURN NEW;
    END IF;
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
  'MYK9-572 (round 3): a SEPARATE server-side backstop from enforce_show_publish_gate (20260915221500, MYK9-579) for the club-authorization gate on a show entering ''published''. Raises SQLSTATE MK004 (distinct from that function''s MK003) when the club exists but clubs.authorized_at IS NULL. Mirrors that function''s API-roles-only carve-out and TG_OP branching, but gates ONLY ''published'' — never ''accepting_entries'', which is not a valid shows.status value (072_align_show_class_statuses.sql removed it from the live CHECK constraint). Defers the clubless refusal to enforce_show_publish_gate (MK003) entirely: this trigger returns NEW when NEW.club_id IS NULL instead of raising its own message. TRIGGER ORDERING DEPENDENCY: fires via trg_enforce_show_club_authorization, which Postgres runs BEFORE trg_enforce_show_publish_gate because same-event triggers fire in ALPHABETICAL ORDER BY NAME (''c'' < ''p''), so MK004 always wins over MK003 when both would apply — pinned by club_authorization_gate_test.sql''s doubly-blocked-precedence case. Renaming either trigger must re-verify this ordering.';

DROP TRIGGER IF EXISTS trg_enforce_show_club_authorization ON public.shows;
CREATE TRIGGER trg_enforce_show_club_authorization
  BEFORE INSERT OR UPDATE OF status ON public.shows
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_show_club_authorization();

-- Trigger-only function: nothing calls it directly (mirrors
-- enforce_show_publish_gate). A trigger fires regardless of EXECUTE
-- privilege, so this is an explicit grant DECISION for
-- migrationGrantDecisionContract, not a functional requirement.
REVOKE ALL ON FUNCTION public.enforce_show_club_authorization() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_show_club_authorization() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_show_club_authorization() FROM authenticated;

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
-- Round 4 (P3-2): every reference inside is already schema-qualified
-- (public.*, auth.uid()) or a pg_catalog builtin (now(), set_config(),
-- jsonb_build_object()) that resolves regardless of search_path, so the
-- looser `SET search_path = public` bought no convenience here and only
-- widened the surface for a search-path-hijack. Locked to ''.
SET search_path = ''
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
