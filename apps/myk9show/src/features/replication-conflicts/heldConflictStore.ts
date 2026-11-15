import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';
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
// Bumped whenever the list is dropped, so a read that started for the previous person cannot land.
let generation = 0;

function setCurrent(next: readonly HeldConflict[]) {
  current = next;
  listeners.forEach(listener => listener());
}

/** Forget the list (sign-out or a different person); a read already in flight is ignored. */
function resetHeldConflicts() {
  generation += 1;
  setCurrent([]);
}

function refresh() {
  const started = generation;
  void listHeldConflicts()
    .then(next => {
      if (started === generation) setCurrent(next);
    })
    .catch(() => {
      // An unreadable list is unknown, not "still the same": never keep showing the last one.
      if (started === generation) setCurrent([]);
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
  const count = useSyncExternalStore(subscribe, getSnapshot, () => 0);
  // The list belongs to whoever is signed in: drop it when that changes, then read it again.
  const userId = useAuthContext().user?.id ?? null;
  useEffect(() => {
    resetHeldConflicts();
    if (userId) refresh();
    return resetHeldConflicts;
  }, [userId]);
  return count;
}
