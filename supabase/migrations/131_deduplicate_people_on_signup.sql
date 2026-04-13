-- Migration 131: Deduplicate people rows on auth signup
--
-- Problem: when a secretary creates a mail-in entry, a people row is inserted
-- with auth_user_id = NULL. If that person later signs up with the same email
-- address, the on_auth_user_created trigger previously always inserted a new
-- people row, splitting the person's history across two identities.
--
-- Fix:
--   1. Add a partial case-insensitive unique index on people.email so the DB
--      enforces uniqueness going forward.
--   2. Replace handle_new_user() to check for an existing people row by email
--      before inserting. On match: link the row and update name/phone from the
--      signup form. On no match: existing insert behavior.

-- ==========================================================================
-- 1. Unique index on people.email
-- ==========================================================================

-- Partial: allows NULL email (mail-in entries without email can still coexist)
-- Partial: excludes soft-deleted rows (a deleted person's email can be reused)
-- LOWER(): case-insensitive so John@gmail.com and john@gmail.com match
CREATE UNIQUE INDEX people_email_unique
  ON public.people(LOWER(email))
  WHERE email IS NOT NULL AND deleted_at IS NULL;

-- ==========================================================================
-- 2. Updated handle_new_user trigger function
-- ==========================================================================

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
  -- Only match rows that have not yet been linked to an auth account so we
  -- don't accidentally stomp a row that belongs to a different auth user.
  SELECT id INTO existing_person_id
    FROM public.people
    WHERE LOWER(email) = LOWER(NEW.email)
      AND auth_user_id IS NULL
      AND deleted_at IS NULL
    LIMIT 1;

  IF existing_person_id IS NOT NULL THEN
    -- -----------------------------------------------------------------------
    -- Link path: existing secretary-created person is signing up
    -- -----------------------------------------------------------------------
    -- Signup form data is more authoritative than secretary data entry.
    -- COALESCE keeps existing value if signup metadata field is absent.
    UPDATE public.people SET
      auth_user_id = NEW.id,
      first_name   = COALESCE(NEW.raw_user_meta_data->>'first_name', first_name),
      last_name    = COALESCE(NEW.raw_user_meta_data->>'last_name', last_name),
      phone        = COALESCE(NEW.raw_user_meta_data->>'phone', phone),
      updated_at   = now()
    WHERE id = existing_person_id;

    new_person_id := existing_person_id;
  ELSE
    -- -----------------------------------------------------------------------
    -- New person path: no existing match, create a fresh people row
    -- -----------------------------------------------------------------------
    INSERT INTO public.people (
      first_name,
      last_name,
      email,
      phone,
      auth_user_id
    ) VALUES (
      COALESCE(NEW.raw_user_meta_data->>'first_name', 'Unknown'),
      COALESCE(NEW.raw_user_meta_data->>'last_name', 'User'),
      NEW.email,
      NEW.raw_user_meta_data->>'phone',
      NEW.id
    )
    RETURNING id INTO new_person_id;
  END IF;

  -- -------------------------------------------------------------------------
  -- Shared: create exhibitor_profiles and assign exhibitor role
  -- (both paths need these; use idempotent inserts)
  -- -------------------------------------------------------------------------

  -- exhibitor_profiles has a unique index on auth_user_id
  INSERT INTO public.exhibitor_profiles (person_id, auth_user_id)
  VALUES (new_person_id, NEW.id)
  ON CONFLICT (auth_user_id) DO NOTHING;

  -- user_roles has an is_active column (migration 064, DEFAULT true).
  -- The unique constraint is (user_id, role_id, club_id, show_id) but PostgreSQL
  -- does not treat NULL = NULL in unique constraints, so ON CONFLICT won't fire
  -- reliably for global (non-club, non-show) roles. Use UPDATE + IF NOT FOUND:
  --   1. Try to activate an existing row (handles link path where role was
  --      assigned by the secretary but may be inactive).
  --   2. If no row matched the UPDATE, insert a fresh one.
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
