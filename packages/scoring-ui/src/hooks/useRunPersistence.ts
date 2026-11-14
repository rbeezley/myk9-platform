/**
 * Keeps one run timer's progress on the device while it runs (MYK9-2007), and
 * hands back what a reload found. The timer owns its own clock; this only
 * checkpoints it (once a second while running, on every transition the timer
 * reports through `sync`, and when the page is hidden or unloaded).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { clearSavedRun, restoreRun, writeSavedRun, type RestoredRun } from '../utils/savedRun';

const CHECKPOINT_MS = 1000;

export interface RunSnapshot {
  elapsedMs: number;
  running: boolean;
}

export interface UseRunPersistenceOptions {
  /** Where the record lives. Absent, nothing is kept or restored. */
  persistKey: string | undefined;
  /** Which of several timed slots the run belongs to (Nationals area). */
  slot?: number | undefined;
  /** The timer's live state, read when a checkpoint is written. */
  read: () => RunSnapshot;
  /** Whether the timer is running, so the once-a-second checkpoint only runs then. */
  running: boolean;
}

export function useRunPersistence({ persistKey, slot, read, running }: UseRunPersistenceOptions) {
  // Read once, before the first paint, so the timer opens on what the reload left.
  const [restored] = useState<RestoredRun | null>(() => restoreRun(persistKey));
  const readRef = useRef(read);
  const slotRef = useRef(slot);
  const unloadingRef = useRef(false);
  useEffect(() => {
    readRef.current = read;
    slotRef.current = slot;
  });

  const sync = useCallback(() => {
    if (!persistKey) return;
    const { elapsedMs, running: isRunning } = readRef.current();
    if (elapsedMs <= 0 && !isRunning) {
      clearSavedRun(persistKey);
      return;
    }
    writeSavedRun(persistKey, { elapsedMs, running: isRunning, slot: slotRef.current });
  }, [persistKey]);

  const clear = useCallback(() => {
    if (persistKey) clearSavedRun(persistKey);
  }, [persistKey]);

  useEffect(() => {
    if (!persistKey || !running) return;
    const id = setInterval(sync, CHECKPOINT_MS);
    return () => clearInterval(id);
  }, [persistKey, running, sync]);

  useEffect(() => {
    if (!persistKey) return;
    const onHide = () => {
      if (document.visibilityState === 'hidden') sync();
    };
    const onUnload = () => {
      unloadingRef.current = true;
      sync();
    };
    unloadingRef.current = false;
    // Re-stamps the record a StrictMode remount just cleared.
    sync();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onUnload);
      // Leaving the sheet (saved, or discarded) ends the run. A page unload does
      // not: that is the reload this record exists for.
      if (!unloadingRef.current) clearSavedRun(persistKey);
    };
  }, [persistKey, sync]);

  return { restored, sync, clear };
}
