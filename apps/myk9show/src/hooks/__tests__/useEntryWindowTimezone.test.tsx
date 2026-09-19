/**
 * MYK9-642 review rounds 1-3.
 *
 * Three facts, three bugs:
 *   J-F1 — the zone must come from the trial store, not `show.trials` (always []).
 *   L-F1 — "not read yet" must not be answered with the Eastern fallback.
 *   N-F2 — `trialsReadStatus` flips to 'ready' on the LOCAL read, zero rows
 *          included, so "ready" alone is a fact about the device, not the show.
 *   N-F3 — a failed read is not a wait.
 *
 * Mutation checks for this file:
 *   - make the hook read `[]` instead of the store → the zone cases go red with
 *     `expected 'America/New_York' to be 'America/Chicago'`.
 *   - make `isReady` just `readStatus === 'ready'` → the cold-replica case goes
 *     red (it reports ready with the fallback zone).
 *   - drop the `isUnavailable` term → the error cases go red.
 *
 * The trial store and the replication context are stubbed per case behind
 * `vi.resetModules()`, so this file holds no module-scope mutable state and one
 * shuffled run settles it.
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import React from 'react';
import { renderHook } from '@testing-library/react';

interface StubTrial {
  id: string;
  showId: string;
  trialDate: string;
  timezone: string;
}

type ReadStatus = 'idle' | 'loading' | 'ready' | 'error';
type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

interface Scenario {
  trials?: StubTrial[];
  showId?: string | undefined;
  readStatus?: ReadStatus;
  /** Omitted entirely = no ReplicationSyncProvider in the tree. */
  syncStatus?: SyncStatus | 'no-provider';
}

const CHICAGO_TRIAL: StubTrial = {
  id: 'trial-1',
  showId: 'show-1',
  trialDate: '2026-11-08',
  timezone: 'America/Chicago',
};

async function resolve(scenario: Scenario) {
  const { trials = [], readStatus = 'ready', syncStatus = 'success' } = scenario;
  // `in`, not a default: `showId: undefined` is a real case (no show yet) and a
  // default would silently turn it back into 'show-1'.
  const showId = 'showId' in scenario ? scenario.showId : 'show-1';

  vi.resetModules();
  vi.doMock('@/store/trialStore', () => ({
    useTrialStore: (
      selector: (state: { trials: StubTrial[]; trialsReadStatus: ReadStatus }) => unknown
    ) => selector({ trials, trialsReadStatus: readStatus }),
  }));

  const { ReplicationSyncContext } = await import('@/context/ReplicationSyncContext');
  const { useEntryWindowTimezone } = await import('../useEntryWindowTimezone');

  const wrapper =
    syncStatus === 'no-provider'
      ? undefined
      : ({ children }: { children: React.ReactNode }) =>
          React.createElement(
            ReplicationSyncContext.Provider,
            {
              value: {
                status: {
                  isSyncing: false,
                  lastSyncAt: null,
                  error: null,
                  tablesStatus: { trials: syncStatus },
                },
                triggerSync: async () => {},
                syncTable: async () => {},
              },
            },
            children
          );

  return renderHook(() => useEntryWindowTimezone(showId), wrapper ? { wrapper } : undefined).result
    .current;
}

afterEach(() => {
  vi.doUnmock('@/store/trialStore');
  vi.resetModules();
});

describe('useEntryWindowTimezone — the zone (J-F1)', () => {
  it("reads the show's real trial timezone, not the America/New_York fallback", async () => {
    await expect(resolve({ trials: [CHICAGO_TRIAL] })).resolves.toMatchObject({
      timeZone: 'America/Chicago',
      isReady: true,
    });
  });

  it('ignores trials belonging to another show', async () => {
    await expect(
      resolve({ trials: [{ ...CHICAGO_TRIAL, id: 'other', showId: 'show-2' }] })
    ).resolves.toMatchObject({ timeZone: 'America/New_York' });
  });

  it('uses the FIRST trial by date when a show spans zones', async () => {
    // Same ordering as `submit_show_entries` (`ORDER BY t.date NULLS LAST, t.id`).
    await expect(
      resolve({
        trials: [
          { id: 'sun', showId: 'show-1', trialDate: '2026-11-09', timezone: 'America/Denver' },
          CHICAGO_TRIAL,
        ],
      })
    ).resolves.toMatchObject({ timeZone: 'America/Chicago' });
  });

  it('falls back when the show id is absent', async () => {
    await expect(resolve({ trials: [CHICAGO_TRIAL], showId: undefined })).resolves.toMatchObject({
      timeZone: 'America/New_York',
    });
  });
});

