import { useShowStore } from '@/store/showStore';

/** Today as `YYYY-MM-DD` on the viewer's own calendar. */
function localCalendarDay(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Where a show is in its life, for the Actions items that depend on it (close-out). The replicated
 * store first (offline-durable, no read), then the show's own query result.
 *
 * `showStarted`: has the show's first day arrived, on the viewer's own calendar (the device is at
 * the show)? Unknown stays `undefined`, so a missing date never hides a row (MYK9-1727).
 */
export function useShowLifeFacts(
  showId: string | undefined,
  queriedShow: { status?: string | null; startDate?: string | null } | null | undefined
): { showStatus: string | undefined; showStarted: boolean | undefined } {
  const stored = useShowStore(state =>
    showId ? state.shows.find(show => show.id === showId) : undefined
  );
  const showStatus = stored?.status ?? queriedShow?.status ?? undefined;
  const startDate = stored?.startDate ?? queriedShow?.startDate ?? undefined;
  const showStarted = startDate ? startDate.slice(0, 10) <= localCalendarDay() : undefined;
  return { showStatus, showStarted };
}
