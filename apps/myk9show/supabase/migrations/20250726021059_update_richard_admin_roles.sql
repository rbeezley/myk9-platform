-- Update Richard's user roles to include all admin privileges
-- This makes richard@myk9t.com a site admin with full system access

UPDATE public.user 
SET roles = ARRAY['exhibitor', 'secretary', 'club_admin', 'site_admin']
WHERE email = 'richard@myk9t.com';

-- Add a comment for tracking
COMMENT ON TABLE public.user IS 'User profiles table - granted admin roles to richard@myk9t.com on 2025-07-26';