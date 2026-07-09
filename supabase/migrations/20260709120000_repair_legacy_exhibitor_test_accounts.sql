-- Repair legacy E2E exhibitor accounts (exhibitor1-5@myk9t.com).
--
-- Earlier seed repairs restored auth/users/profile rows for these test fixtures,
-- but staging drift left them without completed onboarding and without active
-- exhibitor user_roles. That makes authenticated exhibitor routes redirect to
-- /onboarding and breaks feature-audit specs that still opt into these accounts.
--
-- Safe to re-run. Existing auth passwords are not changed; missing auth users
-- are created with the historical TestPass1234! password used by migration 152.

DO $$
DECLARE
  v_accounts jsonb := '[
    {"auth_id":"a1000001-0000-0000-0000-000000000001","email":"exhibitor1@myk9t.com","first":"Alice","last":"Martin"},
    {"auth_id":"a1000002-0000-0000-0000-000000000002","email":"exhibitor2@myk9t.com","first":"Bob","last":"Chen"},
    {"auth_id":"a1000003-0000-0000-0000-000000000003","email":"exhibitor3@myk9t.com","first":"Carol","last":"Davis"},
    {"auth_id":"a1000004-0000-0000-0000-000000000004","email":"exhibitor4@myk9t.com","first":"Dan","last":"Okafor"},
    {"auth_id":"a1000005-0000-0000-0000-000000000005","email":"exhibitor5@myk9t.com","first":"Eva","last":"Torres"}
  ]';

  v_item jsonb;
  v_auth_id uuid;
  v_email text;
  v_first text;
  v_last text;
  v_person_id uuid;
  v_exhibitor_role_id uuid;
  v_pw_hash text;
BEGIN
  SELECT id INTO v_exhibitor_role_id
  FROM public.roles
  WHERE name = 'exhibitor'
  LIMIT 1;

  IF v_exhibitor_role_id IS NULL THEN
    RAISE EXCEPTION 'repair_legacy_exhibitor_test_accounts: missing exhibitor role';
  END IF;

  v_pw_hash := crypt('TestPass1234!', gen_salt('bf'));

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_accounts) LOOP
    v_auth_id := (v_item->>'auth_id')::uuid;
    v_email := v_item->>'email';
    v_first := v_item->>'first';
    v_last := v_item->>'last';

    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      is_sso_user,
      is_anonymous
    )
    VALUES (
      v_auth_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      v_email,
      v_pw_hash,
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('first_name', v_first, 'last_name', v_last),
      false,
      false,
      false
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO auth.identities (
      id,
      user_id,
      provider_id,
      provider,
      identity_data,
      created_at,
      updated_at,
      last_sign_in_at
    )
    VALUES (
      gen_random_uuid(),
      v_auth_id,
      v_auth_id::text,
      'email',
      jsonb_build_object(
        'sub', v_auth_id::text,
        'email', v_email,
        'email_verified', true,
        'phone_verified', false,
        'first_name', v_first,
        'last_name', v_last
      ),
      now(),
      now(),
      now()
    )
    ON CONFLICT (provider_id, provider) DO NOTHING;

    INSERT INTO public.people (first_name, last_name, email, auth_user_id)
    VALUES (v_first, v_last, v_email, v_auth_id)
    ON CONFLICT DO NOTHING;

    SELECT id INTO v_person_id
    FROM public.people
    WHERE lower(email) = lower(v_email)
    ORDER BY created_at NULLS LAST
    LIMIT 1;

    IF v_person_id IS NULL THEN
      RAISE EXCEPTION 'repair_legacy_exhibitor_test_accounts: missing people row for %', v_email;
    END IF;

    UPDATE public.people
    SET auth_user_id = v_auth_id
    WHERE id = v_person_id
      AND auth_user_id IS DISTINCT FROM v_auth_id;

    INSERT INTO public.exhibitor_profiles (
      person_id,
      auth_user_id,
      onboarding_completed_at
    )
    VALUES (
      v_person_id,
      v_auth_id,
      now()
    )
    ON CONFLICT (auth_user_id)
    DO UPDATE SET
      person_id = EXCLUDED.person_id,
      onboarding_completed_at = COALESCE(
        public.exhibitor_profiles.onboarding_completed_at,
        EXCLUDED.onboarding_completed_at
      ),
      updated_at = now();

    UPDATE public.user_roles
    SET
      auth_user_id = v_auth_id,
      is_active = true
    WHERE user_id = v_person_id
      AND role_id = v_exhibitor_role_id
      AND club_id IS NULL
      AND show_id IS NULL;

    INSERT INTO public.user_roles (
      user_id,
      auth_user_id,
      role_id,
      is_active
    )
    SELECT
      v_person_id,
      v_auth_id,
      v_exhibitor_role_id,
      true
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = v_person_id
        AND role_id = v_exhibitor_role_id
        AND club_id IS NULL
        AND show_id IS NULL
    );
  END LOOP;
END $$;
