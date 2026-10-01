-- MYK9-909: a secretary who is not yet a club admin can INSERT a club
-- (clubs_insert admits is_trial_secretary(), and trg_grant_club_admin_to_club_creator
-- then grants them club_admin), but `INSERT ... RETURNING id` died with
-- "new row violates row-level security policy for table clubs".
--
-- Why: RETURNING checks clubs_select against the NEW row BEFORE the AFTER ROW
-- trigger has run, so the club_admin grant does not exist yet, and a new club
-- is unauthorized (authorized_at IS NULL, MYK9-572), so none of clubs_select's
-- branches admit it. The app always uploads with `.insert(row).select('id')`
-- (packages/replication/src/mutation-execute.ts), so secretary club creation
-- never reached the server.
--
-- Fix: record the creating auth user on the row and let clubs_select admit
-- `created_by = auth.uid()`, which is evaluable at RETURNING time.
--
-- 1. clubs.created_by uuid DEFAULT auth.uid(). Deliberately NO FK to
--    auth.users: it is only an RLS read-path marker, and an FK would make
--    every club insert depend on an auth.users row (existing SQL tests and
--    synthetic-claim server paths insert under a sub with no auth.users row;
--    CI failed with clubs_created_by_fkey). No backfill: existing rows stay NULL; they are all
--    authorized (20260916004500 backfill) so they stay publicly visible.
-- 2. guard_club_created_by_write(): a client can neither claim nor change a
--    creator. INSERT by an API role forces created_by := auth.uid(); service_role
--    and direct postgres sessions (no auth.uid()) keep the supplied value.
--    UPDATE restores OLD.created_by unless NEW is NULL (NULLing only ever
--    reduces visibility).
-- 3. clubs_select recreated from its latest definition (20260916004500) with
--    one added branch. Every existing branch and the role list (PUBLIC) are
--    unchanged.
--
-- Grants: clubs already carries table-level ACLs (anon SELECT, authenticated
-- arwd, service_role all) and no column-level ACLs; a new column inherits them.
-- anon gains no privilege it did not have, but note anon can read created_by on
-- the rows it can already see (authorized clubs): an opaque auth uid, the same
-- exposure class as authorized_by. A column REVOKE cannot narrow anon's
-- table-level SELECT (see the Grant Never Narrows lesson), and allowlisting
-- columns would 403 BrowseClubsPage's `select=*`.

BEGIN;

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid();

COMMENT ON COLUMN public.clubs.created_by IS
  'MYK9-909: auth uid of the account that inserted the club (forced by guard_club_created_by_write on every API-role INSERT, immutable on UPDATE). Exists so clubs_select can admit the creator of a brand-new unauthorized club at INSERT ... RETURNING time, before trg_grant_club_admin_to_club_creator''s club_admin grant exists. NULL for clubs that predate this column and for service_role/seed inserts.';

CREATE OR REPLACE FUNCTION public.guard_club_created_by_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL
       OR coalesce(current_setting('role', true), 'none') IN ('authenticated', 'anon') THEN
      NEW.created_by := auth.uid();
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: created_by is immutable. NULL is let through (only reduces visibility).
  IF NEW.created_by IS NOT NULL THEN
    NEW.created_by := OLD.created_by;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_club_created_by_write() IS
  'MYK9-909: clubs.created_by is server-assigned. INSERT by an API role (or any session with an auth.uid()) forces created_by := auth.uid(); other sessions (service_role, direct postgres) keep the supplied value. UPDATE restores OLD.created_by unless NEW is NULL. SECURITY INVOKER: auth.uid() only reads request.jwt.claims.';

DROP TRIGGER IF EXISTS trg_guard_club_created_by_write ON public.clubs;
CREATE TRIGGER trg_guard_club_created_by_write
  BEFORE INSERT OR UPDATE ON public.clubs
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_club_created_by_write();

REVOKE ALL ON FUNCTION public.guard_club_created_by_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_club_created_by_write() FROM anon;
REVOKE ALL ON FUNCTION public.guard_club_created_by_write() FROM authenticated;

DROP POLICY IF EXISTS "clubs_select" ON public.clubs;

CREATE POLICY "clubs_select" ON public.clubs
  FOR SELECT USING (
    authorized_at IS NOT NULL
    OR (SELECT public.is_site_admin())
    OR public.is_club_admin(id)
    OR public.is_trial_secretary(id)
    OR public.is_club_member(id)
    OR public.club_has_public_show(id)
    OR created_by = (SELECT auth.uid())
  );

COMMENT ON POLICY clubs_select ON public.clubs IS
  'MYK9-572: public once authorized_at IS NOT NULL, OR once it hosts a publicly-visible show even after a later revoke (club_has_public_show). A site admin, the club''s own club_admin/secretary, or an active club_members row can always see it regardless of authorization state. MYK9-909: the account that created the club (created_by = auth.uid()) can always see it too — needed because INSERT ... RETURNING evaluates this policy before trg_grant_club_admin_to_club_creator''s grant exists. is_site_admin() and auth.uid() are wrapped in scalar subqueries (InitPlan, cached once per statement); the per-row functions are correlated on clubs.id and called bare.';

COMMIT;
