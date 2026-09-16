-- MYK9-596: the force_delete_dog audit follow-ups (items 1, 2, 3, 8, 9 of the
-- review of PR #2267 / migration 20260915214500).
--
-- Four separate defects, all reachable from the same admin override:
--
--   1. The dialog and the function COMMENT both promised a clean restore. They
--      were wrong: `entry_cart_items` and `waitlist_entries` are hard-DELETEd
--      and `restore_dog` touched only `dogs` and `entries`. WE CHOSE HONESTY
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
--   2. A force-deleted SCORED entry in a `status_source = 'manual'` class came
--      back permanently unplaced. refresh_class_scoring_state's manual branch
--      nulls a tombstoned entry's final_placement and RETURNs; on restore the
--      null-out no longer matches and nothing re-derives, so the placement is
--      simply gone.
--
--      THE OBVIOUS FIX IS FORBIDDEN. Teaching the manual branch to call
--      recalculate_class_placements is ruled out BY NAME in
--      20260817150000_clear_tombstone_placement_on_manual_classes.sql: "the
--      manual branch must not write classes.status, and must not call
--      recalculate_class_placements, which would re-rank a class whose ordering
--      a human may have overridden" (:23-25), because a class-wide re-rank
--      "turns a stale-tombstone display bug into silent destruction of
--      published results" (:14-20). Gating it on "fully accounted for" does not
--      rescue it: a fully-accounted manual class is exactly the state in which
--      hand-set placements exist, and ANY later entry write — a check-in, a
--      score edit — would then re-derive every one of them. MYK9-7 is the
--      placement-authority thread; this migration does not reopen it.
--
--      So the placement is carried through the DELETE/RESTORE PAIR instead of
--      through the rollup. force_delete_dog already writes an audit row (item 3
--      below); it now snapshots each affected entry's pre-delete
--      final_placement and class id into that row's metadata, and restore_dog
--      re-applies those values — only for classes that are still
--      status_source = 'manual', matched by the same `deleted_at` it already
--      keys the entry restore on. A DERIVED class needs none of this: its
--      trigger re-derives on the restore UPDATE, as it always has. The audit
--      row is the right carrier because it is the one record that already
--      describes exactly what this override removed, it is written in the same
--      transaction, and it needs no new table during a consolidation phase.
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
--      DECISION — the row carries two display names, `actor_name` (a designed
--      column since 046_pipeline_dashboard.sql) and `metadata.dog_label` (the
--      dog's call name). Both are deliberate: an audit row read a year later
--      must still be legible after the dog is hard-deleted or renamed, and the
--      ids alone are not. They are display copies, never a lookup key — every
--      assertion and every restore path keys on ids.
--
--   8. `dogs.deleted_by` was written by `force_delete_dog` but not by
--      `soft_delete_dog`. Normalised here.
--
-- `soft_delete_dog` and `restore_dog` bodies below are copied from the LATEST
-- migration that defines them (20260830190000_drop_armband_release_from_dog_delete.sql)
-- and carry their `SET search_path` clauses inline, per that migration's header.
-- `refresh_class_scoring_state` is NOT redefined: see item 2.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. resequence_class_waitlist — the re-pack both delete paths were missing.
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
DECLARE
  v_class_id uuid;
BEGIN
  IF p_class_ids IS NULL OR cardinality(p_class_ids) = 0 THEN
    RETURN;
  END IF;

  -- Take the SAME advisory lock add_to_waitlist takes before it computes
  -- MAX(position) + 1 (20260629015413_harden_waitlist_idempotency_capacity_helper.sql:95). Without
  -- it a concurrent join reads MAX = 3 while this function's negation pass is
  -- still uncommitted, inserts at 4, and is not touched by the second pass
  -- (which only matches position < 0) — the queue lands 1, 2, 4 with no error.
  -- Locked in sorted order so two concurrent resequences over overlapping
  -- class sets cannot deadlock against each other.
  FOR v_class_id IN
    SELECT DISTINCT c FROM unnest(p_class_ids) AS c WHERE c IS NOT NULL ORDER BY 1
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_class_id::text));
  END LOOP;

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
  'Takes add_to_waitlist''s per-class advisory lock first. Internal: called '
  'under definer rights from the dog delete paths.';

