-- Drop the armband half of the dog soft-delete cascade. Deliberate simplification.
--
-- 20260830140000 released a soft-deleted dog's armband; 20260830160000 then had
-- to teach THREE more functions to re-mark it assigned when the number was
-- reclaimed, because every reclaim path returns the existing row untouched.
-- Weighed honestly, that is a bad trade:
--
--   * The gain was narrow. Numbers are never recycled either way — assign_armband
--     always takes MAX+1 and a released row keeps its armband_number — and
--     `entries.armband` carries the number for history regardless. The only real
--     benefit was that a deleted dog's armband stopped syncing to ringside, and a
--     deleted dog has no live entries to appear against anyway.
--   * The cost was three functions on the SHOW-DAY path (assign_armband and the
--     acceptance trigger both run while a show is being run) carrying logic whose
--     only purpose was to undo the release.
--
-- So: soft_delete_dog stops touching armbands, and the three reclaim sites go
-- back to their exact pre-20260830160000 bodies. A deleted dog keeps its armband
-- assignment — a stale ledger row that nothing reads for a dog nothing shows.
--
-- The waitlist half of 20260830140000 STAYS. That one fixes a real bug: a deleted
-- dog left queued could still be promoted into a live entry. So does the MK002
-- refusal. This migration is scoped to armbands only.
--
-- Every function below carries its `SET search_path` clause INLINE. CREATE OR
-- REPLACE without it resets the setting to the default, which for
-- auto_assign_armband_on_accept (set by an ALTER in 20260712130000, not by its
-- CREATE) would silently undo a hardening fix.

-- ---------------------------------------------------------------------------
-- 1. soft_delete_dog — same as 20260830140000 minus the armband release.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soft_delete_dog(p_dog_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
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

  -- Refuse over money or results, BEFORE any cascade runs. Placed after the
  -- permission gate so an unauthorised caller still gets 42501 and learns
  -- nothing about the dog's entries. The RAISE aborts the function's
  -- transaction, so the UPDATE above is rolled back with it.
  IF EXISTS (
    SELECT 1
    FROM entries e
    WHERE e.dog_id = p_dog_id
      AND e.deleted_at IS NULL
      AND (
        e.payment_status = 'paid'
        OR e.is_scored IS TRUE
        OR e.scoring_completed_at IS NOT NULL
        OR (e.result_status IS NOT NULL AND e.result_status <> 'pending')
      )
  ) THEN
    RAISE EXCEPTION
      'This dog has paid or scored entries. Scratch or refund them before deleting.'
      USING ERRCODE = 'MK002';
  END IF;

  -- Cascade: soft-delete the dog's live entries so a deleted dog leaves no live
  -- entries behind in rosters/scoring.
  UPDATE entries
  SET
    deleted_at = NOW(),
    deleted_by = auth.uid(),
    updated_at = NOW()
  WHERE
    dog_id = p_dog_id
    AND deleted_at IS NULL;

  -- Cascade: clear any pre-checkout cart items for the dog (no soft-delete
  -- column; NO ACTION FK would otherwise orphan them).
  DELETE FROM entry_cart_items WHERE dog_id = p_dog_id;

  -- DELIBERATELY NOT TOUCHING armbands. See this migration's header: releasing
  -- the row bought almost nothing and required three reclaim sites to undo it.
  -- A deleted dog keeps its number. Do not re-add this without re-reading that.

  -- Cascade: drop the dog off every waitlist it is queued on, so it cannot be
  -- promoted into a live entry after deletion.
  DELETE FROM waitlist_entries WHERE dog_id = p_dog_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. restore_dog — back to the 20260617120000 body.
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

  RETURN QUERY SELECT * FROM public.dogs WHERE id = p_dog_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. assign_armband — back to the 083 body (fast path is a pure read again).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_armband(p_show_id uuid, p_dog_id uuid)
RETURNS integer
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

-- ---------------------------------------------------------------------------
-- 4. auto_assign_armband_on_accept — back to the 20260509003412 body, keeping
--    the search_path 20260712130000 added by ALTER.
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
          assigned_at    = EXCLUDED.assigned_at;
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

-- Grant decisions restated to match the live ACLs exactly — this migration
-- changes function bodies only. auto_assign_armband_on_accept keeps its
-- pre-existing anon grant (keep-listed in the grant-decision contract);
-- narrowing it belongs in a deliberate ACL sweep.
REVOKE ALL ON FUNCTION public.soft_delete_dog(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.soft_delete_dog(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_dog(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.restore_dog(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_dog(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.restore_dog(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.assign_armband(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_armband(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.assign_armband(uuid, uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.auto_assign_armband_on_accept() TO authenticated;

-- Put the rows 20260830140000's backfill released back to assigned, so the
-- table returns to its one invariant: a row carrying a dog_id IS an assignment.
--
-- HONEST LIMITATION: that backfill also nulled `assigned_at`, and the original
-- timestamps are not recoverable. These 6 rows (all on soft-deleted dogs) keep
-- assigned_at NULL. Nothing reads armbands.assigned_at — the replication mapper
-- passes it through and no consumer branches on it — so this is a cosmetic
-- residue, not a functional one. Recorded here rather than papered over with a
-- fabricated NOW().
UPDATE public.armbands
SET is_available = FALSE
WHERE is_available IS DISTINCT FROM FALSE
  AND dog_id IS NOT NULL;
