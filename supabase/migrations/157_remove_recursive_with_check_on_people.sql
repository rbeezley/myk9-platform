-- Migration 157: Remove recursive WITH CHECK subquery on people_update_own
--
-- Migration 156 denormalized auth_user_id into user_roles so the role helper
-- functions (is_trial_secretary, is_club_admin, is_site_admin) no longer
-- reference public.people. PATCH /people still returns "infinite recursion
-- detected in policy for relation 'people'".
--
-- Remaining recursion source: the WITH CHECK clause of `people_update_own`
-- (migration 097) contains a subquery `SELECT p.status FROM public.people p
-- WHERE p.id = people.id`. When PostgreSQL evaluates this subquery during
-- WITH CHECK enforcement, it re-enters RLS evaluation on `public.people` —
-- which the planner detects as recursion on the same relation.
--
-- Fix: drop the WITH CHECK subquery entirely. Move the "non-privileged users
-- cannot change status" rule into a BEFORE UPDATE trigger that compares
-- OLD.status vs NEW.status without touching `public.people` again. Triggers
-- run with the table's owner privileges and have direct access to OLD/NEW
-- — no subquery, no RLS re-entry, no recursion.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS people_protect_status_trigger ON public.people;
--   DROP FUNCTION IF EXISTS public.people_protect_status();
--   DROP POLICY IF EXISTS "people_update_own" ON public.people;
--   re-apply migration 097's people_update_own definition.

-- Step 1: replace people_update_own with a non-recursive version.
DROP POLICY IF EXISTS "people_update_own" ON public.people;
CREATE POLICY "people_update_own" ON public.people
    FOR UPDATE TO authenticated
    USING (
        auth_user_id = (SELECT auth.uid())
    )
    WITH CHECK (
        auth_user_id = (SELECT auth.uid())
    );

-- Step 2: enforce status immutability for self-updates via trigger.
-- Privileged users (secretaries, site_admins) bypass via people_update_privileged
-- and are allowed to change status — the trigger checks the role helpers
-- (which after migration 156 do NOT touch public.people) before raising.
CREATE OR REPLACE FUNCTION public.people_protect_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Allow if status didn't change.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Status changed: require privileged role.
  IF public.is_trial_secretary() OR public.is_site_admin() THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Permission denied: status can only be changed by site admins or secretaries'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS people_protect_status_trigger ON public.people;
CREATE TRIGGER people_protect_status_trigger
  BEFORE UPDATE OF status ON public.people
  FOR EACH ROW
  EXECUTE FUNCTION public.people_protect_status();

GRANT EXECUTE ON FUNCTION public.people_protect_status() TO authenticated;
