import type { QueryClient } from '@tanstack/react-query';
import { SHOW_ENTRY_COUNTS_ROOT } from '@/hooks/queries/useShowEntryCounts';

/**
 * Queries derived from a replicated table that live outside that table's own
 * key root, refreshed alongside it. Kept out of the table's root because
 * mutation hooks rewrite every query under it as an array of rows
 * (MYK9-1311: the dashboard's per-show entry counts are a Map).
 */
const DERIVED_ROOTS: Readonly<Record<string, readonly string[]>> = {
  entries: [SHOW_ENTRY_COUNTS_ROOT],
};

export function invalidateDerivedQueries(queryClient: QueryClient, tableName: string): void {
  for (const root of DERIVED_ROOTS[tableName] ?? []) {
    void queryClient.invalidateQueries({ queryKey: [root] });
  }
}
