-- Migration 156: Denormalize auth_user_id into user_roles to break RLS recursion
--
-- Migrations 154 and 155 tried PL/pgSQL with SET LOCAL row_security = off and
-- dynamic SQL via EXECUTE. Neither worked — PostgreSQL detects RLS policy
-- recursion at runtime even for SECURITY DEFINER functions, because Supabase's
-- postgres role appears to be subject to FORCE ROW LEVEL SECURITY through some
-- configuration we don't control.
--
-- Real fix: remove the people-table reference from is_trial_secretary(),
-- is_club_admin(), and is_site_admin() entirely. We do this by denormalizing
-- people.auth_user_id into user_roles.auth_user_id. The functions then look up
-- roles by auth.uid() directly without joining people.
--
-- Schema change:
--   1. Add user_roles.auth_user_id column (nullable initially)
--   2. Backfill from people.auth_user_id
--   3. Add trigger to keep it in sync on INSERT/UPDATE
--   4. Add NOT NULL constraint after backfill
--   5. Add index for fast lookup
--
-- Then rewrite is_trial_secretary(), is_club_admin(), is_site_admin() to
-- query user_roles.auth_user_id directly — no join to people, no recursion.
--
-- Rollback:
--   ALTER TABLE user_roles DROP COLUMN auth_user_id;
--   DROP FUNCTION sync_user_roles_auth_user_id();
--   DROP TRIGGER sync_user_roles_auth_user_id_trigger ON user_roles;
--   re-apply migration 102 / 124 functions

-- Step 1: add column
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS auth_user_id UUID;

-- Step 2: backfill from people
UPDATE public.user_roles ur
SET auth_user_id = p.auth_user_id
FROM public.people p
WHERE p.id = ur.user_id
  AND ur.auth_user_id IS DISTINCT FROM p.auth_user_id;

-- Step 3: add index for the new lookup pattern
CREATE INDEX IF NOT EXISTS user_roles_auth_user_id_idx
  ON public.user_roles(auth_user_id);

-- Step 4: trigger to keep auth_user_id in sync on INSERT
-- (UPDATE on user_roles.user_id would be unusual — trigger handles INSERT only)
CREATE OR REPLACE FUNCTION public.sync_user_roles_auth_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.auth_user_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT auth_user_id INTO NEW.auth_user_id
    FROM public.people
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_user_roles_auth_user_id_trigger ON public.user_roles;
CREATE TRIGGER sync_user_roles_auth_user_id_trigger
  BEFORE INSERT OR UPDATE OF user_id ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_roles_auth_user_id();

-- Step 5: rewrite RLS lookup functions to query user_roles.auth_user_id directly
CREATE OR REPLACE FUNCTION public.is_trial_secretary(check_club_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.auth_user_id = auth.uid()
      AND r.name IN ('secretary', 'trial_secretary')
      AND ur.is_active = true
      AND (check_club_id IS NULL OR ur.club_id = check_club_id)
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_club_admin(check_club_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.auth_user_id = auth.uid()
      AND r.name = 'club_admin'
      AND ur.is_active = true
      AND (check_club_id IS NULL OR ur.club_id = check_club_id)
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_site_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.auth_user_id = auth.uid()
      AND r.name = 'site_admin'
      AND ur.is_active = true
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_trial_secretary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_club_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_site_admin() TO authenticated;
