/**
 * MYK9-1031: the Results tab against the REAL replicated classes table (fake-indexeddb) and the
 * REAL class read, so a field dropped by a mapper between the replica row and the tab shows up
 * here. A hand-built row cannot (LESSONS last-hop-drop): the first version of this tab read
 * `results_released_at` off rows whose mapper omitted it, so every released class read as
 * "Ready to release" and Print all ready stayed disabled.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';

import { render, screen, waitFor } from '@/test/utils/testUtils';
import { mockSupabase } from '@/test/mocks/supabase';
import { replicatedClassesTable } from '@/services/replication';
import type { SyncableTrial, SyncableTrialClass } from '@/store/trial-store-types';
import { getClassesByTrialId } from '@/services/database/classes';
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
const scheduleClass = (id: string, level: string) =>
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
    ...SYNC,
  }) as SyncableTrialClass;

const mocks = vi.hoisted(() => ({ schedule: {} as Record<string, unknown> }));
vi.mock('@/pages/secretary/useShowDeskScheduleRead', () => ({
  useShowDeskScheduleRead: () => mocks.schedule,
}));
vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useSecretaryShowEntriesQuery: () => ({
    data: ['class-released', 'class-open'].map(classId => ({
      id: `e-${classId}`,
      class_id: classId,
      entry_status: 'confirmed',
      check_in_status: 'checked-in',
      is_scored: true,
      result_status: 'qualified',
    })),
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/features/show-map/cockpit/useShowPaperworkPrints', () => ({
  useShowPaperworkPrints: () => ({ data: [], isLoading: false, isError: false, syncFailed: false }),
}));
vi.mock('./ResultsVisibilitySheet', () => ({ ResultsVisibilitySheet: () => null }));

beforeEach(async () => {
  mockSupabase.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: 'u-1', is_anonymous: false } } },
    error: null,
  });
  mocks.schedule = {
    trials: [trial],
    trialClasses: {
      'trial-1': [scheduleClass('class-released', 'Novice'), scheduleClass('class-open', 'Open')],
    },
    hasConfirmedSnapshot: true,
    readFailed: false,
    readPending: false,
    retry: vi.fn(),
  };
  await replicatedClassesTable.clearCache();
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
});
