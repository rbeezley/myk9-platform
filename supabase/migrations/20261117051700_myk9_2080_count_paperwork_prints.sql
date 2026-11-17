-- MYK9-2080: the paperwork-print replica's empty-scope proof.
--
-- A device that holds another account's (or a pre-ownership build's)
-- server-backed print rows cannot stamp a scope as this account's after a
-- zero-row full sync, because an empty answer over a warm replica needs
-- independent proof (MYK9-880) and this table supplied none. The scope then
-- stayed foreign and the UI read "Print status unknown".
--
-- Why SECURITY DEFINER with an explicit access check. An RLS-scoped count
-- (SECURITY INVOKER) reads through the same paperwork_prints_select policy as
-- the sync's fetch, so a secretary who lost access to the show reads 0 of 0 and
-- 0 of 0 exactly like a show that is really empty. The proof would then stamp
-- the scope as theirs while their old cached rows stay, showing stale print
-- confirmations. So the function re-applies the policy's own access check
-- (can_manage_show OR is_show_secretary) itself:
--   * a caller who passes it gets the count of ALL prints for the show, which
--     is what RLS would show them anyway, so 0 means the show is really empty;
--   * a caller who does not pass it gets NULL: "can't tell", never "empty".
-- It reveals nothing a caller without access could use: they get NULL, the
-- same for a show with prints and a show without.
--
-- Signed-in sessions only. A call with no auth.uid() is refused with 42501;
-- the client reads that, NULL, an error or any non-zero count as unproven and
-- stamps nothing.

CREATE OR REPLACE FUNCTION public.count_paperwork_prints(p_show_id uuid)
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

  IF p_show_id IS NULL THEN
    RAISE EXCEPTION 'p_show_id is required' USING ERRCODE = '22004';
  END IF;

  -- The paperwork_prints_select policy's own predicate.
  IF NOT (
    (SELECT public.can_manage_show(p_show_id))
    OR (SELECT public.is_show_secretary(p_show_id))
  ) THEN
    RETURN NULL;
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.paperwork_prints p
  WHERE p.show_id = p_show_id;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.count_paperwork_prints(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_paperwork_prints(uuid) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
