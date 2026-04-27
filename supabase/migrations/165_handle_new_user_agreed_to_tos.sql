-- Migration 165: Set agreed_to_tos_at in handle_new_user trigger
--
-- Problem: the trigger created the people row without agreed_to_tos_at. The JS
-- code in useAuth.ts tried to set it client-side after signUp(), but that call
-- runs before email confirmation, so there is no active session and Supabase
-- rejects the INSERT with a 42501 RLS violation. The field was never populated.
--
-- Fix: include agreed_to_tos_at = NOW() in both paths of handle_new_user()
-- (new-person insert + link-existing-person update). The trigger fires at auth
-- user creation, which requires completing the sign-up form and checking TOS.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  existing_person_id UUID;
  new_person_id      UUID;
  exhibitor_role_id  UUID;
BEGIN
  -- Resolve the exhibitor role id once
  SELECT id INTO exhibitor_role_id
    FROM public.roles
    WHERE name = 'exhibitor';

  -- Check for an existing non-deleted people row with the same email.
  -- Only match rows not yet linked to an auth account.
  SELECT id INTO existing_person_id
    FROM public.people
    WHERE LOWER(email) = LOWER(NEW.email)
      AND auth_user_id IS NULL
      AND deleted_at IS NULL
    LIMIT 1;

  IF existing_person_id IS NOT NULL THEN
    -- Link path: existing secretary-created person is signing up.
    -- Signup form data is more authoritative than secretary data entry.
    UPDATE public.people SET
      auth_user_id    = NEW.id,
      first_name      = COALESCE(NEW.raw_user_meta_data->>'first_name', first_name),
      last_name       = COALESCE(NEW.raw_user_meta_data->>'last_name', last_name),
      phone           = COALESCE(NEW.raw_user_meta_data->>'phone', phone),
      agreed_to_tos_at = COALESCE(agreed_to_tos_at, NOW()),
      updated_at      = now()
    WHERE id = existing_person_id;

    new_person_id := existing_person_id;
  ELSE
    -- New person path: no existing match, create a fresh people row.
    INSERT INTO public.people (
      first_name,
      last_name,
      email,
      phone,
      auth_user_id,
      agreed_to_tos_at
    ) VALUES (
      COALESCE(NEW.raw_user_meta_data->>'first_name', 'Unknown'),
      COALESCE(NEW.raw_user_meta_data->>'last_name', 'User'),
      NEW.email,
      NEW.raw_user_meta_data->>'phone',
      NEW.id,
      NOW()
    )
    RETURNING id INTO new_person_id;
  END IF;

  -- Create exhibitor_profiles (unique index on auth_user_id keeps this idempotent)
  INSERT INTO public.exhibitor_profiles (person_id, auth_user_id)
  VALUES (new_person_id, NEW.id)
  ON CONFLICT (auth_user_id) DO NOTHING;

  -- Assign exhibitor role (handles both new-person and link paths)
  IF exhibitor_role_id IS NOT NULL THEN
    UPDATE public.user_roles
      SET is_active = true
      WHERE user_id  = new_person_id
        AND role_id  = exhibitor_role_id
        AND club_id  IS NULL
        AND show_id  IS NULL;

    IF NOT FOUND THEN
      INSERT INTO public.user_roles (user_id, role_id, is_active)
      VALUES (new_person_id, exhibitor_role_id, true);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
