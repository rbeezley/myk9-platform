/**
 * The entry list's refresh control answers like the class picker's (MYK9-1746,
 * MYK9-1506): one phase/result pair, so a tap always says done, failed, or
 * "you're offline", as a toast with one fixed id so repeated taps collapse into
 * one. Sonner is viewport-fixed with its own live region, so the answer stays
 * visible after scrolling and is announced. Shared by the single and the combined A/B entry list.
 */
import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { useOnlineStatus } from '@/lib/networkUtils';
import { CLASS_REFRESH_MESSAGES, useAtShowClassRefresh } from './useAtShowClassRefresh';

const ENTRY_LIST_REFRESH_TOAST_ID = 'entry-list-refresh';
const TOAST_MS = 4000;

export function useAtShowEntryListRefresh(
  showId: string | undefined,
  refresh: (forceSync?: boolean) => Promise<void>
) {
  const isOnline = useOnlineStatus();
  // The hook runs the full sync itself; the list only needs to re-read after it.
  const reload = useCallback(() => void refresh(false), [refresh]);
  const result = useAtShowClassRefresh(showId, isOnline, reload);
  const { phase } = result;
  useEffect(() => {
    if (phase === 'idle' || phase === 'refreshing') return;
    const options = { id: ENTRY_LIST_REFRESH_TOAST_ID, duration: TOAST_MS };
    if (phase === 'done') toast(CLASS_REFRESH_MESSAGES.done, options);
    else toast.warning(CLASS_REFRESH_MESSAGES[phase], options);
  }, [phase]);
  return result;
}
