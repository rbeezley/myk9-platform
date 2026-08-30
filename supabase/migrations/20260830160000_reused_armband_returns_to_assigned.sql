-- A released armband must return to ASSIGNED the moment it is reused.
--
-- Codex review of #1879 (P1). 20260830140000 made a soft-deleted dog's armband
-- available again while KEEPING `dog_id`, so the number could be reclaimed. What
-- it did not do is close the other half: every path that reclaims the row finds
-- it by (show_id, dog_id) and returns its number WITHOUT clearing
-- `is_available`.
--
--   * assign_armband's fast path: `SELECT ... IF v_existing IS NOT NULL THEN
--     RETURN v_existing` — a pure read.
--   * auto_assign_armband_on_accept: `IF v_armband IS NULL THEN ... END IF` —
--     the found branch touches nothing, and even its ON CONFLICT DO UPDATE sets
--     only armband_number and assigned_at.
--
-- So a restored dog would carry number 101 while the ledger row still said the
-- number was free — and `ReplicatedArmbandsTable` pulls with
-- `.eq('is_available', false)`, so that armband would never reach the ringside
-- offline store. Show day would show the dog with no armband while the entry row
-- claimed one. That is a worse failure than the stale assignment the release was
-- fixing, and it is reachable by the ordinary restore-then-run path.
--
-- Three functions, so the state is correct however the row is reclaimed:
--   1. restore_dog        — re-marks on restore, the primary path, so the
--                           armband is right immediately rather than at the next
--                           acceptance.
--   2. assign_armband     — re-marks on its fast path.
--   3. auto_assign_...    — re-marks on the found branch and in ON CONFLICT.
--
-- Each re-mark is guarded (`is_available IS DISTINCT FROM FALSE`) so an
-- already-assigned row is not rewritten — the fast path stays a no-op write.
--
-- No backfill: verified 0 rows are currently released with a live dog. The
-- window between 20260830140000 and this migration contained no restores.

-- ---------------------------------------------------------------------------
-- 1. restore_dog — bring the armband back with the dog.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_dog(p_dog_id uuid)
RETURNS SETOF public.dogs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted_at timestamptz;
BEGIN
  IF NOT (SELECT public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT deleted_at INTO v_deleted_at FROM public.dogs WHERE id = p_dog_id;
  IF v_deleted_at IS NULL THEN
    RAISE EXCEPTION 'Dog not found or not deleted' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.dogs
  SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW()
  WHERE id = p_dog_id;

  UPDATE public.entries
  SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW()
  WHERE dog_id = p_dog_id AND deleted_at = v_deleted_at;

  -- The dog keeps the number soft_delete_dog released (dog_id was deliberately
  -- preserved for exactly this), so restoring it is re-marking the row assigned.
  UPDATE public.armbands
  SET is_available = FALSE, assigned_at = COALESCE(assigned_at, NOW())
  WHERE dog_id = p_dog_id
    AND is_available IS DISTINCT FROM FALSE;

  RETURN QUERY SELECT * FROM public.dogs WHERE id = p_dog_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. assign_armband — the fast path reclaims, so it must re-mark.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_armband(p_show_id uuid, p_dog_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
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
    -- The row may have been RELEASED by soft_delete_dog and the dog since
    -- restored. Returning the number while the row still reads "available"
    -- hides the armband from the ringside replication pull.
    -- Guarded, so an already-assigned row is not rewritten and the fast path
    -- stays free of write churn.
    UPDATE public.armbands
    SET is_available = FALSE, assigned_at = COALESCE(assigned_at, NOW())
    WHERE show_id = p_show_id
      AND dog_id = p_dog_id
      AND is_available IS DISTINCT FROM FALSE;

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

-- ---------------------------------------------------------------------------
-- 3. auto_assign_armband_on_accept — same reclaim, on the acceptance trigger.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_assign_armband_on_accept()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_armband text;
  v_next_num integer;
  v_start_num integer;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.entry_status NOT IN ('accepted', 'confirmed') THEN
    RETURN NEW;
  END IF;
  IF OLD.entry_status IN ('accepted', 'confirmed') THEN
    RETURN NEW;
  END IF;

  IF NEW.dog_id IS NULL OR NEW.show_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.show_id::text));

  SELECT COALESCE(starting_armband_number, 100) INTO v_start_num
  FROM shows
  WHERE id = NEW.show_id
  FOR UPDATE;

  IF v_start_num IS NULL THEN
    v_start_num := 100;
  END IF;

  SELECT armband_number INTO v_armband
  FROM armbands
  WHERE show_id = NEW.show_id AND dog_id = NEW.dog_id;

  IF v_armband IS NULL THEN
    SELECT COALESCE(
      MAX(CASE WHEN armband_number ~ '^[0-9]+$' THEN armband_number::integer END),
      v_start_num - 1
    ) + 1 INTO v_next_num
    FROM armbands
    WHERE show_id = NEW.show_id;

    v_armband := v_next_num::text;

    INSERT INTO armbands (show_id, dog_id, armband_number, assigned_at, is_available)
    VALUES (NEW.show_id, NEW.dog_id, v_armband, NOW(), FALSE)
    ON CONFLICT (show_id, dog_id) DO UPDATE
      SET armband_number = EXCLUDED.armband_number,
          assigned_at    = EXCLUDED.assigned_at,
          -- Without this a released row survives the upsert still marked
          -- available, which is the same hidden-from-ringside failure.
          is_available   = FALSE;
  ELSE
    -- Reclaiming an existing row: it may have been released by soft_delete_dog.
    UPDATE armbands
    SET is_available = FALSE, assigned_at = COALESCE(assigned_at, NOW())
    WHERE show_id = NEW.show_id
      AND dog_id = NEW.dog_id
      AND is_available IS DISTINCT FROM FALSE;
  END IF;

  UPDATE entries
  SET armband     = v_armband,
      updated_at  = NOW()
  WHERE show_id    = NEW.show_id
    AND dog_id     = NEW.dog_id
    AND id         <> NEW.id
    AND deleted_at IS NULL
    AND armband IS DISTINCT FROM v_armband;

  NEW.armband := v_armband;

  RETURN NEW;
END;
$$;

-- Grant decisions restated to match the live ACLs exactly. This migration edits
-- function BODIES; narrowing anyone's access belongs in a deliberate ACL sweep,
-- not a bug fix. `auto_assign_armband_on_accept` keeps its pre-existing anon
-- grant for that reason and is keep-listed in the grant-decision contract.
REVOKE ALL ON FUNCTION public.restore_dog(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_dog(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.restore_dog(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.assign_armband(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_armband(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.assign_armband(uuid, uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.auto_assign_armband_on_accept() TO authenticated;
