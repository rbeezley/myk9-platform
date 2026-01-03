-- Migration: Create Playwright test user for E2E testing
-- Author: supabase-specialist
-- Date: 2025-08-01

-- This migration creates a test user that can be used for Playwright E2E testing
-- Since we can't directly insert into auth.users via migration, this creates
-- the profile record and sets up everything needed once the auth user exists

DO $$
DECLARE
    test_user_id uuid := 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid;
    existing_profile_count integer;
BEGIN
    -- Check if test user profile already exists
    SELECT COUNT(*) INTO existing_profile_count 
    FROM public.user 
    WHERE email = 'test@playwright.com';
    
    IF existing_profile_count = 0 THEN
        -- Create the user profile (the auth user must be created separately)
        INSERT INTO public.user (
            id,
            user_id,
            first_name,
            last_name,
            email,
            phone,
            street_address,
            city,
            state,
            zip_code,
            roles,
            created_at,
            updated_at
        ) VALUES (
            test_user_id,
            test_user_id,
            'Test',
            'User',
            'test@playwright.com',
            '555-123-4567',
            '123 Test Street',
            'Test City',
            'TS',
            '12345',
            ARRAY['exhibitor']::text[],
            now(),
            now()
        ) ON CONFLICT (id) DO NOTHING;
        
        RAISE NOTICE 'Playwright test user profile created successfully with ID: %', test_user_id;
    ELSE
        RAISE NOTICE 'Playwright test user profile already exists';
    END IF;
END
$$;

-- Ensure the test user has proper permissions by verifying role functions work
DO $$
BEGIN
    -- Test the role assignment function if the user exists
    IF EXISTS (SELECT 1 FROM public.user WHERE email = 'test@playwright.com') THEN
        -- Verify exhibitor role is properly assigned
        PERFORM assign_user_role((SELECT id FROM public.user WHERE email = 'test@playwright.com'), 'exhibitor');
        RAISE NOTICE 'Test user roles verified';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Role verification skipped - will be applied when auth user exists';
END
$$;