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
-- restore_club, and postgres/service_role fixtures. user_roles.deactivated_at
-- (added by 20260804150000) records which grants THIS delete switched off:
--   * delete  -> active grants of the club get is_active=false and
--                deactivated_at = clubs.deleted_at;
--   * restore -> only grants with deactivated_at = the deleted_at being cleared
--                are reactivated. A grant that was inactive before the delete has
--                a different (or null) deactivated_at and stays inactive.
--
-- The function is SECURITY DEFINER so the user_roles write runs as its owner:
-- RLS and the step-up reauth trigger (current_user check) do not apply to it,
-- which is right because the caller is the delete/restore RPC, already gated.

CREATE OR REPLACE FUNCTION private.sync_club_role_grants_on_club_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    UPDATE public.user_roles
    SET is_active = false, deactivated_at = NEW.deleted_at
    WHERE club_id = NEW.id AND is_active;
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    UPDATE public.user_roles
    SET is_active = true, deactivated_at = NULL
    WHERE club_id = NEW.id
      AND NOT is_active
      AND deactivated_at = OLD.deleted_at;
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION private.sync_club_role_grants_on_club_delete() IS
  'MYK9-1388: AFTER UPDATE OF deleted_at on clubs. Delete deactivates the club''s active user_roles grants and stamps deactivated_at; restore reactivates only the grants stamped with the cleared deleted_at.';

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
-- club_admin grants on secretary@myk9t.com.
UPDATE public.user_roles ur
SET is_active = false, deactivated_at = c.deleted_at
FROM public.clubs c
WHERE ur.club_id = c.id
  AND c.deleted_at IS NOT NULL
  AND ur.is_active;
