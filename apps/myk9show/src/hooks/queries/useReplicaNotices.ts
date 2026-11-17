import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  getHandlerPeopleHydrationRevision,
  subscribeHandlerPeopleHydration,
} from '@/services/database/entries/handlerHydration';

export interface ReplicaNoticeSource {
  subscribe: (listener: () => void, options?: { emitCurrent?: boolean }) => () => void;
}

/**
 * Calls `onNotice` on every change notice from `sources` while `enabled`, never on the initial
 * emit. `debounceMs` coalesces a burst (one score writes entries, dogs and more) into one call.
 * `sources` must be a stable array (module constant). `onPendingChange(true)` fires when a notice is
 * waiting out its debounce and `(false)` once it has been delivered, so a caller can tell "the
 * replica changed and the read has not caught up yet". Shared by `useReportData` and
 * `usePrintedSheetEntries` so both react to the replica the same way (MYK9-2103).
 */
export function useReplicaNotices(
  enabled: boolean,
  sources: readonly ReplicaNoticeSource[],
  onNotice: () => void,
  debounceMs = 0,
  onPendingChange?: (pending: boolean) => void
): void {
  const onNoticeRef = useRef(onNotice);
  const onPendingRef = useRef(onPendingChange);
  useEffect(() => {
    onNoticeRef.current = onNotice;
    onPendingRef.current = onPendingChange;
  });

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const notify = () => {
      if (debounceMs <= 0) {
        onNoticeRef.current();
        return;
      }
      if (timer !== undefined) clearTimeout(timer);
      onPendingRef.current?.(true);
      timer = setTimeout(() => {
        timer = undefined;
        onNoticeRef.current();
        onPendingRef.current?.(false);
      }, debounceMs);
    };
    const unsubscribes = sources.map(source => source.subscribe(notify, { emitCurrent: false }));
    return () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        onPendingRef.current?.(false);
      }
      unsubscribes.forEach(unsubscribe => unsubscribe());
    };
  }, [debounceMs, enabled, sources]);
}

function subscribeToHandlerPeopleRevision(onStoreChange: () => void): () => void {
  return subscribeHandlerPeopleHydration(() => onStoreChange());
}

/** Calls `onChange` when handler people finish hydrating (not on mount). */
export function useHandlerPeopleRevisionChange(onChange: () => void): void {
  const revision = useSyncExternalStore(
    subscribeToHandlerPeopleRevision,
    getHandlerPeopleHydrationRevision,
    getHandlerPeopleHydrationRevision
  );
  const previous = useRef(revision);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    if (previous.current === revision) return;
    previous.current = revision;
    onChangeRef.current();
  }, [revision]);
}
