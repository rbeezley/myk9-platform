/**
 * Query-key prefix of `useLocalEntryForShowToday` (MYK9-1416), and the replicas
 * its answer is derived from. Lives apart from the hook so the replication
 * provider can invalidate it without importing a React hook.
 */
export const LOCAL_ENTRY_TODAY_KEY = ['at-show', 'local-entry-today'] as const;

export const LOCAL_ENTRY_TODAY_SOURCE_TABLES: ReadonlySet<string> = new Set([
  'shows',
  'trials',
  'entries',
  'dogs',
]);
