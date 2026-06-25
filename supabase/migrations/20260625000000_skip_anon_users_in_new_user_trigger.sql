-- =============================================================================
-- Migration 20260625000000: skip ANONYMOUS users in the new-user triggers
--
-- Plan: docs/plan-ringside-entries-read-authz.md (Phase E, prevention).
--
-- Context: enabling anonymous sign-ins for passcode ringside (Phase C/D) exposed
-- a latent bug in the new-user triggers. `handle_new_user()` and
-- `materialize_club_access_request_from_auth_user()` both fire AFTER INSERT on
-- auth.users for EVERY new user — including anonymous ones. For an anon user
-- handle_new_user() creates a `people` row (email NULL, name 'Unknown User'),
-- an `exhibitor_profiles` row, and an exhibitor `user_roles` row.
--
-- Two harms:
--   1. Pollution: an anonymous ringside session is a transient device identity,
--      not a person/exhibitor. These rows dirty core tables — `people` is the
--      PII/directory table (counts, lookups, RLS surface).
--   2. Un-deletable: `people` and `exhibitor_profiles` are NO-ACTION (confdeltype
--      'a') FK children of auth.users, so the anon auth user can never be
--      hard-deleted while they exist (GoTrue admin hard-delete returns 500). This
--      is exactly what blocks the Phase E stale-anon cleanup.
--
-- Fix (prevention): early-return from both trigger functions when
-- NEW.is_anonymous. The at-show authorization never needs an anon person row —
-- `ringside_update_entry` resolves the caller person as NULL for passcode claims
-- and authorizes off the JWT app_metadata claim instead, and the read view's
-- claim tier is likewise JWT-based. Presence uses the client grant's sessionId.
-- So skipping person/profile/role creation for anon users breaks nothing and
-- leaves anon auth users with only auth.* (cascade) children — cleanly deletable.
--
-- Both functions are re-emitted verbatim from their live definitions; the ONLY
-- change is the `IF NEW.is_anonymous THEN RETURN NEW; END IF;` guard added at the
-- top, before any row is created. The non-anonymous path is byte-for-byte
-- unchanged.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  existing_person_id UUID;
  new_person_id      UUID;
  exhibitor_role_id  UUID;
BEGIN
  -- Anonymous users are transient ringside passcode device sessions (enabled for
  -- offline at-show scoring), NOT people/exhibitors. Skip all person/profile/role/
  -- role-request creation so they don't pollute core tables and remain cascade-
  -- deletable. See migration header for the full rationale.
  IF NEW.is_anonymous THEN
    RETURN NEW;
  END IF;

  SELECT id INTO exhibitor_role_id
    FROM public.roles
    WHERE name = 'exhibitor';

  SELECT id INTO existing_person_id
    FROM public.people
    WHERE LOWER(email) = LOWER(NEW.email)
      AND auth_user_id IS NULL
      AND deleted_at IS NULL
    LIMIT 1;

  IF existing_person_id IS NOT NULL THEN
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

  INSERT INTO public.exhibitor_profiles (person_id, auth_user_id)
  VALUES (new_person_id, NEW.id)
  ON CONFLICT (auth_user_id) DO NOTHING;

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

  PERFORM public.insert_signup_role_requests(
    NEW.id,
    new_person_id,
    COALESCE(NEW.raw_user_meta_data->'intended_roles', '[]'::jsonb)
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.materialize_club_access_request_from_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_person_id uuid;
begin
  -- Skip anonymous (ringside passcode) sessions — they have no person row and no
  -- club-access intent. See handle_new_user for the rationale.
  if new.is_anonymous then
    return new;
  end if;

  select id into v_person_id
  from public.people
  where auth_user_id = new.id
  limit 1;

  if v_person_id is null then
    return new;
  end if;

  perform public.insert_club_access_request_from_signup(
    v_person_id,
    new.id,
    new.raw_user_meta_data
  );

  return new;
end;
$function$;
