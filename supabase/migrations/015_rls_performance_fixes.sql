-- =============================================================================
-- Migration 015: RLS Performance and Security Fixes
-- =============================================================================
-- Addresses issues identified in DATABASE-AUDIT.md:
-- 1. Add STABLE and SET search_path to security definer functions
-- 2. Add composite indexes for common query patterns
-- 3. Add partial indexes for soft-deleted records
--
-- ROLLBACK:
-- DROP INDEX IF EXISTS entries_class_status_idx;
-- DROP INDEX IF EXISTS entries_show_status_idx;
-- DROP INDEX IF EXISTS entries_active_class_idx;
-- DROP INDEX IF EXISTS shows_active_club_idx;
-- DROP INDEX IF EXISTS dogs_active_owner_idx;
-- DROP INDEX IF EXISTS classes_active_trial_idx;
-- DROP INDEX IF EXISTS trials_active_show_idx;
-- (Functions would need to be restored to previous versions)
-- =============================================================================

-- =============================================================================
-- FIX 1: Add STABLE and search_path to get_license_key()
-- =============================================================================
-- Without STABLE, the query optimizer can't cache the result
-- Without search_path = '', there's potential for search path injection

CREATE OR REPLACE FUNCTION get_license_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  RETURN COALESCE(
    current_setting('request.headers', true)::json->>'x-license-key',
    current_setting('app.license_key', true),
    NULL
  );
END;
$$;

-- =============================================================================
-- FIX 2: Add search_path to has_role()
-- =============================================================================
-- Already has STABLE, just needs search_path for security

CREATE OR REPLACE FUNCTION public.has_role(role_name TEXT, scope_club_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    JOIN public.people p ON p.id = ur.user_id
    WHERE p.auth_user_id = auth.uid()
      AND r.name = role_name
      AND (scope_club_id IS NULL OR ur.club_id = scope_club_id OR ur.club_id IS NULL)
      AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
  );
$$;

-- =============================================================================
-- FIX 3: Add search_path to handle_new_user()
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_person_id UUID;
  exhibitor_role_id UUID;
BEGIN
  -- Get the exhibitor role ID
  SELECT id INTO exhibitor_role_id FROM public.roles WHERE name = 'exhibitor';

  -- Create person record from auth metadata
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

  -- Create exhibitor profile
  INSERT INTO public.exhibitor_profiles (
    person_id,
    auth_user_id
  ) VALUES (
    new_person_id,
    NEW.id
  );

  -- Assign exhibitor role (if role exists)
  IF exhibitor_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (new_person_id, exhibitor_role_id);
  END IF;

  RETURN NEW;
END;
$$;

-- =============================================================================
-- FIX 4: Add search_path to get_user_permissions()
-- =============================================================================
-- Must drop first because parameter name changed from original

DROP FUNCTION IF EXISTS public.get_user_permissions(UUID);

