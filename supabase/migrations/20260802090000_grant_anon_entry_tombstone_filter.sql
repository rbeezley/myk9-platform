-- Public trial timelines use an exact, server-side entry count query that
-- filters soft-deleted rows. Keep the release-gate column allowlist narrow while
-- allowing PostgREST to authorize that filter for anonymous visitors.

GRANT SELECT (deleted_at) ON public.entries TO anon;

-- The grant-decision contract requires every standalone API-role grant to
-- document the authenticated role as well. Authenticated users already have a
-- table-wide entries read grant, so this is an explicit no-op that preserves
-- their existing access while keeping the migration decision auditable.
GRANT SELECT (deleted_at) ON public.entries TO authenticated;

COMMENT ON COLUMN public.entries.deleted_at IS
  'Anon may inspect this tombstone only to filter soft-deleted rows from public counts; '
  'no result or payment fields are exposed.';

NOTIFY pgrst, 'reload schema';
