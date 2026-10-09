/**
 * MYK9-1031: the Results tab against the REAL replicated classes table (fake-indexeddb) and the
 * REAL class read, so a field dropped by a mapper between the replica row and the tab shows up
 * here. A hand-built row cannot (LESSONS last-hop-drop): the first version of this tab read
 * `results_released_at` off rows whose mapper omitted it, so every released class read as
 * "Ready to release" and Print all ready stayed disabled.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { Route, Routes } from 'react-router-dom';

import { render, screen, waitFor } from '@/test/utils/testUtils';
import { mockSupabase } from '@/test/mocks/supabase';
import { replicatedClassesTable, replicatedEntriesTable } from '@/services/replication';
import type { SyncableTrial, SyncableTrialClass } from '@/store/trial-store-types';
import { getClassesByTrialId } from '@/services/database/classes';
import { getEntriesForShow } from '@/services/database/entries/secretary';
import { buildReportPaperworkDescriptor } from '@/features/show-map/cockpit/buildReportPaperworkDescriptor';
import { currentClassResultsFingerprint } from '@/features/show-map/resultsVerifiedMutations';
import ResultsTab from './ResultsTab';

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
  await replicatedEntriesTable.updateSyncMetadata(
    { lastIncrementalSyncAt: Date.now(), totalRows: 2 },
    { scopeValue: 'show-1' }
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
    expect(stamps).toEqual({ 'class-released': null, 'class-open': '2026-10-10T15:00:00Z' });
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
    expect(screen.getByText('Ready to release')).toBeInTheDocument();
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

    await replicatedClassesTable.setResultsVerified('class-open', null);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Release results' })).toBeDisabled()
    );
    expect(screen.getByText('Check the scores against the paper')).toBeInTheDocument();
  });

  describe('a local score change', () => {
    it('a local correction retracts a check this device sent, before the server hears of it', async () => {
      const fingerprint = await currentClassResultsFingerprint('class-open');
      await replicatedClassesTable.setResultsVerified('class-open', {
        at: '2026-10-10T15:30:00Z',
        by: 'u-1',
        fingerprint,
      });
      render(
        <Routes>
          <Route path="/shows/:id/results" element={<ResultsTab />} />
        </Routes>,
        { initialRoute: '/shows/show-1/results?status=all&classId=class-open' }
      );
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Release results' })).toBeEnabled()
      );

      await replicatedEntriesTable.updateEntry('e-class-open', { resultStatus: 'nq' } as never);

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Release results' })).toBeDisabled()
      );
      expect(screen.getByText('Check the scores against the paper')).toBeInTheDocument();
    });

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
});
