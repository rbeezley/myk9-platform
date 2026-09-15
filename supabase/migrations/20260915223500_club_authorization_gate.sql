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
-- .sync() pulls incrementally through the AUTHENTICATED client
-- (`supabase.from('clubs').select('*').gt('updated_at', since)`), so RLS
-- applies to every pull — an offline device can never receive a club row it
-- is not allowed to see. But the incremental pull only ever ADDS/UPDATES
-- rows that are still visible; it has no tombstone or deletion signal, so a
-- club an offline client already cached BEFORE it became unauthorized (or
-- before the caller's own membership lapsed) stays in local storage until
-- some other path clears it. This is accepted as-is, not fixed here: nothing
-- that cached row can do is publicly visible, because show publication is
-- independently gated at the server (this same migration, and 20260915195500
-- for Stripe) — a stale local club row cannot be used to publish a show or to
-- appear in anyone else's public directory. Building a tombstone mechanism
-- for this is out of scope for MYK9-572.
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
--   role-requests/index.ts, RoleManager.ts — an unauthorized club's embed
--   nulls out for a caller who cannot see it (table-level SELECT still
--   granted; only the row-level predicate fails). This is acceptable ONLY
--   because a show can never have PUBLISHED with an unauthorized club (this
--   migration's trigger guarantees it), so the only rows an ordinary viewer
--   can reach are drafts they already administer as club_admin/secretary of
--   that same club — which means is_club_admin/is_trial_secretary in the new
--   clubs_select predicate keeps the embed populated for them anyway.
--   showMappers.ts already reads every club.* field through `?.` with a `''`
--   fallback (mapShowRow's clubName/clubAddress/clubEmail), so a null embed
--   renders as an empty club name rather than crashing.
-- Show Creation Wizard's HostClubField / club picker — verified NOT anon:
--   it runs behind ProtectedRoute for a signed-in secretary, and that
--   secretary is club_admin of any club they just created (the
--   trg_grant_club_admin_to_club_creator trigger), so is_club_admin(clubs.id)
--   in the new predicate keeps their own just-created club visible to them
--   even before a site admin authorizes it.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. clubs.authorized_at / authorized_by
-- ---------------------------------------------------------------------------
ALTER TABLE public.clubs
  ADD COLUMN authorized_at timestamptz,
  ADD COLUMN authorized_by uuid REFERENCES public.people(id);

COMMENT ON COLUMN public.clubs.authorized_at IS
  'MYK9-572: null = not yet authorized by a site admin. Gates show publication (enforce_show_publish_gate, SQLSTATE MK004) and the public club directory (clubs_select). Set/cleared only by set_club_authorization(). Revoking (setting back to null) is deliberately never retroactive — it does not unpublish shows the club already published.';
COMMENT ON COLUMN public.clubs.authorized_by IS
  'MYK9-572: the site admin (people.id) who last called set_club_authorization() for this club, for either direction (authorize or revoke). Null alongside authorized_at when never authorized.';

-- All clubs that exist as of this migration are trusted — they predate the
-- authorization gate entirely, most were created by site admins or vetted
-- secretaries, and un-publishing/hiding them on upgrade would be a breaking
-- change with no security benefit (the gate is about NEW exposure going
-- forward, not retroactively distrusting the existing directory).
UPDATE public.clubs SET authorized_at = now() WHERE authorized_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. enforce_show_publish_gate(): add the authorization check.
--    Copied verbatim from 20260915195500's body, with one new check inserted
--    BEFORE the Stripe-readiness check (after the club_id NULL check, which
--    must still run first — an authorization check needs a club to check).
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

  -- MYK9-572: a club must be authorized before it can open online entries at
  -- all, independent of its Stripe readiness. Distinct SQLSTATE (MK004) so
  -- the client can show a distinct message instead of the Stripe copy.
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
  'MYK9-579/MYK9-572: server-side backstop for the draft->published gate. Mirrors publishGateError (ShowEditPanel.helpers.ts) and the inline check in ShowStatusPill.tsx exactly, including their copy. Refuses with SQLSTATE MK003 for a missing club or a not-Stripe-ready club (mapped client-side via isPublishGateDbError in onlineEntryGate.ts), and with MK004 when the club exists but is not yet authorized (clubs.authorized_at IS NULL, MYK9-572). Livemode is read from platform_settings.stripe_livemode. Exempts already-published shows (OLD.status = published) so unrelated edits on a live show are never re-gated or retroactively un-published — this applies to BOTH refusal reasons: revoking a club''s authorization never un-publishes its existing shows. Scoped to UPDATE OF status only, not INSERT: no app path can insert an already-published show (see 20260915195500 for the full INSERT-scope rationale).';

-- Trigger definition (name/timing/columns) is unchanged from 20260915195500 —
-- CREATE OR REPLACE FUNCTION above is sufficient; no DROP/CREATE TRIGGER needed.

-- Re-state the grant decision for THIS file too (migrationGrantDecisionContract
-- reads every migration independently): still a trigger-only function, nothing
-- calls it directly.
REVOKE ALL ON FUNCTION public.enforce_show_publish_gate() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_show_publish_gate() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_show_publish_gate() FROM authenticated;

-- ---------------------------------------------------------------------------
-- 3. clubs_select: hide unauthorized clubs from the public directory, but
--    keep them visible to a site admin, the club's own admin(s)/secretary,
--    and any club_members row for that club (mirrors club_members_select's
--    own membership check, 053_club_members_officers.sql).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "clubs_select" ON public.clubs;

CREATE POLICY "clubs_select" ON public.clubs
  FOR SELECT USING (
    authorized_at IS NOT NULL
    OR (SELECT public.is_site_admin())
    OR (SELECT public.is_club_admin(id))
    OR (SELECT public.is_trial_secretary(id))
    OR EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = clubs.id AND cm.person_id = (SELECT auth.uid())
    )
  );

COMMENT ON POLICY clubs_select ON public.clubs IS
  'MYK9-572: public only once authorized_at IS NOT NULL (superseding the prior "deliberately public" comment from MYK9-93 / 20260725150000). A site admin, the club''s own club_admin/secretary, or a club_members row for that club can always see it regardless of authorization state — the creator of a brand-new unauthorized club is covered by is_club_admin(id) via trg_grant_club_admin_to_club_creator (20260511100000).';

-- ---------------------------------------------------------------------------
-- 4. set_club_authorization(): the one write path for authorized_at/_by.
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
BEGIN
  IF NOT public.is_site_admin() THEN
    RAISE EXCEPTION 'Only site admins can authorize or revoke a club'
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_actor_person_id
  FROM public.people
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  UPDATE public.clubs
  SET authorized_at = CASE WHEN p_authorized THEN now() ELSE NULL END,
      authorized_by = v_actor_person_id
  WHERE id = p_club_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Club % not found', p_club_id
      USING ERRCODE = 'P0002';
  END IF;

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
  'MYK9-572: the only write path for clubs.authorized_at/_by. Site-admin only (restates is_site_admin(), does not rely on clubs_update RLS). Revoking never unpublishes the club''s existing shows — enforce_show_publish_gate only fires on a transition INTO published. Writes a permission_audit_log row for both directions.';

REVOKE ALL ON FUNCTION public.set_club_authorization(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_club_authorization(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_club_authorization(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Document the deliberate exposure the READ-PATH AUDIT above relies on:
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
