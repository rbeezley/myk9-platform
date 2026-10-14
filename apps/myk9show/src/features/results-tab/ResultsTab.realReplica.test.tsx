/**
 * MYK9-1031: the Results tab against the REAL replicated classes table (fake-indexeddb) and the
 * REAL class read, so a field dropped by a mapper between the replica row and the tab shows up
 * here. A hand-built row cannot (LESSONS last-hop-drop): the first version of this tab read
 * `results_released_at` off rows whose mapper omitted it, so every released class read as
 * "Ready to release" and Print all ready stayed disabled.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { configure, getConfig } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';

import { render, screen, waitFor } from '@/test/utils/testUtils';
import { mockSupabase } from '@/test/mocks/supabase';
import { replicatedClassesTable, replicatedEntriesTable } from '@/services/replication';
import type { SyncableTrial, SyncableTrialClass } from '@/store/trial-store-types';
import { getClassesByTrialId } from '@/services/database/classes';
import { getEntriesForShow } from '@/services/database/entries/secretary';
import { buildReportPaperworkDescriptor } from '@/features/show-map/cockpit/buildReportPaperworkDescriptor';
import ResultsTab from './ResultsTab';
import { signInReplicatedTable } from '@/test/utils/signedInReplication';

const SYNC = {
  _version: 1,
  _lastModified: new Date(0),
  _lastModifiedBy: '',
  _syncStatus: 'synced',
} as const;

const trial = {
  id: 'trial-1',
  showId: 'show-1',
  showName: 'Fall Trial',
  trialDate: '2026-10-10',
  trialNumber: '1',
  status: 'Scheduled',
  ...SYNC,
} as SyncableTrial;
const scheduleClass = (id: string, level: string, judgeSignedOffAt: string | null = null) =>
  ({
    id,
    element: 'Containers',
    level,
    section: '',
    judgeId: 'j',
    judgeName: 'Pat Judge',
    startTime: '09:00',
    status: 'Completed',
    entries: 0,
    judgeSignedOffAt,
    ...SYNC,
  }) as SyncableTrialClass;

const mocks = vi.hoisted(() => ({ schedule: {} as Record<string, unknown> }));
vi.mock('@/pages/secretary/useShowDeskScheduleRead', () => ({
  useShowDeskScheduleRead: () => mocks.schedule,
}));
const prints = vi.hoisted(() => ({ data: [] as unknown[] }));
vi.mock('@/features/show-map/cockpit/useShowPaperworkPrints', () => ({
  useShowPaperworkPrints: () => ({
    data: prints.data,
    isLoading: false,
    isError: false,
    syncFailed: false,
  }),
}));
vi.mock('./ResultsVisibilitySheet', () => ({ ResultsVisibilitySheet: () => null }));

// Every wait here follows a real IndexedDB write, then a debounced table notice, then an async
// re-read (MYK9-1160). Under CPU load plus coverage that chain outlasts the 1000ms default and a
// `toBeDisabled()` waitFor timed out on a button that was about to lock. A budget, not a poll:
// a passing run still resolves on the first matching render.
const { asyncUtilTimeout: DEFAULT_ASYNC_TIMEOUT } = getConfig();
beforeAll(() => configure({ asyncUtilTimeout: 8_000 }));
afterAll(() => configure({ asyncUtilTimeout: DEFAULT_ASYNC_TIMEOUT }));

beforeEach(async () => {
  prints.data = [];
  mockSupabase.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: 'u-1', is_anonymous: false } } },
    error: null,
  });
  mocks.schedule = {
    trials: [trial],
    trialClasses: {
      'trial-1': [
        scheduleClass('class-released', 'Novice', '2026-10-10T21:00:00Z'),
        scheduleClass('class-open', 'Open'),
      ],
    },
    hasConfirmedSnapshot: true,
    readFailed: false,
    readPending: false,
    retry: vi.fn(),
  };
  await replicatedClassesTable.clearCache();
  await replicatedEntriesTable.clearCache();
  await replicatedEntriesTable.batchSet(
    ['class-released', 'class-open'].map(classId => ({
      id: `e-${classId}`,
      showId: 'show-1',
      classId,
      dogId: `dog-${classId}`,
      armband: '101',
      entryStatus: 'confirmed',
      checkInStatus: 'checked-in',
      isScored: true,
      resultStatus: 'qualified',
    })) as never
  );
  signInReplicatedTable(replicatedEntriesTable, 'user-test');
  await replicatedEntriesTable.updateSyncMetadata(
    { lastIncrementalSyncAt: Date.now(), totalRows: 2 },
    { scopeValue: 'show-1', scopeSyncedBy: 'user-test' }
  );
  await replicatedClassesTable.batchSet([
    {
      id: 'class-released',
      trialId: 'trial-1',
      element: 'Containers',
      level: 'Novice',
      classStatus: 'Completed',
      startTime: '09:00',
      resultsReleasedAt: '2026-10-10T16:00:00Z',
      results_released_at: '2026-10-10T16:00:00Z',
      resultsVerifiedAt: '2026-10-10T15:00:00Z',
      resultsVerifiedBy: 'u-1',
    },
    {
      id: 'class-open',
      trialId: 'trial-1',
      element: 'Containers',
      level: 'Open',
      classStatus: 'Completed',
      startTime: '10:00',
      resultsReleasedAt: null,
      results_released_at: null,
      resultsVerifiedAt: '2026-10-10T15:00:00Z',
      resultsVerifiedBy: 'u-1',
    },
  ] as never);
});

/** What an ordinary class sync does when the server's check is gone: a clean write of the row. */
async function downloadClassWithoutCheck(classId: string) {
  const row = await replicatedClassesTable.get(classId);
  await replicatedClassesTable.set(
    classId,
    { ...row!, resultsVerifiedAt: null, resultsVerifiedBy: null },
    false
  );
}

