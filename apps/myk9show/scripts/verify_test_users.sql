-- Verify test users were created correctly
-- Run this after creating the test users

-- Check that all test users exist in the user table
SELECT 
    'User Table Check' as check_type,
    u.email,
    u.first_name,
    u.last_name,
    u.roles,
    CASE 
        WHEN u.id IS NOT NULL THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END as status
FROM (
    VALUES 
        ('testadmin@example.com'),
        ('testsecretary@example.com'),
        ('testjudge@example.com'),
        ('testclubadmin@example.com'),
        ('testexhibitor@example.com')
) AS expected_users(email)
LEFT JOIN public.user u ON u.email = expected_users.email
ORDER BY u.email;

-- Check role assignments
SELECT 
    'Role Assignment Check' as check_type,
    u.email,
    r.name as role_name,
    ur.scope_type,
    ur.scope_id,
    ur.is_active,
    CASE 
        WHEN ur.id IS NOT NULL THEN '✅ ASSIGNED'
        ELSE '❌ MISSING'
    END as status
FROM public.user u
LEFT JOIN public.user_role ur ON u.id = ur.user_id
LEFT JOIN public.role r ON ur.role_id = r.id
WHERE u.email LIKE 'test%@example.com'
ORDER BY u.email, r.name;

-- Summary count
SELECT 
    'Summary' as check_type,
    COUNT(*) as total_test_users,
    COUNT(CASE WHEN array_length(roles, 1) > 0 THEN 1 END) as users_with_roles,
    COUNT(DISTINCT ur.user_id) as users_with_role_assignments
FROM public.user u
LEFT JOIN public.user_role ur ON u.id = ur.user_id
WHERE u.email LIKE 'test%@example.com';

-- Check auth.users table (if accessible)
-- This might not work depending on RLS policies
SELECT 
    'Auth Users Check' as check_type,
    email,
    email_confirmed_at IS NOT NULL as is_confirmed,
    created_at
FROM auth.users 
WHERE email LIKE 'test%@example.com'
ORDER BY email;