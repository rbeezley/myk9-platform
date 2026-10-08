import { useEffect, type MutableRefObject } from 'react';
import { SYNC_INTERVAL_MS } from '@myk9/replication';
import { logger } from '@/services/LoggingService';
import { createSyncPassScheduler, type SyncPassScheduler } from './syncPassScheduler';

/**
 * Wires the triggers that start an UNTARGETED full sync pass: the background
 * poll, the tab becoming visible, and `replication:sync-requested`.
 *
 * Poll and visibility go through one scheduler that spaces them >= 15s apart and
 * never polls a hidden tab (a pass owed to a hidden tab is made up by the
 * visibility catch-up). Explicit requests run promptly.
 */
export function useSyncPassScheduler(
  autoSync: boolean,
  triggerSyncRef: MutableRefObject<(() => Promise<void>) | undefined>,
  schedulerRef: MutableRefObject<SyncPassScheduler | null>
): void {
  useEffect(() => {
    const scheduler = createSyncPassScheduler({
      run: () => void triggerSyncRef.current?.(),
      canRun: () => document.visibilityState !== 'hidden',
    });
    schedulerRef.current = scheduler;
    // Keeps data fresh and recovers from any failed startup sync.
    const interval = autoSync ? setInterval(scheduler.requestUntargeted, SYNC_INTERVAL_MS) : null;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') scheduler.requestUntargeted();
    };
    const handleSyncRequest = (event: Event) => {
      // INTENT: a realtime re-SUBSCRIBED (detail.deferred) may have missed
      // events, so a pass is owed, but it must not start one at once: a flapping
      // channel would otherwise full-sync on every reconnect. It is delayed 15s
      // (reconnects coalesce into one pass), never dropped; the poll is the
      // backstop. Bare requests (wizard publish, realtime change nudge) are
      // explicit and run now.
      if ((event as CustomEvent<{ deferred?: boolean } | undefined>).detail?.deferred) {
        scheduler.requestDeferred();
        return;
      }
      logger.info('Sync requested via event', 'replication');
      triggerSyncRef.current?.();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('replication:sync-requested', handleSyncRequest);
    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('replication:sync-requested', handleSyncRequest);
      scheduler.dispose();
      schedulerRef.current = null;
    };
  }, [autoSync, triggerSyncRef, schedulerRef]);
}
