-- =============================================================================
-- Migration 118: Self-check-in RPC + tighten entries UPDATE policy
--
-- Problems fixed:
--
-- Migration 117 added an entries UPDATE handler clause that allows a handler
-- to update ANY column on their own entry (handler_id match). This is too
-- broad — a handler should only be able to set check_in_status via
-- self-check-in, not mutate run_order, scoring fields, etc.
--
-- Fix:
--   1. Create self_checkin_entry() SECURITY DEFINER RPC that validates:
--      - Caller is the handler of the entry (via people.auth_user_id)
--      - new_status is within exhibitor-allowed values
--      - Only updates check_in_status (no other columns)
--   2. Drop the handler clause from entries_update policy — secretaries
--      and site_admins handle all other entry mutations via direct UPDATE.
-- =============================================================================

-- -------------------------------------------------------------------------
-- 1. Self-check-in RPC (SECURITY DEFINER — runs as owner, not caller)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION self_checkin_entry(
  p_entry_id UUID,
  p_new_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_handler_id UUID;
  v_allowed_statuses TEXT[] := ARRAY[
    'checked-in', 'conflict', 'pulled', 'at-gate', 'no-status'
  ];
BEGIN
  -- Validate status is in exhibitor-allowed list
  IF p_new_status != ALL(v_allowed_statuses) THEN
    RAISE EXCEPTION 'Status % is not allowed for self-check-in', p_new_status;
  END IF;

  -- Verify caller is the handler of this entry
  SELECT e.handler_id INTO v_handler_id
  FROM entries e
  JOIN people p ON p.id = e.handler_id
  WHERE e.id = p_entry_id
    AND p.auth_user_id = auth.uid();

  IF v_handler_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: caller is not the handler of entry %', p_entry_id;
  END IF;

  -- Update only check_in_status
  UPDATE entries
  SET check_in_status = p_new_status,
      updated_at = now()
  WHERE id = p_entry_id;
END;
$$;

-- Grant execute to authenticated users only
REVOKE ALL ON FUNCTION self_checkin_entry(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION self_checkin_entry(UUID, TEXT) TO authenticated;

-- -------------------------------------------------------------------------
-- 2. Remove handler clause from entries UPDATE policy
--    Handlers now use self_checkin_entry() RPC instead of direct UPDATE.
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "entries_update" ON entries;

CREATE POLICY "entries_update" ON entries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM people p
      JOIN user_roles ur ON ur.user_id = p.id
      JOIN roles r ON r.id = ur.role_id
      WHERE p.auth_user_id = auth.uid()
        AND r.name IN ('secretary', 'site_admin')
        AND ur.is_active = TRUE
        AND (ur.show_id IS NULL OR ur.show_id = entries.show_id)
    )
  );

NOTIFY pgrst, 'reload schema';
