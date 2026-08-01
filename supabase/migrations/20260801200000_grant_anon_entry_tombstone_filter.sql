-- Public trial timelines use an exact, server-side entry count query that
-- filters soft-deleted rows. Keep the release-gate column allowlist narrow while
-- allowing PostgREST to authorize that filter for anonymous visitors.

GRANT SELECT (deleted_at) ON public.entries TO anon;

COMMENT ON COLUMN public.entries.deleted_at IS
  'Anon may inspect this tombstone only to filter soft-deleted rows from public counts; '
  'no result or payment fields are exposed.';

NOTIFY pgrst, 'reload schema';
