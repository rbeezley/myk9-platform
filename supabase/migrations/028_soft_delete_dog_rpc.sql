-- =============================================================================
-- Migration 028: Add soft_delete_dog RPC function
-- =============================================================================
-- Problem: The dogs_update RLS WITH CHECK policy blocks soft-deletes because
-- setting deleted_at = now() causes the new row to fail any policy that
-- implicitly or explicitly includes deleted_at IS NULL in its check.
--
-- Solution: A SECURITY DEFINER function that runs outside RLS, but still
-- enforces ownership within the function body before making the change.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.soft_delete_dog(p_dog_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person_id UUID;
  v_rows_affected INT;
BEGIN
  SELECT get_my_person_id() INTO v_person_id;

  UPDATE dogs
  SET
    deleted_at = NOW(),
    updated_at = NOW()
  WHERE
    id = p_dog_id
    AND deleted_at IS NULL
    AND (
      owner_id = v_person_id
      OR co_owner_id = v_person_id
      OR (SELECT is_platform_admin())
    );

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected = 0 THEN
    RAISE EXCEPTION 'Dog not found or permission denied' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.soft_delete_dog(UUID) TO authenticated;
