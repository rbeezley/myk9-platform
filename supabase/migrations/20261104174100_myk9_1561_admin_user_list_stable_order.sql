-- MYK9-1561: get_admin_user_list is read by the client in `.range()` pages
-- (PostgREST caps a response at max_rows = 1000). Paging over an ORDER BY that
-- is not unique (last_name, first_name) can skip or repeat people that share a
-- name across a page boundary, so the id is appended as a tiebreaker.
--
-- Body copied verbatim from the live definition (matches 066_unify_role_systems);
-- the ONLY change is `, p.id` on the ORDER BY. ACL restated so it stays as is.

BEGIN;

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
SET search_path = public, auth
AS $$
DECLARE
  caller_id UUID;
  caller_person_id UUID;
  is_admin BOOLEAN := FALSE;
BEGIN
  -- Get the calling user's auth ID
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Find the caller's person record
  SELECT p.id INTO caller_person_id
  FROM people p
  WHERE p.auth_user_id = caller_id;

  IF caller_person_id IS NULL THEN
    RAISE EXCEPTION 'Person record not found';
  END IF;

  -- Check if caller is site_admin via user_roles
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles rl ON rl.id = ur.role_id
    WHERE ur.user_id = caller_person_id
      AND rl.name = 'site_admin'
      AND ur.is_active = TRUE
  ) INTO is_admin;

  IF NOT is_admin THEN
    RAISE EXCEPTION 'Unauthorized: requires site_admin role';
  END IF;

  -- Return user list with roles aggregated from user_roles
  RETURN QUERY
  SELECT
    p.id,
    p.first_name,
    p.last_name,
    p.email,
    p.phone,
    p.status,
    COALESCE(
      (SELECT array_agg(rl.name ORDER BY rl.name)
       FROM user_roles ur
       JOIN roles rl ON rl.id = ur.role_id
       WHERE ur.user_id = p.id AND ur.is_active = TRUE),
      '{}'::TEXT[]
    ) AS roles,
    p.profile_image,
    p.deleted_at,
    p.deleted_by,
    p.created_at,
    p.updated_at,
    au.last_sign_in_at
  FROM people p
  LEFT JOIN auth.users au ON au.id = p.auth_user_id
  WHERE (show_deleted OR p.deleted_at IS NULL)
  ORDER BY p.last_name, p.first_name, p.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_user_list(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_user_list(boolean) TO authenticated, service_role;

COMMIT;
