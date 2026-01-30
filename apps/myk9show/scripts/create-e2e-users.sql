-- E2E Test Users Setup
-- Run with: supabase db execute --file apps/myk9show/scripts/create-e2e-users.sql

-- Note: Auth users must be created via Supabase Dashboard or API
-- This script only creates/updates the public.user records

-- First, let's see what users already exist with e2e- prefix
SELECT user_id, email, first_name, last_name, roles
FROM "user"
WHERE email LIKE 'e2e-%@test.myk9.com';
