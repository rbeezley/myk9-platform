-- MYK9-822: a server-side blocking-entry count that CANNOT drift from
-- soft_delete_dog's MK002 guard, because it shares the guard's own predicate.
--
-- THE GAP (MYK9-799 follow-up). countBlockingEntriesByDog (client) approximates
-- soft_delete_dog's guard with a PostgREST `.or()` filter that deliberately
-- omits result_status: `authenticated` has no column-SELECT grant on
-- entries.result_status (20260620001929_restrict_authenticated_entry_results.sql),
-- and naming an ungranted column inside an `or()` filter makes PostgREST refuse
-- the WHOLE request with 403 — which is what permanently disabled Delete for
-- every dog until MYK9-799 narrowed the filter. But narrower is not
-- equivalent: an entry can carry a settled result_status ('absent' or
-- 'excused') without is_scored or scoring_completed_at ever being set
-- (20260712180000, 20260904160000), and replicatedRunQueue.ts:49-52 documents
-- a real staging row in that state. Such a dog reads as "not blocked" on the
-- client, so Delete is enabled and the dialog shows no warning; the server's
-- soft_delete_dog still refuses with MK002 on the full predicate (no data is
-- ever lost), but the pre-click warning was wrong.
--
-- THE FIX. private.count_dog_blocking_entries(p_dog_id) is now the ONE
-- predicate. It is SECURITY DEFINER, so it reads entries.result_status
-- directly, bypassing the column grant that made a client-side filter
-- impossible — which is exactly why this has to be an RPC and not a wider
-- PostgREST grant (result_status stays ungranted; MYK9-799 is not reopened).
-- Both soft_delete_dog's guard and the new public.count_blocking_entries_by_dog
-- RPC call this one function, so they cannot diverge again the way the
-- client's hand-rolled filter diverged from the guard.
--
-- soft_delete_dog below is copied from the LATEST migration that defines it,
-- 20260916181700_force_delete_dog_audit_and_waitlist.sql, verified
-- byte-identical except the MK002 block, which now calls the shared predicate
-- instead of restating its arms inline. Nothing else about soft_delete_dog
-- changes: re-read 20260830190000's and 20260916181700's headers before
-- touching the ownership gate, the cascade, or the armband non-behaviour.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The shared predicate. Schema `private` already exists, created by
--    20260728210000_materialize_entry_access_context.sql; this only adds a
--    function to it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.count_dog_blocking_entries(p_dog_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)::integer
  FROM public.entries e
  WHERE e.dog_id = p_dog_id
    AND e.deleted_at IS NULL
    AND (
      e.payment_status = 'paid'
      OR e.is_scored IS TRUE
      OR e.scoring_completed_at IS NOT NULL
      OR (e.result_status IS NOT NULL AND e.result_status <> 'pending')
    );
$$;

COMMENT ON FUNCTION private.count_dog_blocking_entries(uuid) IS
  'MYK9-822: the ONE predicate for "does this dog have a live entry that '
  'blocks soft_delete_dog (MK002)". soft_delete_dog''s guard and '
  'public.count_blocking_entries_by_dog both call this instead of restating '
  'the condition, so the client pre-check and the server refusal cannot read '
  'differently. Internal: not reachable directly by anon, authenticated or '
  'service_role — only by the two SECURITY DEFINER callers running under this '
  'function''s owner.';

REVOKE ALL ON FUNCTION private.count_dog_blocking_entries(uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 2. soft_delete_dog — body copied from 20260916181700 verbatim except the
--    MK002 block, which now calls private.count_dog_blocking_entries instead
--    of restating its arms. The ownership gate, the entries/cart/waitlist
--    cascade and the armband non-behaviour are UNCHANGED.
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
  --
  -- MYK9-822: the predicate itself now lives in
  -- private.count_dog_blocking_entries, shared with the count RPC the client
  -- pre-check calls, so the two cannot drift apart again.
  IF (SELECT private.count_dog_blocking_entries(p_dog_id)) > 0 THEN
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

-- Restated verbatim from 20260916181700 (unchanged): this migration's
-- grant-decision contract requires every migration that (re)defines a public
-- function to carry its own anon/authenticated decision, not just the
-- migration that first added it.
REVOKE ALL ON FUNCTION public.soft_delete_dog(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.soft_delete_dog(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_dog(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. count_blocking_entries_by_dog — the delete dialog's pre-check RPC.
--    Authorization restates soft_delete_dog's caller check EXACTLY: owner,
--    co-owner, or platform admin, on a dog that is not already deleted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.count_blocking_entries_by_dog(p_dog_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_person_id uuid;
BEGIN
  SELECT public.get_my_person_id() INTO v_person_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.dogs d
    WHERE d.id = p_dog_id
      AND d.deleted_at IS NULL
      AND (
        d.owner_id = v_person_id
        OR d.co_owner_id = v_person_id
        OR (SELECT public.is_platform_admin())
      )
  ) THEN
    RAISE EXCEPTION 'Dog not found or permission denied' USING ERRCODE = '42501';
  END IF;

  RETURN private.count_dog_blocking_entries(p_dog_id);
END;
$$;

COMMENT ON FUNCTION public.count_blocking_entries_by_dog(uuid) IS
  'MYK9-822: the delete-dog dialog''s pre-check. Counts this dog''s live '
  'entries that would make soft_delete_dog refuse with MK002, calling the '
  'SAME private.count_dog_blocking_entries predicate the guard itself calls, '
  'so the warning and the refusal can never disagree — unlike the '
  'PostgREST `.or()` filter this replaces, which had to omit result_status '
  '(MYK9-799) because authenticated has no column-SELECT grant on it. '
  'Authorization restates soft_delete_dog''s caller check exactly: owner, '
  'co-owner, or platform admin, on a dog not already deleted.';

REVOKE ALL ON FUNCTION public.count_blocking_entries_by_dog(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_blocking_entries_by_dog(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.count_blocking_entries_by_dog(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_blocking_entries_by_dog(uuid) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
