import '@/test/utils/pageRenderWait';
/**
 * MYK9-2137: an exhibitor opens a class's Requirements from Ringside's class card, read-only,
 * with the time limit and when it was set. A class manager keeps it inside Class Options
 * instead, so the card shows one door per role. Phase 0: before this, no exhibitor could
 * reach ClassRequirementsDialog (it sat behind the manager-only Class options ellipsis).
 */
import { Routes, Route } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@/test/utils/testUtils';
import { ReplicationSyncTestProvider } from '@/test/utils/ReplicationSyncTestProvider';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';

vi.mock('@/services/replication', () => ({
  replicatedArmbandsTable: {
    getByShow: vi.fn(async () => []),
    sync: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  },
  replicatedShowsTable: { getShowById: vi.fn(), subscribe: vi.fn(() => vi.fn()) },
  replicatedTrialsTable: {
    getTrialsByShow: vi.fn(),
    getTrialById: vi.fn(async () => null),
    subscribe: vi.fn(() => vi.fn()),
  },
  replicatedClassesTable: {
    getClassesByTrial: vi.fn(),
    getClassById: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  },
  replicatedEntriesTable: { getEntriesByShow: vi.fn(), subscribe: vi.fn(() => vi.fn()) },
}));
vi.mock('@/services/database/judges', () => ({
  getActiveJudgeAssignmentsForShow: vi.fn(async () => []),
  subscribeToJudgeAssignmentChanges: vi.fn(() => vi.fn()),
}));
vi.mock('@/services/replication/sharedMutationManager', () => ({
  mutationManager: { getPendingMutationsForTable: vi.fn(async () => []) },
}));
vi.mock('@/services/replication/unsentWork', async importOriginal => {
  const actual = await importOriginal<typeof import('@/services/replication/unsentWork')>();
  return {
    ...actual,
    readDeviceUnsentWork: vi.fn(async () => actual.summarizeUnsentWork([] as never, [])),
  };
});

const role = vi.hoisted(() => ({ primary: null as string | null }));
vi.mock('./atShowDataAdapter', async importOriginal => ({
  ...(await importOriginal<typeof import('./atShowDataAdapter')>()),
  syncAtShowData: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    hasRole: () => false,
    user: null,
    userWithRoles: null,
    getUserRoles: () => [],
  }),
  getPrimaryRole: () => role.primary,
}));

import { UserRole } from '@/types/auth-types';
import { AtShowClassListPage } from './AtShowClassListPage';
import {
  replicatedClassesTable,
  replicatedEntriesTable,
  replicatedShowsTable,
  replicatedTrialsTable,
} from '@/services/replication';

const CLASS = {
  id: 'class-c',
  element: 'Interior',
  level: 'Excellent',
  section: '-',
  classStatus: 'setup',
  classOrder: 1,
  judgeName: 'Judge J',
  areaCount: 1,
  timeLimitSeconds: 150,
  timeLimitSetAt: '2024-06-01T18:14:00Z',
  timeLimitRule: undefined,
};

const status: ReplicationSyncContextValue['status'] = {
  isSyncing: false,
  lastSyncAt: new Date('2026-06-01T12:00:00Z'),
  error: null,
  tablesStatus: { shows: 'success', trials: 'success', classes: 'success', entries: 'success' },
};

function renderPage() {
  return render(
    <ReplicationSyncTestProvider value={{ status, triggerSync: vi.fn(), syncTable: vi.fn() }}>
      <Routes>
        <Route path="/at-show/:showId" element={<AtShowClassListPage />} />
      </Routes>
    </ReplicationSyncTestProvider>,
    { initialRoute: '/at-show/show-1' }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue({
    name: 'Spring Trial',
    organization: 'AKC Scent Work',
  } as never);
  vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([
    { id: 'trial-1', name: 'Trial 1', trialNumber: 'Trial 1', date: '2026-06-01' },
  ] as never);
  vi.mocked(replicatedClassesTable.getClassesByTrial).mockResolvedValue([CLASS] as never);
  vi.mocked(replicatedClassesTable.getClassById).mockResolvedValue(CLASS as never);
  vi.mocked(replicatedEntriesTable.getEntriesByShow).mockResolvedValue([] as never);
});

describe('Ringside class card Requirements door (MYK9-2137)', () => {
  it('gives an exhibitor a Requirements button that opens the read-only view', async () => {
    role.primary = UserRole.EXHIBITOR;
    renderPage();
    expect(screen.queryByRole('button', { name: /Class options for/ })).not.toBeInTheDocument();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Requirements for Interior Excellent' })
    );

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('2:30')).toBeInTheDocument();
    expect(within(dialog).getByText(/set Jun 1, 2024/)).toBeInTheDocument();
    // Read-only: the max time card is not a Set Max Time button and offers no "Tap to set".
    expect(within(dialog).queryByRole('button', { name: /set max time/i })).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Tap to set/)).not.toBeInTheDocument();
  });

  it('leaves a class manager on Class Options, with no second Requirements button', async () => {
    role.primary = UserRole.SECRETARY;
    renderPage();
    expect(
      await screen.findByRole('button', { name: 'Class options for Interior Excellent' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Requirements for Interior Excellent' })
    ).not.toBeInTheDocument();
  });
});
