-- MYK9-1000: independent proof that waitlist rows a device holds are gone.
--
-- Waitlist rows are hard-deleted (secretary Remove, exhibitor Withdraw). The
-- replica clears a removed row after a complete full fetch, but when the LAST
-- row a device can see is removed elsewhere the fetch and the coverage count
-- both read zero, which is exactly what an RLS gap looks like (MYK9-880): a
-- revoked role or a session that lost its claims also reads 0 of 0. The sync
-- engine therefore clears a warm replica on a zero-row fetch only when
-- `verifyScopeEmpty` proves the scope empty from a source the caller's RLS
-- cannot hide rows from.
--
-- This function is that source. It answers "how many of THESE ids still
-- exist", ignoring RLS:
--   * a row that still exists but the caller can no longer see is counted, so
--     "can't see" never reads as "empty" and the replica is kept;
--   * only rows that are really gone read zero.
-- It reveals nothing but the existence of ids the caller passes. Waitlist ids
-- are random UUIDs a device only learns by having been allowed to read the
-- row, so the oracle tells a caller nothing it could not already have known.
--
-- Signed-in sessions only (the table itself is not granted to anon). A call
-- with no auth.uid() is refused with 42501, which the client reads as "can't
-- tell" and keeps the replica.

CREATE OR REPLACE FUNCTION public.count_live_waitlist_entries(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  IF p_ids IS NULL THEN
    RAISE EXCEPTION 'p_ids is required' USING ERRCODE = '22004';
  END IF;

  -- The client batches; this bounds what one call can probe.
  IF cardinality(p_ids) > 500 THEN
    RAISE EXCEPTION 'At most 500 ids per call' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.waitlist_entries w
  WHERE w.id = ANY (p_ids);

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.count_live_waitlist_entries(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_live_waitlist_entries(uuid[]) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
