-- Migrate from simple array-based roles to proper RBAC system
-- This populates the user_role table based on existing roles array in public.user

-- Step 1: Populate user_role table with existing role assignments
INSERT INTO public.user_role (
  id,
  user_id, 
  role_id,
  assigned_at,
  is_active
)
SELECT 
  gen_random_uuid() as id,
  u.user_id,
  r.id as role_id,
  NOW() as assigned_at,
  true as is_active
FROM public.user u
CROSS JOIN LATERAL unnest(u.roles) as role_name
JOIN public.role r ON r.name = role_name
WHERE u.user_id IS NOT NULL;

-- Step 2: Add missing club_admin role if it doesn't exist
INSERT INTO public.role (id, name, display_name, description, is_system, is_active, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  'club_admin',
  'Club Administrator', 
  'Can manage club-level operations and shows',
  true,
  true,
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.role WHERE name = 'club_admin');

-- Step 3: Add club_admin role assignment for Richard if it doesn't exist
INSERT INTO public.user_role (
  id,
  user_id,
  role_id, 
  assigned_at,
  is_active
)
SELECT 
  gen_random_uuid(),
  u.user_id,
  r.id,
  NOW(),
  true
FROM public.user u
CROSS JOIN public.role r 
WHERE u.email = 'richard@myk9t.com'
  AND r.name = 'club_admin'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_role ur 
    WHERE ur.user_id = u.user_id AND ur.role_id = r.id
  );

-- Step 4: Create view for easy role querying (optional, for backwards compatibility)
CREATE OR REPLACE VIEW user_roles_view AS
SELECT 
  u.id,
  u.email,
  u.first_name,
  u.last_name,
  u.user_id,
  array_agg(r.name ORDER BY r.name) as roles,
  array_agg(r.display_name ORDER BY r.name) as role_display_names
FROM public.user u
LEFT JOIN public.user_role ur ON u.user_id = ur.user_id AND ur.is_active = true
LEFT JOIN public.role r ON ur.role_id = r.id AND r.is_active = true
GROUP BY u.id, u.email, u.first_name, u.last_name, u.user_id;

-- Add comment for tracking
COMMENT ON TABLE public.user_role IS 'Proper RBAC system - migrated from simple array on 2025-07-26';