-- ---------------------------------------------------------------------------
-- 2. soft_delete_dog — body copied from 20260830190000, plus deleted_by on the
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
-- 3. force_delete_dog — body copied from 20260915214500, plus the waitlist
--    re-sequence (item 1), the placement snapshot (item 2) and the audit row
--    (item 3). The admin gate, the absence of a refund, and the armband
--    non-behaviour are unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.force_delete_dog(p_dog_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $function$
DECLARE
  v_rows_affected INT;
  v_deleted_at timestamptz;
  v_dog_label TEXT;
  v_actor_name TEXT;
  v_entry_ids UUID[];
  v_trial_ids UUID[];
  v_paid_entry_ids UUID[];
  v_payment_intent_ids TEXT[];
  v_placements JSONB;
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
    AND deleted_at IS NULL
  RETURNING deleted_at INTO v_deleted_at;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected = 0 THEN
    RAISE EXCEPTION 'Dog not found or already deleted' USING ERRCODE = 'P0002';
  END IF;

  -- No MK002 check. That is the entire point of this function.

  -- Snapshot what the cascade is about to remove, for the audit row. Read
  -- BEFORE the writes: after them the entries are tombstoned and the cart and
  -- waitlist rows are gone, so there is nothing left to name — and the rollup
  -- trigger has already nulled final_placement, which is precisely the value
  -- restore_dog needs back for a manual class (item 2).
  SELECT
    COALESCE(array_agg(e.id ORDER BY e.id), '{}'::uuid[]),
    COALESCE(array_agg(DISTINCT e.trial_id) FILTER (WHERE e.trial_id IS NOT NULL), '{}'::uuid[]),
    COALESCE(array_agg(e.id ORDER BY e.id) FILTER (WHERE e.payment_status = 'paid'), '{}'::uuid[]),
    COALESCE(
      array_agg(DISTINCT e.stripe_payment_intent_id)
        FILTER (WHERE e.stripe_payment_intent_id IS NOT NULL),
      '{}'::text[]
    ),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'entry_id', e.id,
          'class_id', e.class_id,
          'final_placement', e.final_placement
        )
        ORDER BY e.id
      ) FILTER (WHERE e.final_placement IS NOT NULL AND e.class_id IS NOT NULL),
      '[]'::jsonb
    )
  INTO
    v_entry_ids, v_trial_ids, v_paid_entry_ids, v_payment_intent_ids, v_placements
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

  -- DEPENDENCY: public.activity_log has FORCE ROW LEVEL SECURITY and its only
  -- INSERT policy is `TO authenticated WITH CHECK (actor_id = auth.uid())`.
  -- This INSERT reaches the table because the definer OWNER of this function is
  -- `postgres`, which carries BYPASSRLS. Re-own this function to a role without
  -- BYPASSRLS and the audit row silently stops being written (and, with it, the
  -- placement snapshot restore_dog reads back) — add a policy first.
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
      -- The key restore_dog matches on. Same value the entries carry, because
      -- both UPDATEs above read NOW() (transaction-start time).
      'deleted_at', to_jsonb(v_deleted_at),
      'entry_ids', to_jsonb(v_entry_ids),
      'trial_ids', to_jsonb(v_trial_ids),
      'paid_entry_ids', to_jsonb(v_paid_entry_ids),
      'stripe_payment_intent_ids', to_jsonb(v_payment_intent_ids),
      'placements', v_placements,
      'waitlist_rows_removed', COALESCE(v_waitlist_count, 0),
      'cart_items_removed', COALESCE(v_cart_item_count, 0),
      'refund_issued', false
    )
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. restore_dog — body copied from 20260830190000, plus the manual-class
--    placement re-apply (item 2).
--
-- A DERIVED class is untouched here: un-tombstoning the entry fires
-- entries_refresh_class_scoring_state, and the derived branches re-derive the
-- whole class exactly as they always have. Only the MANUAL branch leaves the
-- restored row unplaced, because it deliberately never re-ranks — so only a
-- manual class is read back from the audit row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_dog(p_dog_id uuid)
RETURNS SETOF public.dogs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted_at timestamptz;
  v_placements jsonb;
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

  -- MYK9-596 item 2. Keyed on the SAME deleted_at as the entry restore above,
  -- so a dog force-deleted and restored more than once picks the matching
  -- snapshot rather than the newest one. An ordinary soft_delete_dog writes no
  -- such row, so v_placements is NULL and everything below is a no-op.
  -- (This SELECT also relies on the definer owner's BYPASSRLS — see the
  -- dependency note over the INSERT in force_delete_dog.)
  SELECT a.metadata -> 'placements'
  INTO v_placements
  FROM public.activity_log a
  WHERE a.record_type = 'dog'
    AND a.record_id = p_dog_id
    AND a.action_type = 'deleted'
    AND a.metadata ->> 'override' = 'force_delete_dog'
    AND (a.metadata ->> 'deleted_at')::timestamptz = v_deleted_at
  ORDER BY a.created_at DESC
  LIMIT 1;

  IF v_placements IS NOT NULL AND jsonb_typeof(v_placements) = 'array' THEN
    UPDATE public.entries e
    SET final_placement = (snapshot.value ->> 'final_placement')::integer
    FROM jsonb_array_elements(v_placements) AS snapshot(value)
    JOIN public.classes c
      ON c.id = (snapshot.value ->> 'class_id')::uuid
    WHERE e.id = (snapshot.value ->> 'entry_id')::uuid
      AND e.dog_id = p_dog_id
      AND e.deleted_at IS NULL
      -- Only a class that is STILL manual. If a human flipped it back to
      -- derived while the dog was deleted, the trigger owns the ordering and
      -- re-applying a stale rank would fight it.
      AND c.status_source = 'manual'
      AND e.final_placement IS DISTINCT FROM (snapshot.value ->> 'final_placement')::integer;
  END IF;

  RETURN QUERY SELECT * FROM public.dogs WHERE id = p_dog_id;
