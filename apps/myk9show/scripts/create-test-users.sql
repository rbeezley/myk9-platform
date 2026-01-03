-- Create Test Users Migration
-- This script creates test users that can be used for E2E testing
-- Run this manually in Supabase Dashboard > SQL Editor

-- First, let's create the users in the auth.users table (Supabase Auth)
-- Note: This needs to be run with elevated privileges in Supabase Dashboard

-- 1. Test Admin User (password: testpass123)
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  confirmation_token,
  email_confirm_token_sent_at
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  'test-admin@example.com',
  crypt('testpass123', gen_salt('bf')),
  now(),
  now(),
  now(),
  '',
  now()
) ON CONFLICT (id) DO NOTHING;

-- 2. Test Secretary User (password: testpass123)  
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  confirmation_token,
  email_confirm_token_sent_at
) VALUES (
  '22222222-2222-2222-2222-222222222222',
  'test-secretary@example.com',
  crypt('testpass123', gen_salt('bf')),
  now(),
  now(),
  now(),
  '',
  now()
) ON CONFLICT (id) DO NOTHING;

-- 3. Test Judge User (password: testpass123)
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  confirmation_token,
  email_confirm_token_sent_at
) VALUES (
  '33333333-3333-3333-3333-333333333333',
  'test-judge@example.com',
  crypt('testpass123', gen_salt('bf')),
  now(),
  now(),
  now(),
  '',
  now()
) ON CONFLICT (id) DO NOTHING;

-- 4. Test Exhibitor User (password: testpass123)
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  confirmation_token,
  email_confirm_token_sent_at
) VALUES (
  '44444444-4444-4444-4444-444444444444',
  'test-exhibitor@example.com',
  crypt('testpass123', gen_salt('bf')),
  now(),
  now(),
  now(),
  '',
  now()
) ON CONFLICT (id) DO NOTHING;

-- Now create corresponding records in public.user table
-- This mimics what the app does when users sign up

-- 1. Test Admin User
INSERT INTO public.user (
  first_name,
  last_name,
  email,
  roles,
  user_id
) VALUES (
  'Test',
  'Admin',
  'test-admin@example.com',
  ARRAY['admin']::text[],
  '11111111-1111-1111-1111-111111111111'
) ON CONFLICT (user_id) DO UPDATE SET
  email = EXCLUDED.email,
  roles = EXCLUDED.roles;

-- 2. Test Secretary User  
INSERT INTO public.user (
  first_name,
  last_name,
  email,
  roles,
  user_id
) VALUES (
  'Test',
  'Secretary',
  'test-secretary@example.com',
  ARRAY['secretary']::text[],
  '22222222-2222-2222-2222-222222222222'
) ON CONFLICT (user_id) DO UPDATE SET
  email = EXCLUDED.email,
  roles = EXCLUDED.roles;

-- 3. Test Judge User
INSERT INTO public.user (
  first_name,
  last_name,
  email,
  roles,
  user_id
) VALUES (
  'Test',
  'Judge',
  'test-judge@example.com',
  ARRAY['judge']::text[],
  '33333333-3333-3333-3333-333333333333'
) ON CONFLICT (user_id) DO UPDATE SET
  email = EXCLUDED.email,
  roles = EXCLUDED.roles;

-- 4. Test Exhibitor User
INSERT INTO public.user (
  first_name,
  last_name,
  email,
  roles,
  user_id
) VALUES (
  'Test',
  'Exhibitor',
  'test-exhibitor@example.com',
  ARRAY['exhibitor']::text[],
  '44444444-4444-4444-4444-444444444444'
) ON CONFLICT (user_id) DO UPDATE SET
  email = EXCLUDED.email,
  roles = EXCLUDED.roles;

-- Verify users were created
SELECT 
  au.id,
  au.email,
  au.email_confirmed_at,
  pu.first_name,
  pu.last_name,
  pu.roles
FROM auth.users au
LEFT JOIN public.user pu ON au.id = pu.user_id
WHERE au.email LIKE 'test-%@example.com'
ORDER BY au.email;