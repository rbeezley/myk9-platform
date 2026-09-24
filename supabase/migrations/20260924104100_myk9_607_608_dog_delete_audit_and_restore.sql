-- MYK9-607 + MYK9-608: the dog force-delete audit row, read back honestly.
--
-- Three defects left by 20260916181700 (MYK9-596), all on the same audit row:
--
--   A. MYK9-607 item 1 — restore_dog re-applied a stale placement snapshot.
--      For an entry force-deleted out of a status_source='manual' class,
--      restore_dog wrote the snapshotted final_placement back verbatim. If the
--      secretary had re-placed the class while the dog was deleted (moved the
--      survivor from 2nd to 1st), the restore handed 1st back as well and the
--      class showed two firsts. final_placement has no unique constraint, so
--      nothing refused it.
--
--      DECISION: skip, and say so. A manual class is one a HUMAN placed, and a
--      placement the human set after the delete is newer information than the
--      snapshot; 20260817150000 forbids anything automatic from overriding a
--      hand-set order. So a snapshot value another LIVE entry in the same class
--      already holds is not re-applied. The restored entry stays unplaced, and
--      restore_dog now RETURNS jsonb naming every skipped placement (entry,
--      class, place) so the admin is told which class to hand back to the
--      secretary. The return type change is why restore_dog is DROPped: its one
--      caller (services/database/dogs/reads.ts restoreDog) is updated with it.
--
--   B. MYK9-607 item 2 — the audit-row match could tie. restore_dog picked the
--      row by (record_id, metadata.deleted_at) ORDER BY created_at DESC LIMIT 1.
--      Both keys are NOW(), transaction-start time, so a script that force-
--      deletes, restores and force-deletes the same dog in ONE transaction wrote
--      two rows with identical keys and the pick was arbitrary. force_delete_dog
--      now stamps the row's created_at with clock_timestamp(), which advances
--      between statements, and the match lives in ONE helper
--      (dog_force_delete_audit) that restore_dog and get_deleted_dogs both use,
--      so the two readers cannot disagree about which row describes a deletion.
--
--      Newest-first is not enough on its own: force-delete, restore, then an
--      ORDINARY soft_delete_dog in one transaction gives the second deletion the
--      same deleted_at, and no audit row of its own, so the force-delete row
--      would be read as describing it (old entries, old payments, and a stale
--      placement snapshot for the next restore). So restore_dog now CLOSES the
--      row it restored from, stamping metadata.restored_at / restored_by, and
--      the helper only matches a row that has not been restored. One audit row
--      then describes exactly one delete/restore cycle.
--
--   C. MYK9-608 — nothing in the app could read any of it. get_deleted_dogs()
--      returned SETOF public.dogs, which cannot carry who deleted the dog, so
--      Admin -> Deleted Items showed no deleter for either delete path; and the
--      force-delete audit row (trial_id NULL) is filtered out of the only
--      activity_log reader, the per-trial feed. get_deleted_dogs() now returns
--      the columns the Deleted Items row renders plus the deleter's email and
--      name and, for a force-deleted dog, the audit facts an admin needs to
--      recover a stranded charge: when, by whom, which entries, which of them
--      were paid, and the Stripe payment intents. Consolidation: this extends
--      the existing Deleted Items read; there is no new audit page.
--
--      DECISION — record the money facts, never a judgement about them. An
--      intent id alone cannot say whether money is still owed: an entry may
--      have been refunded in myK9 before the override, in full or in part, and
--      payment_status reads 'refunded' for BOTH (buildEntryRefundStamp). Any
--      "owed" rule written here would be a second copy of payoutCalc's netting,
--      and would drift. So force_delete_dog now records, per affected entry,
--      exactly what the row said at delete time — `payments`: entry_id,
--      stripe_payment_intent_id, payment_status, entry_fee, refund_amount — and
--      Deleted Items lists every entry with an intent, as recorded. Nothing in
--      SQL or the client derives an owed amount. Rows written before this
--      migration have no `payments` key and list none (there are no
--      force-delete audit rows on the live database as of writing).
--
--      It returns an EXPLICIT column list, not d.*: the old SETOF dogs shape
--      re-expanded to every column the table ever gains, and no caller reads
--      more than these (DeletedEntitiesTab mapDog, and a count of rows).
--
-- Definer restatements (these functions bypass RLS, so every filter the
-- policies would have applied is written out by hand):
--   * dogs: is_platform_admin() gates every row, as before.
--   * activity_log: its only SELECT policy is is_real_account(); restated.
--   * people: people_select hides tombstoned people; the deleter's NAME is only
--     read from a live person row. The email comes from auth.users, which an
--     admin-gated definer read may show (the deleter is an app user, and the
--     row is admin-only).
--
-- force_delete_dog is copied from the LATEST migration that defines it
-- (20260916181700_force_delete_dog_audit_and_waitlist.sql); the ONLY changes
-- are the created_at column on its audit INSERT and the `payments` metadata
-- key. restore_dog is copied from the same migration; its changes are
-- the helper call, closing the audit row, the conflict skip and the jsonb
-- result. get_deleted_dogs is rebuilt from 20260616140000.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. dog_force_delete_audit — the ONE rule for "the audit row that describes
--    this deletion". Internal: SECURITY INVOKER, EXECUTE revoked from every API
--    role, so it only ever runs nested inside the admin-gated definer functions
--    below (where current_user is the definer owner). It bypasses nothing on
--    its own.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dog_force_delete_audit(
  p_dog_id uuid,
  p_deleted_at timestamptz
)
RETURNS SETOF public.activity_log
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT a.*
  FROM public.activity_log a
  WHERE a.record_type = 'dog'
    AND a.record_id = p_dog_id
    AND a.action_type = 'deleted'
    AND a.metadata ->> 'override' = 'force_delete_dog'
    AND (a.metadata ->> 'deleted_at')::timestamptz = p_deleted_at
    -- A row restore_dog already restored from describes a deletion that has
    -- been undone; a later deletion with the same deleted_at is a different
    -- event (MYK9-607).
    AND NOT (a.metadata ? 'restored_at')
  -- created_at is clock_timestamp() from this migration on, so it is strictly
  -- ordered even inside one transaction. id is a last, arbitrary-but-stable
  -- tiebreak for any row written before that.
  ORDER BY a.created_at DESC, a.id DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.dog_force_delete_audit(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dog_force_delete_audit(uuid, timestamptz) TO service_role;

COMMENT ON FUNCTION public.dog_force_delete_audit(uuid, timestamptz) IS
  'Internal. The force_delete_dog audit row for one specific deletion of a dog, '
  'matched on the dog id and the deleted_at the deletion stamped, skipping rows '
  'restore_dog has closed (metadata.restored_at), newest first by '
  'clock_timestamp()-based created_at (MYK9-607). Shared by restore_dog and '
  'get_deleted_dogs so they cannot pick different rows.';

-- ---------------------------------------------------------------------------
-- 2. force_delete_dog — body copied from 20260916181700; the only changes are
--    `created_at = clock_timestamp()` on the audit INSERT (item B) and the
--    `payments` metadata key (item C).
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
  v_payments JSONB;
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
    -- MYK9-608: the money facts of EVERY affected entry, verbatim. Recorded,
    -- not judged — see the header's DECISION on item C.
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'entry_id', e.id,
          'stripe_payment_intent_id', e.stripe_payment_intent_id,
          'payment_status', e.payment_status,
          'entry_fee', e.entry_fee,
          'refund_amount', e.refund_amount
        )
        ORDER BY e.id
      ),
      '[]'::jsonb
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
    v_entry_ids, v_trial_ids, v_paid_entry_ids, v_payment_intent_ids,
    v_payments, v_placements
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
    actor_id, actor_name, metadata, created_at
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
      'payments', v_payments,
      'placements', v_placements,
      'waitlist_rows_removed', COALESCE(v_waitlist_count, 0),
      'cart_items_removed', COALESCE(v_cart_item_count, 0),
      'refund_issued', false
    ),
    -- MYK9-607 item 2: NOT the column default now(), which is transaction-start
    -- time and ties with an earlier force-delete of the same dog in the same
    -- transaction. clock_timestamp() advances, so dog_force_delete_audit's
    -- newest-first order picks the row for THIS deletion.
    clock_timestamp()
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. restore_dog — body copied from 20260916181700, with the audit match moved
--    into dog_force_delete_audit (item B), the conflict skip (item A) and a
--    jsonb result that names what was skipped. DROPped because the return type
--    changes (SETOF public.dogs -> jsonb); the ACL is restated below.
-- ---------------------------------------------------------------------------
DROP FUNCTION public.restore_dog(uuid);

