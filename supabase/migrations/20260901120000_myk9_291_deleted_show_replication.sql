-- Preserve deleted-show metadata on the scoped My Entries replication path.
BEGIN;

CREATE OR REPLACE VIEW public.view_authenticated_entry_results_replication
  WITH (security_invoker = false)
AS
SELECT
  entries.*,
  shows.deleted_at AS show_deleted_at,
  shows.name AS source_show_name,
  shows.start_date AS source_show_start_date,
  shows.end_date AS source_show_end_date
FROM public.view_authenticated_entry_results AS entries
LEFT JOIN public.shows AS shows ON shows.id = entries.show_id;

GRANT SELECT ON public.view_authenticated_entry_results_replication TO authenticated;
GRANT SELECT ON public.view_authenticated_entry_results_replication TO service_role;
REVOKE SELECT ON public.view_authenticated_entry_results_replication FROM anon;

NOTIFY pgrst, 'reload schema';
COMMIT;
