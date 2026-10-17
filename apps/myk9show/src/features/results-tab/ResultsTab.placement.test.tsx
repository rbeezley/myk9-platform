/**
 * MYK9-1230: the Results tab's Check scores table shows the same placement the Fix flow shows.
 * Rows are written to the REAL replicated entries table in the shape the sync mapper stores
 * (`finalPlacement` as a string), then read back through the real secretary read, so a placement
 * dropped at any hop between the replica and the table shows up here.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { configure, getConfig, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';

import { render, screen, waitFor } from '@/test/utils/testUtils';
import { mockSupabase } from '@/test/mocks/supabase';
import { replicatedClassesTable, replicatedEntriesTable } from '@/services/replication';
import type { SyncableTrial, SyncableTrialClass } from '@/store/trial-store-types';
import { signInReplicatedTable } from '@/test/utils/signedInReplication';
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
const scheduleClass = (id: string, element: string, level: string, section: string) =>
  ({
    id,
    element,
    level,
    section,
    judgeId: 'j',
    judgeName: 'Pat Judge',
    startTime: '09:00',
    status: 'Completed',
    entries: 0,
    judgeSignedOffAt: null,
    ...SYNC,
  }) as SyncableTrialClass;

const mocks = vi.hoisted(() => ({ schedule: {} as Record<string, unknown> }));
vi.mock('@/pages/secretary/useShowDeskScheduleRead', () => ({
  useShowDeskScheduleRead: () => mocks.schedule,
}));
vi.mock('@/features/show-map/cockpit/useShowPaperworkPrints', () => ({
  useShowPaperworkPrints: () => ({ data: [], isLoading: false, isError: false, syncFailed: false }),
}));
vi.mock('./ResultsVisibilitySheet', () => ({ ResultsVisibilitySheet: () => null }));

vi.setConfig({ testTimeout: 30_000 });
const { asyncUtilTimeout: DEFAULT_ASYNC_TIMEOUT } = getConfig();
beforeAll(() => {
  configure({ asyncUtilTimeout: 8_000 });
});
afterAll(() => {
  configure({ asyncUtilTimeout: DEFAULT_ASYNC_TIMEOUT });
  vi.resetConfig();
});

const CLASSES = [
  { id: 'class-vehicles', element: 'Vehicles', level: 'Novice', section: 'A' },
  { id: 'class-containers', element: 'Containers', level: 'Open', section: '' },
];

const entry = (classId: string, n: number, over: Record<string, unknown>) => ({
  id: `e-${classId}-${n}`,
  showId: 'show-1',
  classId,
  dogId: `dog-${classId}-${n}`,
  armband: String(100 + n),
  entryStatus: 'confirmed',
  checkInStatus: 'checked-in',
  isScored: true,
  resultStatus: 'qualified',
  searchTimeSeconds: 30 + n,
  totalFaults: 0,
  ...over,
});

beforeEach(async () => {
  mockSupabase.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: 'u-1', is_anonymous: false } } },
    error: null,
  });
  mocks.schedule = {
    trials: [trial],
    trialClasses: {
      'trial-1': CLASSES.map(c => scheduleClass(c.id, c.element, c.level, c.section)),
    },
    hasConfirmedSnapshot: true,
    readFailed: false,
    readPending: false,
    retry: vi.fn(),
  };
  await replicatedClassesTable.clearCache();
  await replicatedEntriesTable.clearCache();
  await replicatedEntriesTable.batchSet(
    CLASSES.flatMap(c => [
      entry(c.id, 1, { finalPlacement: '2' }),
      entry(c.id, 2, { finalPlacement: '1' }),
      entry(c.id, 3, { resultStatus: 'nq' }),
    ]) as never
  );
  signInReplicatedTable(replicatedEntriesTable, 'user-test');
  await replicatedEntriesTable.updateSyncMetadata(
    { lastIncrementalSyncAt: Date.now(), totalRows: 6 },
    { scopeValue: 'show-1', scopeSyncedBy: 'user-test' }
  );
  await replicatedClassesTable.batchSet(
    CLASSES.map((c, i) => ({
      id: c.id,
      trialId: 'trial-1',
      element: c.element,
      level: c.level,
      section: c.section,
      classStatus: 'Completed',
      startTime: `0${9 + i}:00`,
      resultsReleasedAt: null,
      results_released_at: null,
      resultsVerifiedAt: null,
      resultsVerifiedBy: null,
    })) as never
  );
});

describe('Results tab Check scores placement column (MYK9-1230)', () => {
  it.each(CLASSES)('shows each dog its place in $element $level $section', async ({ id }) => {
    render(
      <Routes>
        <Route path="/shows/:id/results" element={<ResultsTab />} />
      </Routes>,
      { initialRoute: `/shows/show-1/results?status=all&classId=${id}` }
    );
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getAllByRole('row').length).toBe(4));
    const placeByArmband = Object.fromEntries(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map(row => {
          const cells = within(row).getAllByRole('cell');
          return [cells[1]!.textContent, cells[0]!.textContent];
        })
    );
    expect(placeByArmband).toEqual({ '101': '2', '102': '1', '103': '—' });
  });
});
