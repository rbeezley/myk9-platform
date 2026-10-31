/**
 * The class picker's refresh control (MYK9-1506). Re-syncs the show through the
 * same `syncAtShowData` the entry list uses and keeps the outcome for a few
 * seconds, so a tap always answers: it worked, it failed, or this device is
 * offline and the list is what was already here.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { syncAtShowData } from './atShowDataAdapter';

export type ClassRefreshPhase = 'idle' | 'refreshing' | 'done' | 'failed' | 'offline';

const RESULT_VISIBLE_MS = 4000;

export const CLASS_REFRESH_MESSAGES: Record<Exclude<ClassRefreshPhase, 'idle'>, string> = {
  refreshing: 'Refreshing classes',
  done: 'Classes up to date',
  failed: "Couldn't refresh. Showing what is on this device.",
  offline: "You're offline. Showing what is on this device.",
};

export function useAtShowClassRefresh(
  showId: string | undefined,
  isOnline: boolean,
  reload: () => void
) {
  const [phase, setPhase] = useState<ClassRefreshPhase>('idle');
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    },
    []
  );

  const settle = useCallback((next: ClassRefreshPhase) => {
    setPhase(next);
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setPhase('idle'), RESULT_VISIBLE_MS);
  }, []);

  const refresh = useCallback(async () => {
    if (!showId || phase === 'refreshing') return;
    if (!isOnline) {
      settle('offline');
      return;
    }
    if (clearTimer.current) clearTimeout(clearTimer.current);
    setPhase('refreshing');
    try {
      const outcome = await syncAtShowData(showId, { forceFullSync: true });
      reload();
      settle(outcome.success ? 'done' : 'failed');
    } catch {
      settle('failed');
    }
  }, [showId, isOnline, phase, reload, settle]);

  return { phase, refresh };
}