describe('useEntryWindowTimezone — readiness (L-F1)', () => {
  it('is NOT ready while the local read is idle or loading', async () => {
    for (const readStatus of ['idle', 'loading'] as const) {
      await expect(resolve({ readStatus })).resolves.toEqual({
        timeZone: 'America/New_York',
        isReady: false,
        isUnavailable: false,
      });
    }
  });

  it("is ready the moment this show's trials are in hand, whatever else is still running", async () => {
    await expect(
      resolve({ trials: [CHICAGO_TRIAL], readStatus: 'loading', syncStatus: 'syncing' })
    ).resolves.toMatchObject({ timeZone: 'America/Chicago', isReady: true });
  });
});

describe('useEntryWindowTimezone — a cold replica is not a show without trials (N-F2)', () => {
  // `trialsReadStatus` becomes 'ready' as soon as the LOCAL IndexedDB read
  // returns, zero rows included; the network download runs after that. Treating
  // that as "this show has no trials" reinstates the Eastern fallback on a first
  // visit, a cleared profile, or a show whose trials have not synced — which is
  // L-F1 all over again, one level down.
  it('is NOT ready when the local read finished empty and the sync has not landed', async () => {
    for (const syncStatus of ['idle', 'syncing'] as const) {
      await expect(resolve({ readStatus: 'ready', syncStatus })).resolves.toEqual({
        timeZone: 'America/New_York',
        isReady: false,
        isUnavailable: false,
      });
    }
  });

  it('opens only once the rows arrive', async () => {
    const cold = await resolve({ readStatus: 'ready', syncStatus: 'syncing' });
    expect(cold).toMatchObject({ isReady: false, timeZone: 'America/New_York' });

    const warm = await resolve({
      trials: [CHICAGO_TRIAL],
      readStatus: 'ready',
      syncStatus: 'syncing',
    });
    expect(warm).toMatchObject({ isReady: true, timeZone: 'America/Chicago' });
  });

  it('is ready for a show that genuinely has no trials — once the sync says so', async () => {
    // The distinction the whole finding is about: "no trials for this show" is
    // only a fact once a completed download says it is.
    await expect(resolve({ readStatus: 'ready', syncStatus: 'success' })).resolves.toEqual({
      timeZone: 'America/New_York',
      isReady: true,
      isUnavailable: false,
    });
  });

  it('is NOT ready without a replication provider to confirm the download', async () => {
    await expect(
      resolve({ readStatus: 'ready', syncStatus: 'no-provider' })
    ).resolves.toMatchObject({ isReady: false, isUnavailable: false });
  });
});

describe('useEntryWindowTimezone — a failed read is not a wait (N-F3)', () => {
  it('reports unavailable when the local read failed', async () => {
    await expect(resolve({ readStatus: 'error' })).resolves.toEqual({
      timeZone: 'America/New_York',
      isReady: false,
      isUnavailable: true,
    });
  });

  it('reports unavailable when the trials sync failed with nothing cached', async () => {
    await expect(resolve({ readStatus: 'ready', syncStatus: 'error' })).resolves.toEqual({
      timeZone: 'America/New_York',
      isReady: false,
      isUnavailable: true,
    });
  });

  it('is NOT unavailable when a refresh failed but this show’s trials are cached', async () => {
    // A failed background refresh must not take down a wizard that has what it
    // needs; the zone in hand is real.
    await expect(
      resolve({ trials: [CHICAGO_TRIAL], readStatus: 'error', syncStatus: 'error' })
    ).resolves.toEqual({
      timeZone: 'America/Chicago',
      isReady: true,
      isUnavailable: false,
    });
  });
});