CREATE FUNCTION public.restore_dog(p_dog_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted_at timestamptz;
  v_placements jsonb;
  v_audit_id uuid;
  v_entries_restored integer;
  v_reapplied integer := 0;
  v_skipped jsonb := '[]'::jsonb;
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
  GET DIAGNOSTICS v_entries_restored = ROW_COUNT;

  -- MYK9-596 item 2. Keyed on the SAME deleted_at as the entry restore above,
  -- through the one shared match rule (MYK9-607 item 2). An ordinary
  -- soft_delete_dog writes no such row, so v_placements is NULL and everything
  -- below is a no-op. (This read relies on the definer owner's BYPASSRLS — see
  -- the dependency note over the INSERT in force_delete_dog.)
  SELECT a.id, a.metadata -> 'placements'
  INTO v_audit_id, v_placements
  FROM public.dog_force_delete_audit(p_dog_id, v_deleted_at) a;

  -- Close the row: this deletion is undone, so the row must never again be
  -- read as describing a later deletion that happens to share its deleted_at
  -- (MYK9-607). Additive — nothing the override recorded is changed.
  IF v_audit_id IS NOT NULL THEN
    UPDATE public.activity_log
    SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'restored_at', to_jsonb(clock_timestamp()),
      'restored_by', to_jsonb((SELECT auth.uid()))
    )
    WHERE id = v_audit_id;
  END IF;

  IF v_placements IS NOT NULL AND jsonb_typeof(v_placements) = 'array' THEN
    -- One statement, so the conflict check reads the class as it stood before
    -- any re-apply, and no temp table is needed under definer rights.
    WITH candidates AS (
      -- Only an entry that came back with this restore, still in the class the
      -- snapshot names, in a class that is STILL manual. If a human flipped the
      -- class back to derived while the dog was deleted, the trigger owns the
      -- ordering and re-applying a stale rank would fight it.
      SELECT
        e.id AS entry_id,
        c.id AS class_id,
        c.name AS class_name,
        (snapshot.value ->> 'final_placement')::integer AS final_placement,
        -- MYK9-607 item 1: a placement another LIVE entry in the class holds
        -- now was given to it by a human after the delete. That is newer than
        -- the snapshot, so it wins and the restored entry is left unplaced.
        EXISTS (
          SELECT 1
          FROM public.entries other
          WHERE other.class_id = c.id
            AND other.id <> e.id
            AND other.deleted_at IS NULL
            AND other.final_placement = (snapshot.value ->> 'final_placement')::integer
        ) AS taken
      FROM jsonb_array_elements(v_placements) AS snapshot(value)
      JOIN public.entries e
        ON e.id = (snapshot.value ->> 'entry_id')::uuid
      JOIN public.classes c
        ON c.id = (snapshot.value ->> 'class_id')::uuid
      WHERE e.dog_id = p_dog_id
        AND e.deleted_at IS NULL
        AND e.class_id = c.id
        AND c.status_source = 'manual'
    ),
    reapplied AS (
      UPDATE public.entries e
      SET final_placement = cand.final_placement
      FROM candidates cand
      WHERE e.id = cand.entry_id
        AND NOT cand.taken
        AND e.final_placement IS DISTINCT FROM cand.final_placement
      RETURNING e.id
    )
    SELECT
      (SELECT count(*)::integer FROM reapplied),
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'entry_id', cand.entry_id,
              'class_id', cand.class_id,
              'class_name', cand.class_name,
              'final_placement', cand.final_placement
            )
            ORDER BY cand.class_name, cand.entry_id
          )
          FROM candidates cand
          WHERE cand.taken
        ),
        '[]'::jsonb
      )
    INTO v_reapplied, v_skipped;
  END IF;

  RETURN jsonb_build_object(
    'dog_id', p_dog_id,
    'entries_restored', v_entries_restored,
    'placements_reapplied', v_reapplied,
    'placements_skipped', v_skipped
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. get_deleted_dogs — rebuilt from 20260616140000 with an explicit column
--    list, the deleter, and the force-delete audit facts (item C). DROPped
--    because the return type changes (SETOF public.dogs -> TABLE).
-- ---------------------------------------------------------------------------
DROP FUNCTION public.get_deleted_dogs();

CREATE FUNCTION public.get_deleted_dogs()
RETURNS TABLE (
  id uuid,
  name text,
  call_name text,
  breed text,
  deleted_at timestamptz,
  deleted_by uuid,
  deleted_by_email text,
  deleted_by_name text,
  force_delete_audit jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    d.id,
    d.name,
    d.call_name,
    d.breed,
    d.deleted_at,
    d.deleted_by,
    u.email::text,
    NULLIF(TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
    CASE
      WHEN a.id IS NOT NULL THEN jsonb_build_object(
        'logged_at', a.created_at,
        'actor_name', a.actor_name,
        'entry_ids', COALESCE(a.metadata -> 'entry_ids', '[]'::jsonb),
        'paid_entry_ids', COALESCE(a.metadata -> 'paid_entry_ids', '[]'::jsonb),
        'stripe_payment_intent_ids',
          COALESCE(a.metadata -> 'stripe_payment_intent_ids', '[]'::jsonb),
        'payments', COALESCE(a.metadata -> 'payments', '[]'::jsonb),
        'waitlist_rows_removed', COALESCE((a.metadata ->> 'waitlist_rows_removed')::integer, 0),
        'cart_items_removed', COALESCE((a.metadata ->> 'cart_items_removed')::integer, 0),
        'refund_issued', COALESCE((a.metadata ->> 'refund_issued')::boolean, false)
      )
    END
  FROM public.dogs d
  -- NULL-safe for every row that predates deleted_by being stamped: a NULL
  -- deleted_by simply finds no user and no person.
  LEFT JOIN auth.users u
    ON u.id = d.deleted_by
  LEFT JOIN LATERAL (
    SELECT pe.first_name, pe.last_name
    FROM public.people pe
    WHERE pe.auth_user_id = d.deleted_by
      AND pe.deleted_at IS NULL
    ORDER BY pe.created_at, pe.id
    LIMIT 1
  ) p ON true
  -- activity_log_select is `is_real_account()`; restated in the join so a
  -- caller that fails it still gets the dog row, just without audit facts.
  LEFT JOIN LATERAL public.dog_force_delete_audit(d.id, d.deleted_at) a
    ON (SELECT public.is_real_account())
  WHERE d.deleted_at IS NOT NULL
    AND (SELECT public.is_platform_admin())
  ORDER BY d.deleted_at DESC;
$$;

-- DROP + CREATE resets the ACL to the defaults, and this project's default
-- privileges grant EXECUTE to anon on every new public function. REVOKE FROM
-- PUBLIC does not remove that explicit anon grant, so anon is named too. The
-- is_platform_admin() gate inside each function is the real authorisation;
-- this keeps it from being the only one.
REVOKE ALL ON FUNCTION public.restore_dog(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_dog(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.restore_dog(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_dog(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_deleted_dogs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_deleted_dogs() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_deleted_dogs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_deleted_dogs() TO service_role;

-- force_delete_dog was CREATE OR REPLACEd, which keeps its ACL; restated
-- verbatim from 20260916181700 anyway so this file reads complete.
REVOKE ALL ON FUNCTION public.force_delete_dog(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.force_delete_dog(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.force_delete_dog(uuid) TO authenticated;

COMMENT ON FUNCTION public.force_delete_dog(uuid) IS
  'Platform-admin override for soft_delete_dog''s MK002 refusal: soft-deletes a '
  'dog and cascades to its entries, cart items and waitlist spots even when '
  'entries are paid or scored. Issues no refund: refund paid entries through '
  'myK9 (stripe-refund-entry, which stamps entries.refund_amount) BEFORE '
  'force-deleting — afterwards RefundEntryDialog lists live entries only, so '
  'the in-app refund is unreachable. NEVER refund a myK9 entry in the Stripe '
  'dashboard: that writes no refund_amount, and payoutCalc still counts the '
  'entry as paid, so the club is transferred the amount the platform refunded. '
  'Writes one activity_log row (record_type=dog, created_at=clock_timestamp()) '
  'naming the actor, the entries, the stranded payment intents and each '
  'entry''s pre-delete final_placement; Admin -> Deleted Items shows it through '
  'get_deleted_dogs (MYK9-608). PARTIALLY REVERSIBLE: restore_dog '
  'brings back the dog and its entries, and nothing else. The cart items and '
  'waitlist spots are hard-deleted and do not come back, and the waitlist '
  'positions behind the dog are re-packed on delete (MYK9-596).';

COMMENT ON FUNCTION public.restore_dog(uuid) IS
  'Platform-admin restore of a soft-deleted dog and the entries tombstoned with '
  'it. For an entry force-deleted out of a status_source=manual class it also '
  're-applies the final_placement snapshotted in the force_delete_dog audit '
  'row, because the manual rollup branch deliberately never re-ranks; derived '
  'classes re-derive through the entries trigger (MYK9-596, 20260817150000). '
  'A snapshot placement another live entry in the class now holds is NOT '
  're-applied — the secretary set that after the delete — and is listed in '
  'the result''s placements_skipped (MYK9-607). Stamps restored_at on the audit '
  'row it restored from, so that row never describes a later deletion. '
  'Returns jsonb: dog_id, '
  'entries_restored, placements_reapplied, placements_skipped.';

COMMENT ON FUNCTION public.get_deleted_dogs() IS
  'Admin -> Deleted Items dog list. Platform-admin only (zero rows otherwise). '
  'Returns the deleter''s email and name for both delete paths (NULL for rows '
  'without deleted_by) and, for a force-deleted dog, the audit facts from '
  'dog_force_delete_audit: when, by whom, which entries, which were paid, and '
  'the Stripe payment intents, plus `payments`: each affected entry''s intent, '
  'payment_status, entry_fee and refund_amount exactly as recorded at delete '
  'time, with no derived owed amount (MYK9-608).';

COMMIT;

NOTIFY pgrst, 'reload schema';
