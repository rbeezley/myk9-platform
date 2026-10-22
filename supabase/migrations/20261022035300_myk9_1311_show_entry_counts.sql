-- MYK9-1311: one live entry count per show, for the cross-show secretary dashboard.
--
-- No client-side source carried a real per-show entry count (TrialClass.entries and
-- getShowsWithEntryCounts both returned a constant 0, and per-show entry replicas are
-- not seeded on account surfaces). This RPC is the server-side, online-only answer.
--
-- Definition (the number the show's own Entries page reports as "Entries",
-- summarizeShowRegistrationTotals().entryCount): entries rows with show_id = the show
-- and deleted_at IS NULL, in ANY entry_status. Withdrawn and scratched entries still
-- count, because the Entries page lists them (Pulls view) and counts them. This is the
-- same predicate as get_secretary_live_entry_count(uuid), applied to many shows.
--
-- Authorization: SECURITY DEFINER (entries is column-allowlisted for callers), so the
-- manager filter is restated per show with can_manage_show(): a show the caller cannot
-- manage produces NO row (never a 0), so a count is not leaked and "unknown" is never
-- read as "empty". Shows the caller manages with no entries produce a real 0 row.
CREATE OR REPLACE FUNCTION public.get_show_entry_counts(p_show_ids uuid[])
RETURNS TABLE (show_id uuid, entry_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.id AS show_id, count(e.id)::integer AS entry_count
  FROM (SELECT DISTINCT u.id FROM unnest(p_show_ids) AS u(id)) AS ids
  JOIN public.shows s ON s.id = ids.id
  LEFT JOIN public.entries e ON e.show_id = s.id AND e.deleted_at IS NULL
  WHERE coalesce(public.can_manage_show(s.id), false)
  GROUP BY s.id;
$$;

COMMENT ON FUNCTION public.get_show_entry_counts(uuid[]) IS
  'MYK9-1311: live entry count (deleted_at IS NULL, any status; the Entries page "Entries" total) for each requested show the caller can manage. Shows the caller cannot manage return no row.';

REVOKE ALL ON FUNCTION public.get_show_entry_counts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_show_entry_counts(uuid[]) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
