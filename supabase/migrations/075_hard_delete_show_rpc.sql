-- =============================================================================
-- Migration 075: Add hard_delete_show RPC for permanent deletion (site admin only)
--
-- Permanently deletes a show and all child records (entries, cart items, carts,
-- classes, trials) in FK-safe order. Restricted to site_admin role.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.hard_delete_show(p_show_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Permission check: site_admin only
  IF NOT (SELECT is_platform_admin()) THEN
    RAISE EXCEPTION 'Permission denied: only site administrators can permanently delete shows'
      USING ERRCODE = '42501';
  END IF;

  -- Verify show exists
  IF NOT EXISTS (SELECT 1 FROM shows WHERE id = p_show_id) THEN
    RAISE EXCEPTION 'Show not found' USING ERRCODE = '42501';
  END IF;

  -- Delete in FK-safe order (deepest children first)

  -- 1. Delete entries (references classes)
  DELETE FROM entries
  WHERE class_id IN (
    SELECT c.id FROM classes c
    JOIN trials t ON c.trial_id = t.id
    WHERE t.show_id = p_show_id
  );

  -- 2. Delete waitlist entries (references classes)
  DELETE FROM waitlist_entries
  WHERE class_id IN (
    SELECT c.id FROM classes c
    JOIN trials t ON c.trial_id = t.id
    WHERE t.show_id = p_show_id
  );

  -- 3. Delete cart items (references classes)
  DELETE FROM entry_cart_items
  WHERE class_id IN (
    SELECT c.id FROM classes c
    JOIN trials t ON c.trial_id = t.id
    WHERE t.show_id = p_show_id
  );

  -- 4. Delete carts (references shows)
  DELETE FROM entry_carts WHERE show_id = p_show_id;

  -- 5. Delete classes (references trials)
  DELETE FROM classes
  WHERE trial_id IN (SELECT id FROM trials WHERE show_id = p_show_id);

  -- 6. Delete judge assignments (references shows)
  DELETE FROM judge_assignments WHERE show_id = p_show_id;

  -- 7. Delete trials (references shows)
  DELETE FROM trials WHERE show_id = p_show_id;

  -- 8. Delete the show
  DELETE FROM shows WHERE id = p_show_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hard_delete_show(UUID) TO authenticated;
