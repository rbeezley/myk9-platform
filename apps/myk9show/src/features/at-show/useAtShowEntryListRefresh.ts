/**
 * The entry list's refresh control answers like the class picker's (MYK9-1746,
 * MYK9-1506): one phase/result pair, so a tap always says done, failed, or
 * "you're offline". Shared by the single and the combined A/B entry list.
 */
import { useCallback } from 'react';
import { useOnlineStatus } from '@/lib/networkUtils';
import { useAtShowClassRefresh } from './useAtShowClassRefresh';

export function useAtShowEntryListRefresh(
  showId: string | undefined,
  refresh: (forceSync?: boolean) => Promise<void>
) {
  const isOnline = useOnlineStatus();
  // The hook runs the full sync itself; the list only needs to re-read after it.
  const reload = useCallback(() => void refresh(false), [refresh]);
  return useAtShowClassRefresh(showId, isOnline, reload);
}
