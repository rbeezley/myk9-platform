import type { QueryClient, QueryFilters } from '@tanstack/react-query';

/** Detail of the package's `replication:rows-replaced` event (MYK9-1076). */
export interface RowsReplacedDetail {
  tableName: string;
  rowIds: string[];
}

/**
 * The replica replaced rows with the server's copy outside a sync or an upload,
 * so no existing event tells React Query. Refresh the table's queries by the
 * same `[tableName]` prefix a sync uses (for dogs: `['dogs']`, the list and
 * `['dogs', id]`), plus the owner's-dogs lists (`['users', id, 'dogs']`, which
 * that prefix does not reach).
 *
 * Cancel first, as `refetchShowEntriesAfterScopedSync` does: with no cached
 * data TanStack reuses a fetch already in flight, and that fetch may have read
 * the refused row before the re-pull replaced it, then land it as fresh.
 */
export function invalidateReplacedRows(queryClient: QueryClient, detail: RowsReplacedDetail) {
  const refresh = (filters: QueryFilters) =>
    void queryClient
      .cancelQueries(filters)
      .then(() => queryClient.invalidateQueries(filters))
      .catch(() => undefined);

  refresh({ queryKey: [detail.tableName] });
  if (detail.tableName === 'dogs') {
    refresh({ predicate: ({ queryKey }) => queryKey[0] === 'users' && queryKey[2] === 'dogs' });
  }
}
