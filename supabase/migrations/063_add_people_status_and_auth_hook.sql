-- 063_add_people_status_and_auth_hook.sql
-- Adds status column to people, auth hook to block suspended users,
-- and admin RPC for user list with last_sign_in_at.

--------------------------------------------------------------
-- 1. Status column
--------------------------------------------------------------
ALTER TABLE people ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE people ADD CONSTRAINT people_status_check
  CHECK (status IN ('active', 'suspended'));
CREATE INDEX idx_people_status ON people (status);

--------------------------------------------------------------
-- 2. Auth hook: block suspended users at token creation
--------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  person_status TEXT;
BEGIN
  SELECT p.status INTO person_status
  FROM public.people p
  WHERE p.auth_user_id = (event->>'user_id')::uuid
    AND p.deleted_at IS NULL;

  IF person_status = 'suspended' THEN
    RETURN jsonb_build_object(
      'claims', event->'claims',
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Account suspended'
      )
    );
  END IF;

  RETURN event;
END;
$$;

-- Auth admin needs schema access, function execution, and SELECT on people
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
GRANT SELECT ON public.people TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

--------------------------------------------------------------
-- 3. Admin RPC: user list with last_sign_in_at from auth.users
--------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_user_list(show_deleted BOOLEAN DEFAULT FALSE)
RETURNS TABLE (
  id UUID,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  status TEXT,
  roles TEXT[],
  profile_image TEXT,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- Verify caller is site_admin (check both legacy roles and RBAC)
  IF NOT EXISTS (
    SELECT 1 FROM public.people
    WHERE auth_user_id = auth.uid()
      AND deleted_at IS NULL
      AND (
        'site_admin' = ANY(people.roles)
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
          JOIN public.roles r ON r.id = ur.role_id
          WHERE ur.user_id = auth.uid()
            AND r.name = 'site_admin'
        )
      )
  ) THEN
    RAISE EXCEPTION 'Unauthorized: site_admin role required';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.first_name,
    p.last_name,
    p.email,
    p.phone,
    p.status,
    p.roles,
    p.profile_image,
    p.deleted_at,
    p.deleted_by,
    p.created_at,
    p.updated_at,
    au.last_sign_in_at
  FROM public.people p
  LEFT JOIN auth.users au ON au.id = p.auth_user_id
  WHERE show_deleted OR p.deleted_at IS NULL
  ORDER BY p.last_name ASC NULLS LAST, p.first_name ASC NULLS LAST;
END;
$$;
