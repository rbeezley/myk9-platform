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
 * `sources` must be a stable array (module constant). Shared by `useReportData` and
 * `usePrintedSheetEntries` so both react to the replica the same way (MYK9-2103).
 */
export function useReplicaNotices(
  enabled: boolean,
  sources: readonly ReplicaNoticeSource[],
  onNotice: () => void,
  debounceMs = 0
): void {
  const onNoticeRef = useRef(onNotice);
  useEffect(() => {
    onNoticeRef.current = onNotice;
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
      timer = setTimeout(() => {
        timer = undefined;
        onNoticeRef.current();
      }, debounceMs);
    };
    const unsubscribes = sources.map(source => source.subscribe(notify, { emitCurrent: false }));
    return () => {
      if (timer !== undefined) clearTimeout(timer);
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
