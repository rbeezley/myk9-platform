-- Independent proof that shows a device still holds are gone from the server.
--
-- The shows replica reads through shows_select, so when another device deletes
-- the last show in a scope the coverage count and the fetch both return 0 -- the
-- same answer an RLS gap gives. The sync engine therefore refuses to clear a
-- populated replica without a second source. This reads public.shows directly
-- (SECURITY DEFINER), for the shows the caller may manage only, and reports
-- each one's liveness. manageable_show_ids() deliberately keeps soft-deleted
-- shows in its set, so a deleted show is returned with is_live = false; a show
-- the caller does not manage is simply absent, which the client reads as "not
-- proven" and never clears.
CREATE OR REPLACE FUNCTION public.get_manageable_show_liveness(p_show_ids uuid[])
RETURNS TABLE (show_id uuid, is_live boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.id, (s.deleted_at IS NULL)
  FROM public.shows s
  WHERE s.id = ANY (p_show_ids)
    AND s.id IN (SELECT public.manageable_show_ids());
$$;

REVOKE ALL ON FUNCTION public.get_manageable_show_liveness(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_manageable_show_liveness(uuid[]) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
