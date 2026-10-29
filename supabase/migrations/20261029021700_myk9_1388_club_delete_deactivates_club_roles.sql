-- MYK9-1388: deleting a club deactivates the role grants scoped to it, and no
-- active grant can exist for a deleted club.
--
-- Why: soft_delete_club tombstones only public.clubs. Every user_roles row with
-- club_id = that club (club_admin, secretary, and any show official the club
-- appointed, which also carry club_id) stayed active, so the RBAC RPCs kept
-- returning scopes for a club nobody can see. The secretary's Members wall then
-- read "Your club access needs to be configured" instead of the not-applicable
-- sentence (F53). Server-side RLS also kept honouring those grants.
--
-- Design: one-way, like person delete (20260710170000, 20260804150000).
--   * Deleting a club deactivates its active grants.
--   * Restoring a club reactivates NOTHING. Its people are re-granted
--     explicitly, the same rule restore_person follows ("role-neutral"). An
--     earlier draft of this migration restored "exactly the grants the delete
--     switched off"; two review rounds showed every provenance scheme could
--     undo a person deletion or a hand revocation made while the club was
--     deleted, so the restore half was removed rather than patched again.
--   * user_roles.deactivated_at is NOT written here: it records grants a
--     PERSON delete removed, and the deleted-person reads depend on that.
--   * A guard refuses an active grant (insert, reactivation or move) for a
--     deleted club. It takes FOR SHARE on the club row, which conflicts with
--     the delete's row lock, so a grant racing a delete either waits and is
--     refused, or commits first and is then deactivated by the delete trigger
--     (whose UPDATE takes a fresh snapshot under READ COMMITTED).

-- ---------------------------------------------------------------------------
-- 1. Guard: no active grant for a deleted club
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.user_roles_refuse_deleted_club_grant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted_at timestamptz;
BEGIN
  -- SECURITY DEFINER: FOR SHARE needs UPDATE privilege on clubs and must not
  -- be filtered by the caller's RLS, or a hidden deleted club would read as
  -- missing and pass.
  SELECT c.deleted_at INTO v_deleted_at
  FROM public.clubs AS c
  WHERE c.id = NEW.club_id
  FOR SHARE;

  IF FOUND AND v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot grant access to a deleted club'
      USING ERRCODE = '23514',
            HINT = 'Restore the club first, then grant the role again.';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.user_roles_refuse_deleted_club_grant() IS
  'MYK9-1388: BEFORE INSERT / UPDATE OF is_active, club_id on user_roles. Refuses an active grant for a soft-deleted club; FOR SHARE on the club row serialises it with club deletion.';

REVOKE ALL ON FUNCTION private.user_roles_refuse_deleted_club_grant()
  FROM PUBLIC, anon, authenticated, service_role;

-- Two triggers, not one, so an UPDATE that leaves an already-active grant active
-- never takes the club lock. That is the only update the delete's own
-- deactivation UPDATE can be waiting on, so the lock order club -> grant (delete)
-- and grant -> club (guard) can no longer invert into a deadlock. A reactivation
-- or move targets a row the delete does not match, so it cannot be waited on.
DROP TRIGGER IF EXISTS trg_user_roles_refuse_deleted_club_grant ON public.user_roles;
DROP TRIGGER IF EXISTS trg_user_roles_refuse_deleted_club_grant_ins ON public.user_roles;
DROP TRIGGER IF EXISTS trg_user_roles_refuse_deleted_club_grant_upd ON public.user_roles;
CREATE TRIGGER trg_user_roles_refuse_deleted_club_grant_ins
  BEFORE INSERT ON public.user_roles
  FOR EACH ROW
  WHEN (NEW.is_active AND NEW.club_id IS NOT NULL)
  EXECUTE FUNCTION private.user_roles_refuse_deleted_club_grant();
CREATE TRIGGER trg_user_roles_refuse_deleted_club_grant_upd
  BEFORE UPDATE OF is_active, club_id ON public.user_roles
  FOR EACH ROW
  WHEN (
    NEW.is_active AND NEW.club_id IS NOT NULL
    AND (OLD.is_active IS DISTINCT FROM NEW.is_active
         OR OLD.club_id IS DISTINCT FROM NEW.club_id)
  )
  EXECUTE FUNCTION private.user_roles_refuse_deleted_club_grant();

-- ---------------------------------------------------------------------------
-- 2. Club delete deactivates the club's grants (restore does nothing)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.deactivate_club_role_grants_on_club_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Runs as the owner: RLS and the step-up reauth trigger (current_user check)
  -- do not apply; the caller is the already-gated delete RPC.
  UPDATE public.user_roles
  SET is_active = false
  WHERE club_id = NEW.id
    AND is_active;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION private.deactivate_club_role_grants_on_club_delete() IS
  'MYK9-1388: AFTER UPDATE OF deleted_at on clubs, when a club is soft-deleted. Deactivates its active user_roles grants. Restore is role-neutral: nothing is reactivated.';

REVOKE ALL ON FUNCTION private.deactivate_club_role_grants_on_club_delete()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_clubs_deactivate_role_grants_on_delete ON public.clubs;
CREATE TRIGGER trg_clubs_deactivate_role_grants_on_delete
  AFTER UPDATE OF deleted_at ON public.clubs
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION private.deactivate_club_role_grants_on_club_delete();

-- ---------------------------------------------------------------------------
-- 3. Backfill: grants already orphaned by clubs deleted before this migration
--    (clears the three club_admin grants on secretary@myk9t.com). The guard
--    does not fire: it only checks rows that end up active.
-- ---------------------------------------------------------------------------
UPDATE public.user_roles AS ur
SET is_active = false
FROM public.clubs AS c
WHERE ur.club_id = c.id
  AND c.deleted_at IS NOT NULL
  AND ur.is_active;
