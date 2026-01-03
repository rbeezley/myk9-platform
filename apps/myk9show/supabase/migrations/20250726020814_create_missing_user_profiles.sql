-- Create missing user profiles for auth users without public.user records
-- These are existing auth.users that need corresponding profile records

-- Insert profiles for auth users that don't have public.user records
INSERT INTO public.user (first_name, last_name, email, roles, user_id)
SELECT 
  COALESCE(raw_user_meta_data->>'first_name', 'User') as first_name,
  COALESCE(raw_user_meta_data->>'last_name', 'Name') as last_name,
  email,
  ARRAY['exhibitor'] as roles,
  id as user_id
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.user pu WHERE pu.user_id = au.id
)
AND email IS NOT NULL;

-- Add a comment for tracking
COMMENT ON TABLE public.user IS 'User profiles table - added missing profiles for existing auth users on 2025-07-26';