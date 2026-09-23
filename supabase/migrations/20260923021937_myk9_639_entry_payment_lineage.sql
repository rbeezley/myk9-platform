-- MYK9-639: derive and lock a valid money-root to live-entry chain.

BEGIN;

CREATE OR REPLACE FUNCTION public.resolve_entry_payment_lineage(
  p_source_entry_id uuid,
  p_expected_show_id uuid,
  p_expected_amount_cents integer,
  p_allow_expired_promotion boolean
)
RETURNS TABLE(money_root_entry_id uuid, live_entry_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_root_id uuid;
  v_root public.entries%ROWTYPE;
  v_dog_id uuid;
  v_live_id uuid;
  v_leaf_count integer;
  v_invalid boolean;
  v_depth integer;
  v_live_class_id uuid;
  v_live_status text;
BEGIN
  WITH RECURSIVE ancestors(id, parent_id, depth, path) AS (
    SELECT e.id, e.moved_from_entry_id, 0, ARRAY[e.id]
      FROM public.entries AS e WHERE e.id = p_source_entry_id
    UNION ALL
    SELECT parent.id, parent.moved_from_entry_id, child.depth + 1, child.path || parent.id
      FROM ancestors AS child
      JOIN public.entries AS parent ON parent.id = child.parent_id
     WHERE child.depth < 16 AND NOT parent.id = ANY(child.path)
  )
  SELECT a.id INTO v_root_id FROM ancestors AS a
   WHERE a.parent_id IS NULL ORDER BY a.depth DESC LIMIT 1;
  IF v_root_id IS NULL OR EXISTS (
    WITH RECURSIVE ancestors(id, parent_id, depth, path) AS (
      SELECT e.id, e.moved_from_entry_id, 0, ARRAY[e.id]
        FROM public.entries AS e WHERE e.id = p_source_entry_id
      UNION ALL
      SELECT parent.id, parent.moved_from_entry_id, child.depth + 1, child.path || parent.id
        FROM ancestors AS child JOIN public.entries AS parent ON parent.id = child.parent_id
       WHERE child.depth < 16 AND NOT parent.id = ANY(child.path)
    ) SELECT 1 FROM ancestors WHERE parent_id IS NOT NULL AND depth = 16
  ) THEN
    RAISE EXCEPTION 'The payment entry has missing or cyclic move-up ancestry.' USING ERRCODE = '22023';
  END IF;

  -- Hold a stable lock on the full known path and descendant graph. The update
  -- RPCs lock source/destination rows, so they cannot change the graph until
  -- this transaction either commits or rolls back.
  PERFORM e.id FROM public.entries AS e
   WHERE e.id IN (
     WITH RECURSIVE ancestors(id, parent_id, depth, path) AS (
       SELECT row.id, row.moved_from_entry_id, 0, ARRAY[row.id]
         FROM public.entries AS row WHERE row.id = p_source_entry_id
       UNION ALL
       SELECT parent.id, parent.moved_from_entry_id, child.depth + 1, child.path || parent.id
         FROM ancestors AS child JOIN public.entries AS parent ON parent.id = child.parent_id
        WHERE child.depth < 16 AND NOT parent.id = ANY(child.path)
     ) SELECT id FROM ancestors
   ) ORDER BY e.id FOR UPDATE;
  PERFORM e.id FROM public.entries AS e
   WHERE e.id IN (
     WITH RECURSIVE descendants(id, depth, path) AS (
       SELECT root.id, 0, ARRAY[root.id] FROM public.entries AS root WHERE root.id = v_root_id
       UNION ALL
       SELECT child.id, parent.depth + 1, parent.path || child.id
         FROM descendants AS parent JOIN public.entries AS child ON child.moved_from_entry_id = parent.id
        WHERE parent.depth < 16 AND NOT child.id = ANY(parent.path)
     ) SELECT id FROM descendants
   ) ORDER BY e.id FOR UPDATE;

  SELECT * INTO v_root FROM public.entries AS e WHERE e.id = v_root_id;
  IF v_root.id IS NULL OR v_root.deleted_at IS NOT NULL
     OR v_root.show_id IS DISTINCT FROM p_expected_show_id
     OR round(v_root.entry_fee * 100)::integer IS DISTINCT FROM p_expected_amount_cents
     OR v_root.payment_status IS DISTINCT FROM 'pending'
     OR v_root.stripe_payment_intent_id IS NOT NULL
     OR COALESCE(v_root.refund_amount, 0) <> 0 OR v_root.refunded_at IS NOT NULL THEN
    RAISE EXCEPTION 'The payment money root changed or no longer matches the issued price.'
      USING ERRCODE = '22023';
  END IF;
  v_dog_id := v_root.dog_id;

  WITH RECURSIVE descendants(id, depth, path) AS (
    SELECT root.id, 0, ARRAY[root.id] FROM public.entries AS root WHERE root.id = v_root_id
    UNION ALL
    SELECT child.id, parent.depth + 1, parent.path || child.id
      FROM descendants AS parent JOIN public.entries AS child ON child.moved_from_entry_id = parent.id
     WHERE parent.depth < 16 AND child.deleted_at IS NULL AND NOT child.id = ANY(parent.path)
  ), shape AS (
    SELECT max(d.depth) AS max_depth,
           count(*) FILTER (WHERE NOT EXISTS (
             SELECT 1 FROM public.entries AS child
              WHERE child.moved_from_entry_id = d.id AND child.deleted_at IS NULL)) AS leaves,
           count(*) FILTER (WHERE e.show_id IS DISTINCT FROM p_expected_show_id
                               OR e.dog_id IS DISTINCT FROM v_dog_id) AS identity_mismatch,
           bool_or(EXISTS (SELECT 1 FROM public.entries AS child
             WHERE child.moved_from_entry_id = d.id AND child.deleted_at IS NULL)
             AND e.entry_status IS DISTINCT FROM 'moved') AS non_moved_parent,
           bool_or(d.depth = 16 AND EXISTS (SELECT 1 FROM public.entries AS child
             WHERE child.moved_from_entry_id = d.id AND child.deleted_at IS NULL)) AS over_depth,
           bool_or((SELECT count(*) FROM public.entries AS child
             WHERE child.moved_from_entry_id = d.id AND child.deleted_at IS NULL) > 1) AS forked,
           -- A moved row is only a valid internal node. A soft-deleted
           -- successor does not itself complete a reversal of that status.
           bool_or(NOT EXISTS (SELECT 1 FROM public.entries AS child
             WHERE child.moved_from_entry_id = d.id AND child.deleted_at IS NULL)
             AND e.entry_status IN ('moved','withdrawn','scratched','not_accepted','absent','cancelled')) AS inactive_leaf,
           bool_or(d.depth > 0 AND (e.entry_fee <> 0 OR e.payment_status <> 'pending'
             OR e.payment_method IS NOT NULL OR e.stripe_payment_intent_id IS NOT NULL
             OR COALESCE(e.refund_amount, 0) <> 0 OR e.refunded_at IS NOT NULL)) AS child_has_money
      FROM descendants AS d JOIN public.entries AS e ON e.id = d.id
     WHERE e.deleted_at IS NULL
  )
  SELECT max_depth, leaves, identity_mismatch > 0 OR non_moved_parent OR over_depth
    OR forked OR inactive_leaf OR child_has_money
    INTO v_depth, v_leaf_count, v_invalid FROM shape;
  IF v_invalid OR v_leaf_count <> 1 OR v_depth > 16 THEN
    RAISE EXCEPTION 'The move-up chain has a fork, reversal, or invalid live service row.'
      USING ERRCODE = '22023';
  END IF;
  WITH RECURSIVE descendants(id, depth, path) AS (
    SELECT root.id, 0, ARRAY[root.id] FROM public.entries AS root WHERE root.id = v_root_id
    UNION ALL
    SELECT child.id, parent.depth + 1, parent.path || child.id
      FROM descendants AS parent JOIN public.entries AS child ON child.moved_from_entry_id = parent.id
     WHERE parent.depth < 16 AND child.deleted_at IS NULL AND NOT child.id = ANY(parent.path)
  )
  SELECT d.id INTO v_live_id FROM descendants AS d JOIN public.entries AS e ON e.id = d.id
   WHERE e.deleted_at IS NULL AND NOT EXISTS (
     SELECT 1 FROM public.entries AS child
      WHERE child.moved_from_entry_id = e.id AND child.deleted_at IS NULL)
   ORDER BY d.depth DESC LIMIT 1;

  SELECT e.class_id, e.entry_status INTO v_live_class_id, v_live_status
    FROM public.entries AS e WHERE e.id = v_live_id;
  IF v_live_class_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext(v_live_class_id::text)
    );
    PERFORM w.id FROM public.waitlist_entries AS w
     WHERE w.class_id = v_live_class_id
       AND (w.status = 'offered' OR w.promoted_entry_id = v_live_id)
     ORDER BY w.id FOR UPDATE;
  END IF;

  IF v_live_status = 'promotion-expired' THEN
    IF NOT p_allow_expired_promotion THEN
      RAISE EXCEPTION 'An expired waitlist promotion is no longer eligible for payment.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.waitlist_entries AS w
        WHERE w.promoted_entry_id = v_live_id AND w.status = 'expired')
       OR EXISTS (SELECT 1 FROM public.waitlist_entries AS w
        WHERE w.class_id = v_live_class_id AND w.status = 'offered'
          AND w.promoted_entry_id IS DISTINCT FROM v_live_id) THEN
      RAISE EXCEPTION 'An expired waitlist claim has a replacement offer or no matching offer.'
        USING ERRCODE = '22023';
    END IF;
  ELSIF v_root.entry_status IN ('withdrawn','scratched','not_accepted','absent','cancelled')
     OR v_live_id IS NULL THEN
    RAISE EXCEPTION 'The payment entry is no longer active.' USING ERRCODE = '22023';
  END IF;

  money_root_entry_id := v_root_id;
  live_entry_id := v_live_id;
  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_entry_payment_lineage(uuid, uuid, integer, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_entry_payment_lineage(uuid, uuid, integer, boolean)
  TO service_role;

CREATE OR REPLACE FUNCTION public.quote_entry_payment_lineage(
  p_source_entry_id uuid,
  p_allow_expired_promotion boolean DEFAULT false
)
RETURNS TABLE(
  money_root_entry_id uuid,
  live_entry_id uuid,
  show_id uuid,
  dog_id uuid,
  entry_fee_cents integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_root_id uuid;
  v_show_id uuid;
  v_fee_cents integer;
  v_lineage record;
  v_dog_id uuid;
BEGIN
  WITH RECURSIVE ancestors(id, parent_id, depth, path) AS (
    SELECT e.id, e.moved_from_entry_id, 0, ARRAY[e.id]
      FROM public.entries AS e WHERE e.id = p_source_entry_id
    UNION ALL
    SELECT parent.id, parent.moved_from_entry_id, child.depth + 1, child.path || parent.id
      FROM ancestors AS child JOIN public.entries AS parent ON parent.id = child.parent_id
     WHERE child.depth < 16 AND NOT parent.id = ANY(child.path)
  )
  SELECT a.id, e.show_id, e.dog_id, round(e.entry_fee * 100)::integer
    INTO v_root_id, v_show_id, v_dog_id, v_fee_cents
    FROM ancestors AS a JOIN public.entries AS e ON e.id = a.id
   WHERE a.parent_id IS NULL ORDER BY a.depth DESC LIMIT 1;
  IF v_root_id IS NULL THEN
    RAISE EXCEPTION 'The payment entry has no valid money root.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO STRICT v_lineage
    FROM public.resolve_entry_payment_lineage(
      p_source_entry_id, v_show_id, v_fee_cents, p_allow_expired_promotion
    );
  RETURN QUERY SELECT v_lineage.money_root_entry_id, v_lineage.live_entry_id,
    v_show_id, v_dog_id, v_fee_cents;
END;
$function$;

REVOKE ALL ON FUNCTION public.quote_entry_payment_lineage(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quote_entry_payment_lineage(uuid, boolean)
  TO service_role;

COMMIT;
