import { useCallback, useSyncExternalStore } from 'react';
import { CONFLICT_SETTLED_EVENT } from './conflictEvents';
import { listHeldConflicts, type HeldConflict } from './heldConflicts';

// Events after which the set of held conflicts may have changed.
const REFRESH_EVENTS = [
  'replication:conflict',
  CONFLICT_SETTLED_EVENT,
  'replication:mutation-queued',
  'replication:upload-complete',
  'replication:recovery',
] as const;
const POLL_MS = 15000;

const listeners = new Set<() => void>();
let current: readonly HeldConflict[] = [];
let stopWatching: (() => void) | null = null;

function refresh() {
  void listHeldConflicts()
    .then(next => {
      current = next;
      listeners.forEach(listener => listener());
    })
    .catch(() => {
      /* best-effort; keep the last known list */
    });
}

/** One watcher for the whole app, however many headers read it. */
function startWatching() {
  refresh();
  for (const name of REFRESH_EVENTS) window.addEventListener(name, refresh);
  const interval = setInterval(refresh, POLL_MS);
  return () => {
    for (const name of REFRESH_EVENTS) window.removeEventListener(name, refresh);
    clearInterval(interval);
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  stopWatching ??= startWatching();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopWatching?.();
      stopWatching = null;
      current = [];
    }
  };
}

/** How many changes this user holds for a choice in this show. */
export function useHeldConflictCount(showId: string | undefined): number {
  const getSnapshot = useCallback(
    () => (showId ? current.filter(item => item.showId === showId).length : 0),
    [showId]
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}