END;
$$;

-- A SECURITY DEFINER function is EXECUTE-able by PUBLIC by default, which would
-- expose it to anon. The internal is_platform_admin() gate would still refuse,
-- but do not rely on a single guard for a function that bypasses a money check.
-- Restated verbatim from 20260915214500 / 20260830190000; this migration does
-- not widen who may call any of them.
REVOKE ALL ON FUNCTION public.force_delete_dog(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.force_delete_dog(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.force_delete_dog(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.soft_delete_dog(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.soft_delete_dog(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_dog(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.restore_dog(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_dog(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.restore_dog(uuid) TO authenticated;

COMMENT ON FUNCTION public.force_delete_dog(uuid) IS
  'Platform-admin override for soft_delete_dog''s MK002 refusal: soft-deletes a '
  'dog and cascades to its entries, cart items and waitlist spots even when '
  'entries are paid or scored. Issues no refund: refund paid entries through '
  'myK9 (stripe-refund-entry, which stamps entries.refund_amount) BEFORE '
  'force-deleting — afterwards RefundEntryDialog lists live entries only, so '
  'the in-app refund is unreachable. NEVER refund a myK9 entry in the Stripe '
  'dashboard: that writes no refund_amount, and payoutCalc still counts the '
  'entry as paid, so the club is transferred the amount the platform refunded. '
  'Writes one activity_log row (record_type=dog) '
  'naming the actor, the entries, the stranded payment intents and each '
  'entry''s pre-delete final_placement. PARTIALLY REVERSIBLE: restore_dog '
  'brings back the dog and its entries, and nothing else. The cart items and '
  'waitlist spots are hard-deleted and do not come back, and the waitlist '
  'positions behind the dog are re-packed on delete (MYK9-596).';

COMMENT ON FUNCTION public.soft_delete_dog(uuid) IS
  'Owner/admin dog delete. Refuses with MK002 over paid or scored entries. '
  'Stamps dogs.deleted_by, soft-deletes live entries, hard-deletes cart items '
  'and waitlist spots, and re-packs the waitlist positions behind the removed '
  'dog (MYK9-596). Armbands are deliberately untouched (20260830190000).';

COMMENT ON FUNCTION public.restore_dog(uuid) IS
  'Platform-admin restore of a soft-deleted dog and the entries tombstoned with '
  'it. For an entry force-deleted out of a status_source=manual class it also '
  're-applies the final_placement snapshotted in the force_delete_dog audit '
  'row, because the manual rollup branch deliberately never re-ranks; derived '
  'classes re-derive through the entries trigger (MYK9-596, 20260817150000).';

COMMIT;

NOTIFY pgrst, 'reload schema';
