import { useQuery } from '@tanstack/react-query';
import { getPendingEntries, type PendingEntry } from '@/services/database/entries';

export const PENDING_ENTRIES_KEY = 'pending-entries';
export type { PendingEntry };

export function usePendingEntries(showIdFilter?: string) {
  return useQuery({
    queryKey: [PENDING_ENTRIES_KEY, showIdFilter ?? 'all'],
    queryFn: () => getPendingEntries(showIdFilter),
  });
}