describe('Results tab on the real replicated class rows', () => {
  it('the class read carries the release stamp the replica holds', async () => {
    const { data } = await getClassesByTrialId('trial-1');
    const stamps = Object.fromEntries(
      (data ?? []).map(row => [
        row.id,
        (row as { results_released_at?: unknown }).results_released_at,
      ])
    );
    expect(stamps).toEqual({ 'class-released': '2026-10-10T16:00:00Z', 'class-open': null });
  });

  it('the class read carries the paper check the replica holds (last hop, MYK9-1031)', async () => {
    const { data } = await getClassesByTrialId('trial-1');
    const stamps = Object.fromEntries(
      (data ?? []).map(row => [
        row.id,
        (row as { results_verified_at?: unknown; results_verified_by?: unknown })
          .results_verified_at,
      ])
    );
    expect(stamps).toEqual({
      'class-released': '2026-10-10T15:00:00Z',
      'class-open': '2026-10-10T15:00:00Z',
    });
  });

  it('shows a released class as released and enables Print all ready', async () => {
    render(
      <Routes>
        <Route path="/shows/:id/results" element={<ResultsTab />} />
      </Routes>,
      { initialRoute: '/shows/show-1/results?status=all' }
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Print all ready/ })).toBeEnabled()
    );
    expect(screen.getByText('Released')).toBeInTheDocument();
    // The check is compared with the results on this device first, so it settles a beat later.
    await waitFor(() => expect(screen.getByText('Ready to release')).toBeInTheDocument());
  });

  it('a check recorded in the replica unlocks Release, and removing it locks Release again', async () => {
    render(
      <Routes>
        <Route path="/shows/:id/results" element={<ResultsTab />} />
      </Routes>,
      { initialRoute: '/shows/show-1/results?status=all&classId=class-open' }
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Release results' })).toBeEnabled()
    );
    expect(screen.getByText(/Scores checked against the paper by you/)).toBeInTheDocument();

    await downloadClassWithoutCheck('class-open');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Release results' })).toBeDisabled()
    );
    expect(screen.getByText('Check the scores against the paper')).toBeInTheDocument();
  });

  it('keeps verification reachable after release: released and unchecked shows the checklist, not Release', async () => {
    await downloadClassWithoutCheck('class-released');
    render(
      <Routes>
        <Route path="/shows/:id/results" element={<ResultsTab />} />
      </Routes>,
      { initialRoute: '/shows/show-1/results?status=all&classId=class-released' }
    );

    await waitFor(() =>
      expect(screen.getByText('Check the scores against the paper')).toBeInTheDocument()
    );
    expect(screen.getByRole('checkbox', { name: /matches the paper/ })).toBeInTheDocument();
    expect(screen.getByText(/already released/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Release results' })).not.toBeInTheDocument();
  });

  describe('a local score change', () => {
    const renderClass = (queryClient?: QueryClient) =>
      render(
        <Routes>
          <Route path="/shows/:id/results" element={<ResultsTab />} />
        </Routes>,
        {
          initialRoute: '/shows/show-1/results?status=all&classId=class-open',
          ...(queryClient && { queryClient }),
        }
      );
    const renderOpen = () =>
      render(
        <Routes>
          <Route path="/shows/:id/results" element={<ResultsTab />} />
        </Routes>,
        { initialRoute: '/shows/show-1/results?status=all&classId=class-open' }
      );

    it('Release waits for a correction to reach the server, and an upload ack re-enables it', async () => {
      renderOpen();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Release results' })).toBeEnabled()
      );

      // A local correction: the row is dirty until the upload is acknowledged.
      await replicatedEntriesTable.updateEntry('e-class-open', { resultStatus: 'nq' } as never);
      await waitFor(() =>
        expect(screen.getByText('Waiting for score changes to sync')).toBeInTheDocument()
      );
      expect(screen.getByRole('button', { name: 'Release results' })).toBeDisabled();

      // The ack flips only the row's dirty flag: the displayed rows do not change.
      await replicatedEntriesTable.markAsSynced('e-class-open');
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Release results' })).toBeEnabled()
      );
    });

    it('shows an offline Fix (Q to NQ) without any manual invalidation', async () => {
      renderClass();
      await waitFor(() => expect(screen.getByText('Q')).toBeInTheDocument());

      await replicatedEntriesTable.updateEntry('e-class-open', { resultStatus: 'nq' } as never);

      await waitFor(() => expect(screen.getByText('NQ')).toBeInTheDocument());
      expect(screen.queryByText('Q')).not.toBeInTheDocument();
    });

    it('re-reads the replica on return within the cache window', async () => {
      // One client across both mounts: the cached read is still inside its stale window.
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
      });
      const first = renderClass(client);
      await waitFor(() => expect(screen.getByText('Q')).toBeInTheDocument());
      first.unmount();

      await replicatedEntriesTable.updateEntry('e-class-open', { resultStatus: 'nq' } as never);
      renderClass(client);

      await waitFor(() => expect(screen.getByText('NQ')).toBeInTheDocument());
    });

    it('a print confirmed against the old score stops counting as current after the fix', async () => {
      // Confirm both sheets against the Q the replica holds now, built from the same real reads.
      const classes = ((await getClassesByTrialId('trial-1')).data ?? []) as never[];
      const entries = ((await getEntriesForShow('show-1')).data ?? []) as never[];
      prints.data = (['results-sheet', 'result-labels'] as const).map(reportId => {
        const descriptor = buildReportPaperworkDescriptor({
          reportId,
          scope: { kind: 'class', showId: 'show-1', trialId: 'trial-1', classId: 'class-released' },
          classes,
          entries,
        })!;
        return {
          id: `print-${reportId}`,
          reportId,
          scopeKind: 'class',
          classId: 'class-released',
          trialId: 'trial-1',
          coverage: descriptor.coverage,
          fingerprint: descriptor.fingerprint,
          printedAt: '2026-10-10T17:00:00Z',
          printedByName: 'Sec',
        };
      });
      render(
        <Routes>
          <Route path="/shows/:id/results" element={<ResultsTab />} />
        </Routes>,
        { initialRoute: '/shows/show-1/results?status=all&classId=class-released' }
      );
      await waitFor(() => expect(screen.getAllByText('Done').length).toBeGreaterThan(0));

      await replicatedEntriesTable.updateEntry('e-class-released', { resultStatus: 'nq' } as never);

      // Both together: Done can drop while the re-read is in flight, before the NQ renders.
      await waitFor(() => {
        expect(screen.getByText('NQ')).toBeInTheDocument();
        expect(screen.queryByText('Done')).not.toBeInTheDocument();
      });
    });
  });

  describe('a class row this device has not synced (MYK9-1113)', () => {
    const SAVE_CHECK = { name: 'Scores match the paper' };

    /** The class has no check yet; the secretary ticks the dog, so Verify is ready to click. */
    async function renderUncheckedAndTick() {
      await downloadClassWithoutCheck('class-open');
      const user = userEvent.setup();
      render(
        <Routes>
          <Route path="/shows/:id/results" element={<ResultsTab />} />
        </Routes>,
        { initialRoute: '/shows/show-1/results?status=all&classId=class-open' }
      );
      await user.click(await screen.findByRole('checkbox', { name: /matches the paper/ }));
      await waitFor(() => expect(screen.getByRole('button', SAVE_CHECK)).toBeEnabled());
    }

    /** What the server holds when this device's edit loses: the check is there, the row is not clean. */
    async function conflictClass(classId: string) {
      await replicatedClassesTable.updateClass(classId, { classStatus: 'Completed' });
      const row = (await replicatedClassesTable.getReplicatedRow(classId))!;
      await replicatedClassesTable.markConflict(classId, {
        tableName: 'classes',
        rowId: classId,
        fields: ['classStatus'],
        localData: row.data,
        remoteData: {
          ...row.data,
          resultsVerifiedAt: '2026-10-10T15:00:00Z',
          resultsVerifiedBy: 'u-1',
        },
        baseData: row.data,
        baseVersion: row.version,
        localVersion: row.version,
        remoteServerVersion: 9,
        detectedAt: Date.now(),
      });
    }

    it('says a queued class change must sync first, keeps the ticks, and unlocks when it syncs', async () => {
      await renderUncheckedAndTick();

      await replicatedClassesTable.updateClass('class-open', { classStatus: 'Completed' });

      await waitFor(() => expect(screen.getByRole('button', SAVE_CHECK)).toBeDisabled());
      expect(screen.getByText(/Waiting for this class.s changes to sync/)).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /matches the paper/ })).toBeChecked();

      // The upload is acknowledged, then an ordinary class sync brings the server's check down.
      await replicatedClassesTable.markAsSynced('class-open');
      const row = (await replicatedClassesTable.get('class-open'))!;
      await replicatedClassesTable.set(
        'class-open',
        { ...row, resultsVerifiedAt: '2026-10-10T15:00:00Z', resultsVerifiedBy: 'u-1' },
        false
      );

      await waitFor(() =>
        expect(screen.getByText(/Scores checked against the paper by you/)).toBeInTheDocument()
      );
      expect(screen.getByRole('button', { name: 'Release results' })).toBeEnabled();
    });

    it('recovers from waiting when the queue empties without a table notice (Take theirs discard, upload ack)', async () => {
      await renderUncheckedAndTick();
      // Some transitions empty this class's queue without notifying the classes table: Take
      // theirs discards the queued write after its replace has notified; an upload ack marks
      // the row synced with a raw write. Hold "unsynced" through one real notice, then clear
      // it silently, which is exactly what the hook sees in those cases.
      let unsynced = true;
      const spy = vi
        .spyOn(replicatedClassesTable, 'hasUnsyncedLocalWork')
        .mockImplementation(async () => unsynced);
      try {
        const row = (await replicatedClassesTable.get('class-open'))!;
        await replicatedClassesTable.set('class-open', { ...row }, false);
        await waitFor(() => expect(screen.getByRole('button', SAVE_CHECK)).toBeDisabled());
        expect(screen.getByText(/Waiting for this class.s changes to sync/)).toBeInTheDocument();

        // Let every notice from that write drain (leading and trailing debounce edges), so
        // nothing table-driven is left to re-read for us.
        await new Promise(resolve => setTimeout(resolve, 500));
        expect(screen.getByRole('button', SAVE_CHECK)).toBeDisabled();
        unsynced = false;

        await waitFor(() => expect(screen.getByRole('button', SAVE_CHECK)).toBeEnabled(), {
          timeout: 4_000,
        });
        expect(
          screen.queryByText(/Waiting for this class.s changes to sync/)
        ).not.toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: /matches the paper/ })).toBeChecked();
      } finally {
        spy.mockRestore();
      }
    });

    it('names an unresolved conflict and points at the Keep mine / Take theirs choice, then unlocks once resolved', async () => {
      await renderUncheckedAndTick();

      await conflictClass('class-open');

      expect(await screen.findByText(/changed elsewhere/)).toBeInTheDocument();
      expect(screen.getByRole('button', SAVE_CHECK)).toBeDisabled();
      expect(screen.getByText(/Keep mine or Take theirs/)).toBeInTheDocument();
      // A dismissed notice is not a dead end: the copy says how to bring it back.
      expect(screen.getByText(/reload the page to bring it back/)).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /matches the paper/ })).toBeChecked();

      // Take theirs: the server's row, check included, replaces the local one.
      await replicatedClassesTable.resolveReplicationConflict('class-open', 'take-remote');

      await waitFor(() =>
        expect(screen.getByText(/Scores checked against the paper by you/)).toBeInTheDocument()
      );
      expect(screen.getByRole('button', { name: 'Release results' })).toBeEnabled();
      expect(screen.queryByText(/changed elsewhere/)).not.toBeInTheDocument();
    });
  });
});
