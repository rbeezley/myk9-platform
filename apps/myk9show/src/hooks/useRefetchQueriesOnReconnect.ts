import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { logger } from '@/services/LoggingService';

/**
 * Refetch active queries when connectivity comes back.
 *
 * ## Why this exists rather than `refetchOnReconnect`
 *
 * `lib/queryClient.ts` already sets `refetchOnReconnect: 'always'`. That option
 * is dead code today. TanStack drives it from `onlineManager`, which initialises
 * `#online = true` unconditionally and only ever changes on a window
 * `online`/`offline` EVENT — it never reads `navigator.onLine`. So:
 *
 *   - a page that BOOTS with no signal gets no event, and the manager believes
 *     it is online the whole time;
 *   - when signal returns, the browser fires `online`, `setOnline(true)` finds
 *     `#online` already `true`, `#online !== online` is false, and **no listener
 *     runs**. The reconnect is swallowed.
 *
 * Measured on a cold offline boot of `/exhibitor/entries` (MYK9-365): `<main>`
 * held 254 characters offline, still 254 twenty seconds after connectivity
 * returned, and 98,558 after a manual reload. Reconnect recovered nothing.
 *
 * ## Why not just sync `onlineManager` from `navigator.onLine`
 *
 * That one-liner looks like the obvious fix and was this issue's original
 * suggestion. It would also flip every query in the app from `error` to
 * `pending`/`paused` while offline, because `networkMode` is `'online'`.
 * MYK9-372 is what this codebase does with an unbounded pending state: My Shows
 * and both at-show entry lists rendered a skeleton with no exit, on show-day
 * surfaces, and nobody noticed for three call sites. Error states here are
 * bounded and offer a retry. Converting 123 `useQuery` call sites from the state
 * this app handles into the state it demonstrably mishandles is the wrong trade,
 * so this restores the RECOVERY without touching any query's state shape.
 *
 * ## Shape
 *
 * Fires once per offline→online transition, never on mount. Mount seeds from
 * `navigator.onLine` so a boot that started offline still counts its first
 * reconnect — that is precisely the cold-boot case above, and it is the one a
 * naive "listen for events only" version would miss.
 *
 * `invalidateQueries()` with no filter marks everything stale and refetches the
 * ACTIVE ones (TanStack's default `refetchType: 'active'`), so mounted screens
 * recover and background cache entries simply refetch when next used. Repeated
 * flapping costs one round per drop, and TanStack dedupes concurrent identical
 * fetches, so overlapping rounds collapse rather than stacking.
 */
export function useRefetchQueriesOnReconnect(): void {
  const queryClient = useQueryClient();
  // Seeded from the CURRENT state, not from `false`: mounting while online must
  // not look like a recovery, and mounting while offline must arm one.
  const wasOffline = useRef(typeof navigator !== 'undefined' && !navigator.onLine);

  useEffect(() => {
    const handleOffline = () => {
      wasOffline.current = true;
    };

    const handleOnline = () => {
      if (!wasOffline.current) return;
      wasOffline.current = false;
      logger.info('Back online - refetching active queries', 'query');
      void queryClient.invalidateQueries();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [queryClient]);
}
