-- Seed five test exhibitor accounts for development/staging use.
-- Password for all accounts: TestPass1234!
-- Emails: exhibitor1@myk9t.com … exhibitor5@myk9t.com
--
-- The handle_new_user trigger fires on auth.users INSERT and automatically
-- creates the people row, exhibitor_profiles row, and user_roles assignment.
-- This migration only needs to insert into auth.users.
--
-- Idempotent: ON CONFLICT (id) DO NOTHING.

DO $$
DECLARE
  v_users jsonb := '[
    {"auth_id":"a1000001-0000-0000-0000-000000000001","email":"exhibitor1@myk9t.com","first":"Alice","last":"Martin"},
    {"auth_id":"a1000002-0000-0000-0000-000000000002","email":"exhibitor2@myk9t.com","first":"Bob","last":"Chen"},
    {"auth_id":"a1000003-0000-0000-0000-000000000003","email":"exhibitor3@myk9t.com","first":"Carol","last":"Davis"},
    {"auth_id":"a1000004-0000-0000-0000-000000000004","email":"exhibitor4@myk9t.com","first":"Dan","last":"Okafor"},
    {"auth_id":"a1000005-0000-0000-0000-000000000005","email":"exhibitor5@myk9t.com","first":"Eva","last":"Torres"}
  ]';

  v_item   jsonb;
  v_pw_hash text;
BEGIN
  v_pw_hash := crypt('TestPass1234!', gen_salt('bf'));

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_users) LOOP
    INSERT INTO auth.users (
      id, instance_id, aud, role,
      email, encrypted_password,
      email_confirmed_at,
      created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      is_super_admin, is_sso_user, is_anonymous
    )
    VALUES (
      (v_item->>'auth_id')::uuid,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      v_item->>'email',
      v_pw_hash,
      now(),
      now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('first_name', v_item->>'first', 'last_name', v_item->>'last'),
      false, false, false
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;
