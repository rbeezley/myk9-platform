-- Aggregate class recipient counts for Message Center class targeting.
--
-- SECURITY INVOKER is intentional: counts must respect the caller's entries RLS,
-- but aggregation happens inside Postgres so the result is not capped by the
-- PostgREST max_rows limit that applies when fetching raw entry rows.

CREATE OR REPLACE FUNCTION public.get_message_class_entry_counts(p_class_ids uuid[])
RETURNS TABLE (class_id uuid, entry_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT e.class_id, COUNT(*)::bigint AS entry_count
  FROM public.entries e
  WHERE e.class_id = ANY(p_class_ids)
    AND e.deleted_at IS NULL
  GROUP BY e.class_id
$$;

COMMENT ON FUNCTION public.get_message_class_entry_counts(uuid[]) IS
  'Returns RLS-scoped non-deleted entry counts per class for Message Center class targeting.';

REVOKE EXECUTE ON FUNCTION public.get_message_class_entry_counts(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.get_message_class_entry_counts(uuid[]) TO authenticated;
