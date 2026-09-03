import { afterEach, describe, expect, it } from 'vitest';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';
import { areReplicationTablesPendingFirstSync } from './replicationSyncEmptyState';

function makeStatus(
  overrides: Partial<ReplicationSyncContextValue['status']>
): ReplicationSyncContextValue['status'] {
  return {
    isSyncing: false,
    lastSyncAt: null,
    error: null,
    tablesStatus: {},
    ...overrides,
  };
}

/**
 * `navigator.onLine` is a getter on a shared global; redefine rather than assign.
 * Restored after every test so one case cannot leak an offline device into the next.
 */
function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    get: () => value,
    configurable: true,
  });
}

describe('areReplicationTablesPendingFirstSync', () => {
  afterEach(() => {
    setOnLine(true);
  });

  it('treats global sync as pending', () => {
    expect(areReplicationTablesPendingFirstSync(makeStatus({ isSyncing: true }), ['entries'])).toBe(
      true
    );
  });

  it('treats idle or syncing tracked tables as pending', () => {
    expect(
      areReplicationTablesPendingFirstSync(
        makeStatus({ tablesStatus: { entries: 'idle', classes: 'success' } }),
        ['entries', 'classes']
      )
    ).toBe(true);
    expect(
      areReplicationTablesPendingFirstSync(
        makeStatus({ tablesStatus: { entries: 'syncing', classes: 'success' } }),
        ['entries', 'classes']
      )
    ).toBe(true);
  });

  it('does not block once tracked tables settled', () => {
    expect(
      areReplicationTablesPendingFirstSync(
        makeStatus({ tablesStatus: { entries: 'success', classes: 'error' } }),
        ['entries', 'classes']
      )
    ).toBe(false);
  });

  // MYK9-365. `ReplicationSyncProvider.triggerSync` returns early when offline
  // WITHOUT touching `tablesStatus`, so every table sits at its initial 'idle'
  // for as long as the device has no signal. Counting 'idle' as "pending first
  // sync" therefore means "pending forever", and every caller gates a skeleton
  // on this — an exhibitor cold-booting at a venue got an animated skeleton and
  // no text at all, permanently.
  //
  // Offline there is nothing to wait FOR: no sync is running and none can start.
  // Whatever is in IndexedDB is all there is going to be, so the caller must be
  // allowed to render it (or its own honest offline/unknown state) instead.
  describe('offline', () => {
    it('does not report a pending first sync when the device is offline', () => {
      setOnLine(false);
      expect(
        areReplicationTablesPendingFirstSync(makeStatus({ tablesStatus: { entries: 'idle' } }), [
          'entries',
        ])
      ).toBe(false);
    });

    it('still reports pending while a sync is genuinely in flight offline', () => {
      // `isSyncing` means a run really is underway — it began before the drop.
      // That is a bounded wait with a real end, so it stays pending even though
      // the device now reports offline. This pins the ORDER of the two guards:
      // `isSyncing` must be checked before the offline short-circuit, or a sync
      // in flight would be reported as "nothing pending" the moment signal went.
      setOnLine(false);
      expect(
        areReplicationTablesPendingFirstSync(makeStatus({ isSyncing: true }), ['entries'])
      ).toBe(true);
    });

    it('is unchanged when online — idle still means the first sync is coming', () => {
      setOnLine(true);
      expect(
        areReplicationTablesPendingFirstSync(makeStatus({ tablesStatus: { entries: 'idle' } }), [
          'entries',
        ])
      ).toBe(true);
    });
  });
});
