-- MYK9-2080: the paperwork-print replica's empty-scope proof.
--
-- A device that holds another account's (or a pre-ownership build's)
-- server-backed print rows cannot stamp a scope as this account's after a
-- zero-row full sync, because an empty answer over a warm replica needs
-- independent proof (MYK9-880) and this table supplied none. The scope then
-- stayed foreign and the UI read "Print status unknown".
--
-- The question here is not "do these ids still exist" (the waitlist proof,
-- MYK9-1000, runs SECURITY DEFINER over RLS because it must tell "deleted"
-- from "I can't see it"). Here the held rows belong to ANOTHER account, so they
-- exist and this caller was never meant to see them; what the sync needs to
-- know is whether THIS caller's read of the show holds anything. So this is
-- SECURITY INVOKER: it counts through the same paperwork_prints_select policy
-- (can_manage_show OR is_show_secretary) the sync's own fetch reads through,
-- and answers 0 exactly when that fetch returns nothing. A DEFINER version
-- would count rows the caller cannot read and never prove the scope empty.
--
-- It reveals nothing beyond what the caller can already select. Signed-in
-- sessions only; a call with no auth.uid() is refused with 42501, which the
-- client reads as "can't tell" and keeps the replica.

CREATE OR REPLACE FUNCTION public.count_paperwork_prints(p_show_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
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

  SELECT count(*)::integer INTO v_count
  FROM public.paperwork_prints p
  WHERE p.show_id = p_show_id;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.count_paperwork_prints(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_paperwork_prints(uuid) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
