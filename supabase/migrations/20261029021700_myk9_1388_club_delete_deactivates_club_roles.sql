-- MYK9-1388: deleting a club deactivates the role grants scoped to it.
--
-- Why: soft_delete_club tombstones only public.clubs. Every user_roles row with
-- club_id = that club (club_admin, secretary, and any show official the club
-- appointed, which also carry club_id) stayed active, so the RBAC RPCs kept
-- returning scopes for a club nobody can see. The secretary's Members wall then
-- read "Your club access needs to be configured" instead of the not-applicable
-- sentence (F53). Server-side RLS also kept honouring those grants.
--
-- Design mirrors the person precedent (20260710170000, 20260804150000) but as a
-- trigger on clubs.deleted_at so every writer is covered: soft_delete_club,
-- restore_club, and postgres/service_role fixtures.
--
-- PROVENANCE. user_roles.club_deactivated_at is a column of its own, NOT the
-- person-delete column deactivated_at: the two causes must not be confusable
-- (Codex review of bd6fbb490, P1). It is set only by the club-delete trigger and
-- is cleared whenever is_active changes by any other path (grant, reissue,
-- revoke), so a later independent revoke is never undone by a club restore (P2).
--   * delete  -> active grants of the club get is_active=false and
--                club_deactivated_at = clubs.deleted_at;
--   * restore -> only grants with club_deactivated_at = the deleted_at being
--                cleared AND whose person is not soft-deleted are reactivated.
--                A person deleted while the club was deleted keeps the person
--                revocation (person restore is role-neutral by design).
--
-- INVARIANT. No active grant may exist for a deleted club (P2): a BEFORE
-- INSERT/UPDATE guard on user_roles refuses it, so grant_club_secretary and the
-- other grant paths cannot recreate the orphaned access.
--
-- Both trigger functions are SECURITY DEFINER-owned writes where needed, so
-- RLS and the step-up reauth trigger (current_user check) do not apply to the
-- club trigger's own user_roles update; the caller is the delete/restore RPC.

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS club_deactivated_at TIMESTAMPTZ;

-- Clear club provenance on any is_active change that the club trigger did not
-- make. The club trigger marks its own updates with a transaction-local setting.
CREATE OR REPLACE FUNCTION private.user_roles_guard_club_provenance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.is_active IS DISTINCT FROM OLD.is_active
       AND COALESCE(current_setting('myk9.club_role_sync', true), '') <> 'on' THEN
      NEW.club_deactivated_at := NULL;
    END IF;
    -- Only a new or newly-reactivated/moved grant is checked; OLD is not read on INSERT.
    IF NOT (NEW.is_active IS DISTINCT FROM OLD.is_active
            OR NEW.club_id IS DISTINCT FROM OLD.club_id) THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.is_active
     AND NEW.club_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.clubs c
       WHERE c.id = NEW.club_id AND c.deleted_at IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'Cannot grant access to a deleted club'
      USING ERRCODE = '23514',
            HINT = 'Restore the club first.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.user_roles_guard_club_provenance() IS
  'MYK9-1388: BEFORE INSERT/UPDATE on user_roles. Clears club_deactivated_at when is_active changes outside the club-delete trigger, and refuses an active grant for a soft-deleted club.';

REVOKE ALL ON FUNCTION private.user_roles_guard_club_provenance()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_user_roles_guard_club_provenance ON public.user_roles;
CREATE TRIGGER trg_user_roles_guard_club_provenance
  BEFORE INSERT OR UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION private.user_roles_guard_club_provenance();

CREATE OR REPLACE FUNCTION private.sync_club_role_grants_on_club_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM set_config('myk9.club_role_sync', 'on', true);

  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    UPDATE public.user_roles
    SET is_active = false, club_deactivated_at = NEW.deleted_at
    WHERE club_id = NEW.id AND is_active;
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    UPDATE public.user_roles ur
    SET is_active = true, club_deactivated_at = NULL
    WHERE ur.club_id = NEW.id
      AND NOT ur.is_active
      AND ur.club_deactivated_at = OLD.deleted_at
      AND EXISTS (
        SELECT 1 FROM public.people p
        WHERE p.id = ur.user_id AND p.deleted_at IS NULL
      );
  END IF;

  PERFORM set_config('myk9.club_role_sync', 'off', true);
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION private.sync_club_role_grants_on_club_delete() IS
  'MYK9-1388: AFTER UPDATE OF deleted_at on clubs. Delete deactivates the club''s active user_roles grants and stamps club_deactivated_at; restore reactivates only the grants stamped with the cleared deleted_at whose person is live.';

REVOKE ALL ON FUNCTION private.sync_club_role_grants_on_club_delete()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_clubs_sync_role_grants_on_delete ON public.clubs;
CREATE TRIGGER trg_clubs_sync_role_grants_on_delete
  AFTER UPDATE OF deleted_at ON public.clubs
  FOR EACH ROW
  WHEN (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
  EXECUTE FUNCTION private.sync_club_role_grants_on_club_delete();

-- Backfill: every active grant scoped to an already-deleted club, with the same
-- provenance stamp a live delete would have written. Clears the orphan
-- club_admin grants on secretary@myk9t.com. The guard trigger sees an
-- is_active change, so mark the statement as a club sync to keep the stamp.
SELECT set_config('myk9.club_role_sync', 'on', true);
UPDATE public.user_roles ur
SET is_active = false, club_deactivated_at = c.deleted_at
FROM public.clubs c
WHERE ur.club_id = c.id
  AND c.deleted_at IS NOT NULL
  AND ur.is_active;
SELECT set_config('myk9.club_role_sync', 'off', true);
