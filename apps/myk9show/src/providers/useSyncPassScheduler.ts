import { useEffect, type MutableRefObject } from 'react';
import { logger } from '@/services/LoggingService';
import { createSyncPassScheduler } from './syncPassScheduler';
import { nextPollDelayMs, onCadenceChange } from './syncCadence';

/**
 * Wires the triggers that start an UNTARGETED full sync pass: the background
 * poll, the tab becoming visible, and `replication:sync-requested`.
 *
 * Poll and visibility go through one scheduler that spaces them >= 15s apart and
 * never polls a hidden tab (a pass owed to a hidden tab is made up by the
 * visibility catch-up). Explicit and scoped passes neither read nor write the
 * scheduler's clock; an explicit full pass already in flight is coalesced by the
 * provider's own in-flight guard.
 */
export function useSyncPassScheduler(
  autoSync: boolean,
  triggerSyncRef: MutableRefObject<(() => Promise<void>) | undefined>
): void {
  useEffect(() => {
    const scheduler = createSyncPassScheduler({
      run: () => void triggerSyncRef.current?.(),
      canRun: () => document.visibilityState !== 'hidden',
    });
    // Keeps data fresh and recovers from any failed startup sync. A re-armed
    // timeout chain (not a fixed interval) so the delay follows the realtime
    // state (MYK9-1305): 3-5 min while a show channel is SUBSCRIBED, 60 s
    // otherwise. A pass that throws never changes the next delay.
    let lastTickAt = Date.now();
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    const armPoll = (delayMs: number) => {
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = setTimeout(tick, Math.max(0, delayMs));
    };
    function tick() {
      pollTimer = null;
      lastTickAt = Date.now();
      try {
        scheduler.requestUntargeted();
      } catch (error) {
        logger.warn('Poll tick failed', 'replication', { error });
      } finally {
        armPoll(nextPollDelayMs());
      }
    }
    // The cadence flipped: re-time the pending tick from the LAST tick, so a
    // drop to unsubscribed/offline is back on 60 s within one tick (at once when
    // that is already overdue). A rejoin pass is the deferred nudge, not this.
    const stopCadenceWatch = autoSync
      ? onCadenceChange(() => {
          // Clamped: a backward clock step must not stretch the delay past the cadence.
          const elapsed = Math.max(0, Date.now() - lastTickAt);
          armPoll(nextPollDelayMs() - elapsed);
        })
      : null;
    if (autoSync) armPoll(nextPollDelayMs());
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
      if (pollTimer) clearTimeout(pollTimer);
      stopCadenceWatch?.();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('replication:sync-requested', handleSyncRequest);
      scheduler.dispose();
    };
  }, [autoSync, triggerSyncRef]);
}
