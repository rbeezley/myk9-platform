-- Fix role name mismatch: RLS checks for 'platform_admin' but frontend uses 'site_admin'
-- Accept both names so existing data works regardless of which was assigned

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    JOIN public.people p ON p.id = ur.user_id
    WHERE p.auth_user_id = auth.uid()
      AND r.name IN ('platform_admin', 'site_admin')
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  );
$$;
