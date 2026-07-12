/**
 * Integration test for the exhibitor-first "Your dogs today" show-day view
 * (openspec/changes/exhibitor-elderly-ux-remediation, section 3).
 */
import { Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/test/utils/testUtils';
import { ReplicationSyncContext } from '@/context/ReplicationSyncContext';
import type { ReplicationSyncContextValue } from '@/context/ReplicationSyncContext';
import { UserRole } from '@/types/auth-types';
import { mockSupabase } from '@/test/mocks/supabase';
import { fromAny } from '@total-typescript/shoehorn';

vi.mock('@/services/replication', () => ({
  replicatedShowsTable: {
    getShowById: vi.fn(),
    getAll: vi.fn().mockResolvedValue([]),
    subscribe: vi.fn(() => vi.fn()),
  },
  replicatedTrialsTable: {
    getTrialsByShow: vi.fn(),
    getAll: vi.fn().mockResolvedValue([]),
    subscribe: vi.fn(() => vi.fn()),
  },
  replicatedClassesTable: {
    getClassesByTrial: vi.fn(),
    getAll: vi.fn().mockResolvedValue([]),
    subscribe: vi.fn(() => vi.fn()),
  },
  replicatedEntriesTable: {
    getEntriesByShow: vi.fn(),
    getAll: vi.fn().mockResolvedValue([]),
    subscribe: vi.fn(() => vi.fn()),
  },
}));

const mockAuthState = vi.hoisted(() => ({
  hasRole: (role: unknown): boolean => {
    void role;
    return false;
  },
  userWithRoles: null as unknown,
  user: null as { id: string } | null,
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => mockAuthState,
}));

import { AtShowClassListPage } from './AtShowClassListPage';
import {
  replicatedShowsTable,
  replicatedTrialsTable,
  replicatedClassesTable,
  replicatedEntriesTable,
} from '@/services/replication';

const settledSyncStatus: ReplicationSyncContextValue['status'] = {
  isSyncing: false,
  lastSyncAt: new Date('2026-06-01T12:00:00Z'),
  error: null,
  tablesStatus: { shows: 'success', trials: 'success', classes: 'success', entries: 'success' },
};

function seed() {
  vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue({
    name: 'Spring Trial',
    organization: 'AKC Scent Work',
  } as never);
  vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([
    { id: 'trial-1', trialNumber: 1, date: '2026-06-01' },
  ] as never);
  vi.mocked(replicatedClassesTable.getClassesByTrial).mockResolvedValue([
    {
      id: 'class-1',
      element: 'Container',
      level: 'Novice',
      section: '-',
      classStatus: 'in_progress',
      classOrder: 1,
      judgeName: 'Judge J',
    },
  ] as never);
}

function seedOwnedEntry(overrides: Record<string, unknown> = {}) {
  const rpcMock = fromAny<
    {
      mockImplementation: (implementation: (fn: string) => never) => void;
    },
    typeof mockSupabase.rpc
  >(mockSupabase.rpc);
  rpcMock.mockImplementation((fn: string) => {
    if (fn === 'get_account_today_entries') {
      return Promise.resolve({
        data: [{ entry_id: 'entry-1', show_id: 'show-1', show_name: 'Spring Trial' }],
        error: null,
      }) as never;
    }
    return Promise.resolve({ data: null, error: null }) as never;
  });
  vi.mocked(replicatedEntriesTable.getEntriesByShow).mockResolvedValue([
    {
      id: 'entry-1',
      showId: 'show-1',
      classId: 'class-1',
      dogCallName: 'Rex',
      armband: '101',
      checkInStatus: 'no-status',
      runOrder: 3,
      isScored: false,
      ...overrides,
    },
  ] as never);
}

const renderPage = () =>
  render(
    <ReplicationSyncContext.Provider
      value={{ status: settledSyncStatus, triggerSync: vi.fn(), syncTable: vi.fn() }}
    >
      <Routes>
        <Route path="/at-show/:showId" element={<AtShowClassListPage />} />
        <Route path="/at-show/:showId/class/:classId" element={<div>SINGLE PAGE</div>} />
      </Routes>
    </ReplicationSyncContext.Provider>,
    { initialRoute: '/at-show/show-1' }
  );

describe('AtShowClassListPage — exhibitor "Your dogs today" default', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    seed();
    mockAuthState.hasRole = () => false;
    mockAuthState.userWithRoles = null;
    mockAuthState.user = null;
  });

  it('defaults an exhibitor-only account with owned entries to "Your dogs today"', async () => {
    mockAuthState.hasRole = role => role === UserRole.EXHIBITOR;
    mockAuthState.user = { id: 'user-1' };
    seedOwnedEntry();

    renderPage();

    expect(await screen.findByText('Your dogs today')).toBeInTheDocument();
    expect(await screen.findByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('#101')).toBeInTheDocument();
  });

  it('keeps the class-first default for a secretary who also exhibits', async () => {
    mockAuthState.hasRole = role => role === UserRole.EXHIBITOR || role === UserRole.SECRETARY;
    mockAuthState.user = { id: 'user-1' };
    seedOwnedEntry();

    renderPage();

    expect(await screen.findByText(/Container Novice/)).toBeInTheDocument();
    expect(screen.queryByText('Your dogs today')).not.toBeInTheDocument();
  });

  it('lets the exhibitor switch to the full class list and back', async () => {
    mockAuthState.hasRole = role => role === UserRole.EXHIBITOR;
    mockAuthState.user = { id: 'user-1' };
    seedOwnedEntry();

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'See all classes' }));
    expect(await screen.findByText(/Container Novice/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Your dogs today' }));
    await waitFor(() => {
      expect(screen.getByText('Rex')).toBeInTheDocument();
    });
  });

  it('explains an unposted running order instead of a contradictory empty state', async () => {
    mockAuthState.hasRole = role => role === UserRole.EXHIBITOR;
    mockAuthState.user = { id: 'user-1' };
    seedOwnedEntry({ classId: 'class-not-loaded-yet', runOrder: undefined });

    renderPage();

    expect(await screen.findByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('Running order not posted yet')).toBeInTheDocument();
    expect(screen.getByText('Not posted yet')).toBeInTheDocument();
    expect(screen.queryByText('This show has no classes yet.')).not.toBeInTheDocument();
  });
});
