import { useEffect, useRef, useState } from 'react';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';
import { isAtShowFullyOnDevice } from './atShowOnDevice';
import { subscribeAtShowSyncSettled, syncAtShowData } from './atShowDataAdapter';

/**
 * Whether this show (its entries, trials and classes) is on this device, as far
 * as the first hydration can tell. The shared "is this show on the device" signal (MYK9-1520; the dog
 * pages need the same answer, MYK9-1538):
 *
 * - `'pending'`: the first hydration of this show is still running.
 * - `'arrived'`: the entries are on this device, from that hydration or from an
 *   earlier save. A hydration that failed (offline) on a previously saved
 *   device is still `'arrived'`: the cached rows are the show.
 * - `'not-arrived'`: the hydration did not succeed AND some scope of this show
 *   (entries, trials or classes) has never completed a sync here. An empty list then means "not loaded", not
 *   "none".
 */
export type ShowHydrationState = 'pending' | 'arrived' | 'not-arrived';

const noop = () => {};

/** Entries, trials and classes all synced here; unreadable counts as not synced. */
const readEntriesMarker = isAtShowFullyOnDevice;

/**
 * Hydrates the at-show page's own show (trials, their classes, its entries) the
 * moment the page mounts, then again after every completed app-wide sync pass.
 *
 * MYK9-1333: the first hydration used to wait for the app-wide pass, which syncs
 * every replicated table but never downloads entries (they are show-scoped). On
 * a cold device under a slow server that pass alone outlasted a reader's
 * patience, so the class never showed a card. The show's own sync runs
 * alongside the app-wide one: watermarks are per scope and monotonic, and the
 * scoresheet and show boundary already sync this way.
 *
 * The first hydration shares the page's in-flight `syncAtShowData` operation,
 * so it waits on it without a second sync. The show-on-device marker is read
 * once, inside the settle and before the state is set, so the page never
 * renders between the two answers. Every later settled sync (e.g. "Save for show
 * day") re-reads the marker and moves the state either way (MYK9-1560).
 */
export function useAtShowShowHydration(
  showId: string | undefined,
  syncStatus: ReplicationSyncContextValue['status'],
  refresh: (forceSync: boolean) => Promise<void>
): ShowHydrationState {
  const [hydrated, setHydrated] = useState<{
    showId: string;
    state: Exclude<ShowHydrationState, 'pending'>;
  } | null>(null);
  const startedShowRef = useRef<string | null>(null);
  const passKeyRef = useRef<string | null>(null);
  // One ordering for every marker read, initial and settled: only the latest
  // issued read may set state (MYK9-1560).
  const markerReadRef = useRef(0);

  useEffect(() => {
    if (!showId || startedShowRef.current === showId) return;
    startedShowRef.current = showId;
    // A slower hydration of an earlier show must not overwrite a later one's
    // completion (MYK9-1379): only the show still being hydrated may record it.
    const forShow = showId;
    // MYK9-1509: a cold reload with no connection must not wait on a sync that
    // only a connection can finish. The replica is the show: settle from the
    // entries marker at once and leave the sync to the next online start (a
    // connection lost MID-sync is MYK9-1550). A later settled sync still
    // re-evaluates it below.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const read = ++markerReadRef.current;
      void readEntriesMarker(forShow).then(onDevice => {
        if (startedShowRef.current === forShow && read === markerReadRef.current)
          setHydrated({ showId: forShow, state: onDevice ? 'arrived' : 'not-arrived' });
      });
      return;
    }
    // Started before refresh() so both share one operation. Its result is not
    // trusted: a sync that reports success can still leave a scope short, so the
    // marker below decides, and a failed or rejected sync (offline) just settles.
    const outcome = syncAtShowData(forShow).then(noop, noop);
    // refresh() swallows sync failures (offline: keep the cached rows).
    void Promise.all([refresh(true).catch(() => {}), outcome]).then(
      async () => {
        // A reported success still has to leave every scope on the device (MYK9-1538).
        const read = ++markerReadRef.current;
        const state = (await readEntriesMarker(forShow)) ? 'arrived' : 'not-arrived';
        if (startedShowRef.current === forShow && read === markerReadRef.current)
          setHydrated({ showId: forShow, state });
      },
      () => {
        // Unreachable in practice (both inputs swallow rejections); never leave
        // the page on its skeleton if that changes.
        if (startedShowRef.current === forShow)
          setHydrated({ showId: forShow, state: 'not-arrived' });
      }
    );
  }, [refresh, showId]);

  useEffect(() => {
    if (!showId) return;
    let live = true;
    const unsubscribe = subscribeAtShowSyncSettled(showId, () => {
      // Both directions (MYK9-1560): a settled sync can complete a partial
      // replica or leave a once-complete one short (a trial added whose classes
      // failed). Cached rows stay on screen either way; only the notice changes.
      // Reads can finish out of order: only the latest one may set state.
      const read = ++markerReadRef.current;
      void readEntriesMarker(showId).then(onDevice => {
        if (!live || read !== markerReadRef.current) return;
        const next = onDevice ? 'arrived' : 'not-arrived';
        setHydrated(prev =>
          // A settled sync that lands before the first hydration finishes is
          // the newest answer: keep it, the older initial read is dropped above.
          prev?.showId === showId && prev.state === next ? prev : { showId, state: next }
        );
      });
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, [showId]);

  useEffect(() => {
    if (!showId || syncStatus.isSyncing || !syncStatus.lastSyncAt) return;
    const passKey = `${showId}:${syncStatus.lastSyncAt.getTime()}`;
    if (passKeyRef.current === passKey) return;
    passKeyRef.current = passKey;
    void refresh(true);
  }, [refresh, showId, syncStatus.isSyncing, syncStatus.lastSyncAt]);

  if (showId === undefined || hydrated?.showId !== showId) return 'pending';
  return hydrated.state;
}