CREATE OR REPLACE FUNCTION public.get_user_permissions(p_user_id UUID)
RETURNS TABLE (
  permission_code TEXT,
  permission_name TEXT,
  category TEXT,
  role_name TEXT,
  club_id UUID,
  show_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    p.code as permission_code,
    p.name as permission_name,
    p.category,
    r.name as role_name,
    ur.club_id,
    ur.show_id
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  JOIN public.role_permissions rp ON rp.role_id = r.id
  JOIN public.permissions p ON p.id = rp.permission_id
  JOIN public.people pe ON pe.id = ur.user_id
  WHERE pe.auth_user_id = p_user_id
    AND (ur.expires_at IS NULL OR ur.expires_at > NOW());
END;
$$;

-- =============================================================================
-- FIX 5: Add search_path to check_class_availability()
-- =============================================================================

CREATE OR REPLACE FUNCTION check_class_availability(p_class_id UUID)
RETURNS TABLE (
  available_spots INTEGER,
  is_available BOOLEAN,
  waitlist_position INTEGER,
  entry_limit INTEGER,
  confirmed_count INTEGER
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_class_limit INTEGER;
  v_confirmed_count INTEGER;
  v_waitlist_count INTEGER;
BEGIN
  -- Get class limit
  SELECT c.entry_limit INTO v_class_limit
  FROM public.classes c
  WHERE c.id = p_class_id;

  v_class_limit := COALESCE(v_class_limit, 0);

  -- Count confirmed entries
  SELECT COUNT(*) INTO v_confirmed_count
  FROM public.entries e
  WHERE e.class_id = p_class_id
    AND e.entry_status IN ('submitted', 'paid', 'confirmed', 'checked-in', 'competing')
    AND e.deleted_at IS NULL;

  -- Count active waitlist entries
  SELECT COUNT(*) INTO v_waitlist_count
  FROM public.waitlist_entries we
  WHERE we.class_id = p_class_id
    AND we.status = 'waiting';

  -- Calculate results
  available_spots := GREATEST(0, v_class_limit - v_confirmed_count);
  is_available := available_spots > 0;
  waitlist_position := v_waitlist_count + 1;
  entry_limit := v_class_limit;
  confirmed_count := v_confirmed_count;

  RETURN NEXT;
END;
$$;

-- =============================================================================
-- FIX 6: Add search_path to add_to_waitlist()
-- =============================================================================

CREATE OR REPLACE FUNCTION add_to_waitlist(
  p_class_id UUID,
  p_exhibitor_id UUID,
  p_dog_id UUID,
  p_handler_id UUID DEFAULT NULL
)
RETURNS public.waitlist_entries
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  next_position INTEGER;
  new_entry public.waitlist_entries;
BEGIN
  -- Lock the class row to prevent race conditions
  PERFORM pg_advisory_xact_lock(hashtext(p_class_id::text));

  -- Get next position
  SELECT COALESCE(MAX(position), 0) + 1 INTO next_position
  FROM public.waitlist_entries
  WHERE class_id = p_class_id AND status = 'waiting';

  -- Insert new entry
  INSERT INTO public.waitlist_entries (class_id, exhibitor_id, dog_id, handler_id, position)
  VALUES (p_class_id, p_exhibitor_id, p_dog_id, p_handler_id, next_position)
  RETURNING * INTO new_entry;

  RETURN new_entry;
END;
$$;

-- =============================================================================
-- FIX 7: Composite indexes for common query patterns
-- =============================================================================

-- Entries by class + status (scoring queries)
CREATE INDEX IF NOT EXISTS entries_class_status_idx ON entries(class_id, entry_status);

-- Entries by show + status (show management)
CREATE INDEX IF NOT EXISTS entries_show_status_idx ON entries(show_id, entry_status);

-- Entries by class + result status (results queries)
CREATE INDEX IF NOT EXISTS entries_class_result_idx ON entries(class_id, result_status);

-- Waitlist by class + status
CREATE INDEX IF NOT EXISTS waitlist_class_status_idx ON waitlist_entries(class_id, status);

-- User roles by user + role (for has_role lookups)
CREATE INDEX IF NOT EXISTS user_roles_user_role_idx ON user_roles(user_id, role_id);

-- =============================================================================
-- FIX 8: Partial indexes for soft-deleted records
-- =============================================================================
-- These indexes only include active (non-deleted) records, making common
-- queries much faster while keeping the index small

-- Active entries by class
CREATE INDEX IF NOT EXISTS entries_active_class_idx
  ON entries(class_id)
  WHERE deleted_at IS NULL;

-- Active entries by show
CREATE INDEX IF NOT EXISTS entries_active_show_idx
  ON entries(show_id)
  WHERE deleted_at IS NULL;

-- Active shows by club
CREATE INDEX IF NOT EXISTS shows_active_club_idx
  ON shows(club_id)
  WHERE deleted_at IS NULL;

-- Active dogs by owner
CREATE INDEX IF NOT EXISTS dogs_active_owner_idx
  ON dogs(owner_id)
  WHERE deleted_at IS NULL;

-- Active classes by trial
CREATE INDEX IF NOT EXISTS classes_active_trial_idx
  ON classes(trial_id)
  WHERE deleted_at IS NULL;

-- Active trials by show
CREATE INDEX IF NOT EXISTS trials_active_show_idx
  ON trials(show_id)
  WHERE deleted_at IS NULL;

-- =============================================================================
-- SUCCESS
-- =============================================================================
SELECT 'Migration 015: RLS performance fixes applied successfully' as status;
