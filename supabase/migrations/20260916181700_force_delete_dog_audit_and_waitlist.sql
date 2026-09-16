-- MYK9-596: the force_delete_dog audit follow-ups (items 1, 2, 3, 8, 9 of the
-- review of PR #2267 / migration 20260915214500).
--
-- Four separate defects, all reachable from the same admin override:
--
--   1. The dialog and the function COMMENT both promised a clean restore. They
--      were wrong: `entry_cart_items` and `waitlist_entries` are hard-DELETEd
--      and `restore_dog` touches only `dogs` and `entries`. WE CHOSE HONESTY
--      OVER A NEW MECHANISM. Making the cascade genuinely reversible means
--      either soft-delete columns on two more tables or a side ledger of what
--      was removed, plus a restore path that re-inserts waitlist rows at a
--      position that has since been reallocated. That is a new subsystem, and
--      this project is consolidating, not expanding. So the COMMENT below and
--      the dialog copy (ForceDeleteOverride.tsx) now say exactly what comes
--      back — the dog and its entries — and exactly what does not.
--
--      The waitlist RE-SEQUENCE is fixed either way, and in BOTH functions:
--      deleting the dog queued at position 1 used to leave the rest of the
--      queue at 2, 3, 4… with a hole at the front. Nothing downstream re-packs
--      it, so every exhibitor behind the removed dog kept a position number
--      that overstated their place in the queue forever.
--
--   2. `refresh_class_scoring_state`'s manual branch nulls `final_placement`
--      for soft-deleted entries and RETURNs without recomputing. Force-delete a
--      scored entry in a `status_source = 'manual'` class and its placement is
--      nulled; restore it and the null-out no longer matches, nothing
--      recomputes, and the entry is permanently unplaced. The manual branch now
--      re-derives placements when the class is fully accounted for — the same
--      condition the derived branch uses, so a PARTIALLY scored manual class
--      still gets no premature placements. Placements stay server-authoritative
--      and 100%-scored-gated; only the "manual classes are exempt from
--      re-ranking entirely" part goes away.
--
--   3. `force_delete_dog` wrote no audit trail at all. It now writes one
--      `activity_log` row (`record_type = 'dog'`, the value
--      services/database/activity-logs/reads.ts already reads back via
--      getActivityForRecord) naming the actor, the dog, every entry id it
--      tombstoned, and the money it deliberately did not touch. `activity_log`
--      is the repo's existing generic record-activity table; there is no
--      `audit_log` or `admin_actions` table to reuse and this migration does
--      not invent one. The REFUND half stays a copy fix: the override still
--      issues no refund, and the dialog now says the payment must be refunded
--      in Stripe directly.
--
--   8. `dogs.deleted_by` was written by `force_delete_dog` but not by
--      `soft_delete_dog`. Normalised here.
--
-- `soft_delete_dog` below is copied from the LATEST migration that defines it
-- (20260830190000_drop_armband_release_from_dog_delete.sql) and carries its
-- `SET search_path` clause inline, per that migration's header. `restore_dog`
-- is NOT redefined: nothing in this migration changes it.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. refresh_class_scoring_state — the manual branch recomputes placements
--    once the class is fully accounted for. Body copied from
--    20260904160000_exclude_absent_entries_from_class_rollup.sql; only the
--    `v_status_source = 'manual'` block changes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_class_scoring_state(p_class_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expected_count integer;
  v_accounted_count integer;
  v_scored_count integer;
  v_status_source text;
  v_is_nationals boolean;
BEGIN
  IF p_class_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*) FILTER (
      WHERE COALESCE(entry_status, '') NOT IN (
        'scratched', 'withdrawn', 'moved', 'not_accepted', 'absent'
      )
        AND check_in_status IS DISTINCT FROM 'pulled'
    )::integer,
    COUNT(*) FILTER (
      WHERE COALESCE(entry_status, '') NOT IN (
        'scratched', 'withdrawn', 'moved', 'not_accepted', 'absent'
      )
        AND check_in_status IS DISTINCT FROM 'pulled'
        AND (is_scored = true OR result_status IN ('absent', 'excused'))
    )::integer,
    COUNT(*) FILTER (WHERE is_scored = true)::integer
  INTO v_expected_count, v_accounted_count, v_scored_count
  FROM public.entries
  WHERE class_id = p_class_id
    AND deleted_at IS NULL;

  SELECT status_source
  INTO v_status_source
  FROM public.classes
  WHERE id = p_class_id;

  IF v_status_source = 'manual' THEN
    -- `status` and `is_scoring_finalized` stay untouched: that is what
    -- `manual` means, and none of this migration changes it.
    UPDATE public.classes
    SET scored_count = v_scored_count
    WHERE id = p_class_id
      AND scored_count IS DISTINCT FROM v_scored_count;

    IF v_expected_count > 0 AND v_accounted_count = v_expected_count THEN
      -- Fully accounted for, so the placements are derivable and must be
      -- re-derived: a soft-deleted entry has to give its rank back, and a
      -- RESTORED one has to get its rank back. recalculate_class_placements
      -- clears every placement in the class first (deleted rows included),
      -- so it subsumes the null-out in the ELSE arm below.
      SELECT s.is_nationals
      INTO v_is_nationals
      FROM public.classes c
      JOIN public.trials t ON t.id = c.trial_id
      JOIN public.shows s ON s.id = t.show_id
      WHERE c.id = p_class_id;

      PERFORM public.recalculate_class_placements(
        ARRAY[p_class_id], COALESCE(v_is_nationals, false)
      );
    ELSE
      -- Not fully accounted for: do NOT assign placements to a half-scored
      -- class. Keep the pre-existing behaviour of stripping placements off
      -- tombstoned rows only.
      UPDATE public.entries
      SET final_placement = NULL
      WHERE class_id = p_class_id
        AND deleted_at IS NOT NULL
        AND final_placement IS NOT NULL;
    END IF;

    RETURN;
  END IF;

  IF v_expected_count = 0 THEN
    UPDATE public.classes
    SET
      status = 'upcoming',
      scored_count = v_scored_count,
      is_scoring_finalized = false
    WHERE id = p_class_id
      AND (status IS DISTINCT FROM 'upcoming'
           OR scored_count IS DISTINCT FROM v_scored_count
           OR is_scoring_finalized IS DISTINCT FROM false);

    UPDATE public.entries
    SET final_placement = NULL
    WHERE class_id = p_class_id
      AND final_placement IS NOT NULL;
  ELSIF v_accounted_count = v_expected_count THEN
    SELECT s.is_nationals
    INTO v_is_nationals
    FROM public.classes c
    JOIN public.trials t ON t.id = c.trial_id
    JOIN public.shows s ON s.id = t.show_id
    WHERE c.id = p_class_id;

    UPDATE public.classes
    SET
      status = 'completed',
      scored_count = v_scored_count,
      is_scoring_finalized = true,
      reopened_after_closeout_at = NULL
    WHERE id = p_class_id
      AND (status IS DISTINCT FROM 'completed'
           OR scored_count IS DISTINCT FROM v_scored_count
           OR is_scoring_finalized IS DISTINCT FROM true
           OR reopened_after_closeout_at IS NOT NULL);

    PERFORM public.recalculate_class_placements(ARRAY[p_class_id], COALESCE(v_is_nationals, false));
  ELSIF v_accounted_count > 0 THEN
    UPDATE public.classes
    SET
      status = 'in_progress',
      scored_count = v_scored_count,
      is_scoring_finalized = false
    WHERE id = p_class_id
      AND (status IS DISTINCT FROM 'in_progress'
           OR scored_count IS DISTINCT FROM v_scored_count
           OR is_scoring_finalized IS DISTINCT FROM false);

    UPDATE public.entries
    SET final_placement = NULL
    WHERE class_id = p_class_id
      AND final_placement IS NOT NULL;
  ELSE
    UPDATE public.classes
    SET
      status = 'upcoming',
      scored_count = v_scored_count,
      is_scoring_finalized = false
    WHERE id = p_class_id
      AND (status IS DISTINCT FROM 'upcoming'
           OR scored_count IS DISTINCT FROM v_scored_count
           OR is_scoring_finalized IS DISTINCT FROM false);

    UPDATE public.entries
    SET final_placement = NULL
    WHERE class_id = p_class_id
      AND final_placement IS NOT NULL;
  END IF;
END;
$$;

-- Restated from 20260904160000; CREATE OR REPLACE preserves the ACL, so this is
-- a no-op against the applied database and carries the disposition for a
-- migrations-only rebuild.
REVOKE ALL ON FUNCTION public.refresh_class_scoring_state(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_class_scoring_state(uuid) TO service_role;

COMMENT ON FUNCTION public.refresh_class_scoring_state(uuid) IS
  'Derives class completion from non-deleted entries. Expected entries exclude '
  'scratched, withdrawn, moved, not_accepted, absent, and pulled rows; '
  'accounted entries are scored or have result_status absent/excused (MYK9-356). '
  'A status_source=manual class keeps its status and finalized flag but still '
  're-derives placements once every expected entry is accounted for, so a '
  'soft-deleted entry gives its rank back and a restored one gets it back '
  '(MYK9-596).';

-- ---------------------------------------------------------------------------
-- 2. resequence_class_waitlist — the re-pack both delete paths were missing.
--
-- Its own function so the two callers cannot drift. Positions are compacted to
-- 1..N over the `waiting` rows only, because the partial unique index
-- `waitlist_entries_class_position_idx (class_id, position) WHERE status =
-- 'waiting'` is the only thing that constrains them; `offered` / promoted /
-- declined rows keep whatever position they hold.
--
-- Two phases, because that unique index is checked per ROW, not per statement:
-- compacting 2,3 down to 1,2 in one UPDATE transiently collides on 2. Parking
-- every row on its negated position first is collision-free (there is no CHECK
-- keeping position positive) and the second pass then moves negatives to
-- positives, which cannot collide either.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resequence_class_waitlist(p_class_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_class_ids IS NULL OR cardinality(p_class_ids) = 0 THEN
    RETURN;
  END IF;

  UPDATE public.waitlist_entries
  SET "position" = -"position"
  WHERE class_id = ANY (p_class_ids)
    AND status = 'waiting'
    AND "position" > 0;

  UPDATE public.waitlist_entries w
  SET "position" = ranked.new_position
  FROM (
    SELECT
      id,
      (ROW_NUMBER() OVER (
        PARTITION BY class_id
        ORDER BY "position" DESC, created_at ASC, id ASC
      ))::integer AS new_position
    FROM public.waitlist_entries
    WHERE class_id = ANY (p_class_ids)
      AND status = 'waiting'
      AND "position" < 0
  ) ranked
  WHERE w.id = ranked.id;
END;
$$;

REVOKE ALL ON FUNCTION public.resequence_class_waitlist(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resequence_class_waitlist(uuid[]) TO service_role;

COMMENT ON FUNCTION public.resequence_class_waitlist(uuid[]) IS
  'Compacts waitlist_entries.position to 1..N over the waiting rows of each '
  'supplied class, closing the hole a removed dog leaves behind (MYK9-596). '
  'Internal: called under definer rights from the dog delete paths.';

-- ---------------------------------------------------------------------------
-- 3. soft_delete_dog — body copied from 20260830190000, plus deleted_by on the
--    dog (item 8) and the waitlist re-sequence (item 1). Nothing else moves;
--    in particular the MK002 refusal and the armband non-behaviour stay as they
--    are — re-read 20260830190000's header before touching either.
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
  v_waitlist_class_ids UUID[];
BEGIN
  SELECT get_my_person_id() INTO v_person_id;

  UPDATE dogs
  SET
    deleted_at = NOW(),
    -- item 8: force_delete_dog already stamped this; the ordinary path did not,
    -- so Admin → Deleted Items could not say who removed the dog.
    deleted_by = auth.uid(),
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

  -- DELIBERATELY NOT TOUCHING armbands. See 20260830190000's header: releasing
  -- the row bought almost nothing and required three reclaim sites to undo it.
  -- A deleted dog keeps its number. Do not re-add this without re-reading that.

  -- Cascade: drop the dog off every waitlist it is queued on, so it cannot be
  -- promoted into a live entry after deletion, THEN close the hole that leaves.
  SELECT array_agg(DISTINCT class_id)
  INTO v_waitlist_class_ids
  FROM waitlist_entries
  WHERE dog_id = p_dog_id;

  DELETE FROM waitlist_entries WHERE dog_id = p_dog_id;

  PERFORM public.resequence_class_waitlist(v_waitlist_class_ids);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. force_delete_dog — body copied from 20260915214500, plus the waitlist
--    re-sequence (item 1) and the audit row (item 3). The admin gate, the
--    absence of a refund, and the armband non-behaviour are unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.force_delete_dog(p_dog_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $function$
DECLARE
  v_rows_affected INT;
  v_dog_label TEXT;
  v_actor_name TEXT;
  v_entry_ids UUID[];
  v_trial_ids UUID[];
  v_paid_entry_ids UUID[];
  v_payment_intent_ids TEXT[];
  v_cart_item_count INT;
  v_waitlist_class_ids UUID[];
  v_waitlist_count INT;
BEGIN
  -- Admin-only, checked before anything is read or written. Ownership is NOT an
  -- alternative here: an owner may delete their own dog via soft_delete_dog,
  -- which keeps the MK002 guard. Overriding that guard is an admin act.
  IF NOT (SELECT public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.dogs
  SET
    deleted_at = NOW(),
    deleted_by = auth.uid(),
    updated_at = NOW()
  WHERE
    id = p_dog_id
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected = 0 THEN
    RAISE EXCEPTION 'Dog not found or already deleted' USING ERRCODE = 'P0002';
  END IF;

  -- No MK002 check. That is the entire point of this function.

  -- Snapshot what the cascade is about to remove, for the audit row. Read
  -- BEFORE the writes: after them the entries are tombstoned and the cart and
  -- waitlist rows are gone, so there is nothing left to name.
  SELECT
    COALESCE(array_agg(e.id ORDER BY e.id), '{}'::uuid[]),
    COALESCE(array_agg(DISTINCT e.trial_id) FILTER (WHERE e.trial_id IS NOT NULL), '{}'::uuid[]),
    COALESCE(array_agg(e.id ORDER BY e.id) FILTER (WHERE e.payment_status = 'paid'), '{}'::uuid[]),
    COALESCE(
      array_agg(DISTINCT e.stripe_payment_intent_id)
        FILTER (WHERE e.stripe_payment_intent_id IS NOT NULL),
      '{}'::text[]
    )
  INTO v_entry_ids, v_trial_ids, v_paid_entry_ids, v_payment_intent_ids
  FROM public.entries e
  WHERE e.dog_id = p_dog_id
    AND e.deleted_at IS NULL;

  -- Cascade, identical to soft_delete_dog's: live entries, pre-checkout cart
  -- items (no soft-delete column, and a NO ACTION FK would orphan them), and
  -- waitlist spots (so a deleted dog cannot be promoted into a live entry).
  -- Armbands are deliberately untouched — see 20260830190000's header before
  -- re-adding a release here.
  UPDATE public.entries
  SET
    deleted_at = NOW(),
    deleted_by = auth.uid(),
    updated_at = NOW()
  WHERE
    dog_id = p_dog_id
    AND deleted_at IS NULL;

  DELETE FROM public.entry_cart_items WHERE dog_id = p_dog_id;
  GET DIAGNOSTICS v_cart_item_count = ROW_COUNT;

  SELECT array_agg(DISTINCT class_id)
  INTO v_waitlist_class_ids
  FROM public.waitlist_entries
  WHERE dog_id = p_dog_id;

  DELETE FROM public.waitlist_entries WHERE dog_id = p_dog_id;
  GET DIAGNOSTICS v_waitlist_count = ROW_COUNT;

  -- Close the hole the removed dog leaves in every queue it was on. Without
  -- this the exhibitors behind it keep a position number that overstates their
  -- place in the queue, permanently.
  PERFORM public.resequence_class_waitlist(v_waitlist_class_ids);

  -- The audit row. This function bypasses a money guard, and until now left no
  -- trace of who did it or what it removed: the tombstoned entry is invisible
  -- to every refund surface, so `payment_status = 'paid'` with no
  -- `withdrawn_at` and no refund decision was the only record that a charge had
  -- been stranded. activity_log is the repo's generic record-activity table
  -- (051_activity_log_generic_and_milestones.sql); record_type 'dog' is one of
  -- the values services/database/activity-logs/reads.ts already reads back.
  -- trial_id stays NULL because a dog delete spans trials; the affected trials
  -- ride in metadata.
  SELECT COALESCE(NULLIF(TRIM(d.call_name), ''), d.name, p_dog_id::text)
  INTO v_dog_label
  FROM public.dogs d
  WHERE d.id = p_dog_id;

  SELECT TRIM(COALESCE(pe.first_name, '') || ' ' || COALESCE(pe.last_name, ''))
  INTO v_actor_name
  FROM public.people pe
  WHERE pe.auth_user_id = (SELECT auth.uid())
  LIMIT 1;

  INSERT INTO public.activity_log (
    trial_id, record_type, record_id, action_type, description,
    actor_id, actor_name, metadata
  )
  VALUES (
    NULL,
    'dog',
    p_dog_id,
    'deleted',
    format(
      'Admin force-deleted dog %s over the paid/scored guard: %s entr%s tombstoned, %s waitlist spot(s) and %s cart item(s) removed. No refund was issued.',
      v_dog_label,
      cardinality(v_entry_ids),
      CASE WHEN cardinality(v_entry_ids) = 1 THEN 'y' ELSE 'ies' END,
      COALESCE(v_waitlist_count, 0),
      COALESCE(v_cart_item_count, 0)
    ),
    (SELECT auth.uid()),
    NULLIF(v_actor_name, ''),
    jsonb_build_object(
      'override', 'force_delete_dog',
      'dog_id', p_dog_id,
      'dog_label', v_dog_label,
      'entry_ids', to_jsonb(v_entry_ids),
      'trial_ids', to_jsonb(v_trial_ids),
      'paid_entry_ids', to_jsonb(v_paid_entry_ids),
      'stripe_payment_intent_ids', to_jsonb(v_payment_intent_ids),
      'waitlist_rows_removed', COALESCE(v_waitlist_count, 0),
      'cart_items_removed', COALESCE(v_cart_item_count, 0),
      'refund_issued', false
    )
  );
END;
$function$;

-- A SECURITY DEFINER function is EXECUTE-able by PUBLIC by default, which would
-- expose it to anon. The internal is_platform_admin() gate would still refuse,
-- but do not rely on a single guard for a function that bypasses a money check.
-- Restated verbatim from 20260915214500; this migration does not widen who may
-- call it.
REVOKE ALL ON FUNCTION public.force_delete_dog(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.force_delete_dog(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.force_delete_dog(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.soft_delete_dog(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.soft_delete_dog(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_dog(uuid) TO authenticated;

COMMENT ON FUNCTION public.force_delete_dog(uuid) IS
  'Platform-admin override for soft_delete_dog''s MK002 refusal: soft-deletes a '
  'dog and cascades to its entries, cart items and waitlist spots even when '
  'entries are paid or scored. Issues no refund — a captured charge must be '
  'refunded in Stripe directly. Writes one activity_log row (record_type=dog) '
  'naming the actor, the entries and the stranded payment intents. PARTIALLY '
  'REVERSIBLE: restore_dog brings back the dog and its entries, and nothing '
  'else. The cart items and waitlist spots are hard-deleted and do not come '
  'back, and the waitlist positions behind the dog are re-packed on delete '
  '(MYK9-596).';

COMMENT ON FUNCTION public.soft_delete_dog(uuid) IS
  'Owner/admin dog delete. Refuses with MK002 over paid or scored entries. '
  'Stamps dogs.deleted_by, soft-deletes live entries, hard-deletes cart items '
  'and waitlist spots, and re-packs the waitlist positions behind the removed '
  'dog (MYK9-596). Armbands are deliberately untouched (20260830190000).';

COMMIT;

NOTIFY pgrst, 'reload schema';
