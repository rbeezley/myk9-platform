-- =============================================================================
-- Migration 083: SA-007 — Add auth check to assign_armband()
--
-- HIGH: SECURITY DEFINER function had no authorization check, allowing any
-- caller to assign armbands to any dog at any show. Now requires
-- can_manage_show() (club_admin, secretary, or platform_admin).
-- Also adds SET search_path = '' per Supabase best practices.
-- =============================================================================

CREATE OR REPLACE FUNCTION assign_armband(p_show_id UUID, p_dog_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing INTEGER;
  v_next INTEGER;
  v_start INTEGER;
BEGIN
  -- Authorization: only show managers can assign armbands
  IF NOT (SELECT public.can_manage_show(p_show_id)) THEN
    RAISE EXCEPTION 'Not authorized to assign armbands for this show';
  END IF;

  -- Check if this dog already has an armband for this show (fast path, no lock)
  SELECT armband_number::int INTO v_existing
  FROM public.armbands
  WHERE show_id = p_show_id AND dog_id = p_dog_id
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Lock the show row to serialize concurrent assignments.
  -- Note: the UNIQUE(show_id, dog_id) constraint protects against the TOCTOU
  -- window between the check above and the INSERT below — a concurrent duplicate
  -- will fail with a unique violation, which the client's try/catch handles.
  SELECT starting_armband_number INTO v_start
  FROM public.shows
  WHERE id = p_show_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Show % not found', p_show_id;
  END IF;

  -- Compute next available number (only consider numeric armband values)
  SELECT COALESCE(
    MAX(CASE WHEN armband_number ~ '^\d+$' THEN armband_number::int END),
    v_start - 1
  ) + 1
  INTO v_next
  FROM public.armbands
  WHERE show_id = p_show_id;

  -- Insert the assignment (entry_id omitted — armband is per-dog, not per-entry).
  -- is_available = FALSE means this armband is assigned and not available for reassignment.
  INSERT INTO public.armbands (show_id, dog_id, armband_number, assigned_at, is_available)
  VALUES (p_show_id, p_dog_id, v_next::text, NOW(), FALSE);

  RETURN v_next;
END;
$$;

-- Restrict execution to authenticated users only
REVOKE ALL ON FUNCTION assign_armband(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION assign_armband(UUID, UUID) TO authenticated;
