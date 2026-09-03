import { useEffect, useRef } from 'react';
import { onlineManager } from '@tanstack/react-query';
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
 * ## How it triggers the refetch
 *
 * By replaying the transition into `onlineManager` itself, rather than calling
 * `invalidateQueries()`. That matters for correctness, not elegance:
 * `refetchOnReconnect` governs TanStack's own reconnect trigger and has NO
 * effect on an explicit invalidation, so an unfiltered `invalidateQueries()`
 * silently overrides queries that opted out. Ringside's entry list is one —
 * `useEntryListData` sets `refetchOnReconnect: false` and routes invalidation
 * through a replication subscription that deliberately skips refreshes DURING A
 * DRAG, so refetching it here would snap a judge's half-finished run-order drag
 * back to the server's order the moment signal returned, mid-show.
 *
 * Filtering with `predicate: q => q.options.refetchOnReconnect !== false` also
 * works — that option does resolve correctly per query. Replaying the transition
 * is preferred because it delegates the whole policy to TanStack rather than
 * restating it: each observer applies its own `refetchOnReconnect`, including
 * the `'always'` vs `true`-and-stale distinction this app's default relies on,
 * and any future option in that family is honoured without changing this hook.
 *
 * The toggle is momentary and synchronous, so no query is ever left sitting in
 * the paused state that `networkMode: 'online'` produces while offline. That is
 * the state MYK9-372 showed this app mishandles, and avoiding it is the whole
 * reason this is not a persistent `onlineManager` sync.
 */
export function useRefetchQueriesOnReconnect(): void {
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
      logger.info('Back online - replaying reconnect for react-query', 'query');
      // Momentary: TanStack only notifies on a CHANGE, so it has to see the
      // drop before it can see the recovery. Both calls land in the same tick.
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
}
