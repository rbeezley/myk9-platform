import { Routes, Route } from 'react-router-dom';
import type { ReactElement } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';

const useSecretaryShowEntriesQueryMock = vi.hoisted(() => vi.fn());

vi.mock('./useScoringBreadcrumb', () => ({
  useScoringBreadcrumb: () => ({
    isLoading: false,
    showId: 'show-1',
    showName: 'Spring Trial',
    trialLabel: 'Trial 1',
    trialId: 'trial-1',
  }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useSecretaryShowEntriesQuery: useSecretaryShowEntriesQueryMock,
}));

vi.mock('@/hooks/useOptimisticScoring', () => ({
  useOptimisticScoring: () => ({
    submitScoreOptimistically: vi.fn(),
    isSyncing: false,
    hasError: false,
  }),
}));

vi.mock('@myk9/scoring-ui', () => ({
  buildResolvedClassRules: () => ({ maxTimeSeconds: 120 }),
  getScoresheetComponent: () => null,
  useEntryListFilters: () => ({
    activeTab: 'pending',
    setActiveTab: vi.fn(),
    sortBy: 'run',
    setSortBy: vi.fn(),
    searchTerm: '',
    setSearchTerm: vi.fn(),
    filteredEntries: [],
    entryCounts: { pending: 0, completed: 0, total: 0 },
    pendingEntries: [],
    completedEntries: [],
  }),
  useDragAndDropEntries: () => ({
    sensors: [],
    handleDragStart: vi.fn(),
    handleDragEnd: vi.fn(),
    isDragging: false,
  }),
}));

vi.mock('./hooks/usePaperScoring', () => ({
  usePaperScoring: () => ({
    mode: 'split',
    setMode: vi.fn(),
    selectedEntryId: null,
    selectEntry: vi.fn(),
    sessionSettings: {},
    setSessionSettings: vi.fn(),
    saveEntry: vi.fn(),
    clearEntry: vi.fn(),
    isSaving: false,
  }),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
  },
}));

vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: { getClassById: vi.fn() },
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { getEntriesByClass: vi.fn(), sync: vi.fn(), updateEntry: vi.fn() },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { get: vi.fn() },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { getTrialById: vi.fn() },
}));
vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: { get: vi.fn() },
}));

import { ScoresheetPage } from './ScoresheetPage';
import { PaperScoresheetPage } from './PaperScoresheetPage';
import { ScoringEntryListPage } from './ScoringEntryListPage';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';

const never = () => new Promise<never>(() => {});

const renderRoute = (path: string, element: ReactElement, initialRoute: string) =>
  render(
    <Routes>
      <Route path={path} element={element} />
    </Routes>,
    { initialRoute }
  );

describe('scoring route loading states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSecretaryShowEntriesQueryMock.mockReturnValue({
      data: Array.from({ length: 8 }, (_, index) => ({
        id: `entry-${index + 1}`,
        show_id: 'show-1',
        trial_id: 'trial-1',
        class_id: 'class-1',
        dog_id: `dog-${index + 1}`,
        handler_id: `handler-${index + 1}`,
        armband: String(101 + index),
        handler: `Handler ${index + 1}`,
        entry_status: 'accepted',
        check_in_status: 'checked-in',
        is_in_ring: false,
        is_scored: index < 3,
        result_status: index < 3 ? 'qualified' : 'pending',
        search_time_seconds: index < 3 ? 20 + index : null,
        total_faults: 0,
        run_order: index + 1,
        dog: {
          id: `dog-${index + 1}`,
          name: `Dog ${index + 1}`,
          call_name: `Dog ${index + 1}`,
          breed: 'Beagle',
          owner: null,
        },
      })),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    vi.mocked(replicatedEntriesTable.getEntriesByClass).mockResolvedValue([]);
  });

  it('uses a skeleton, not a spinner, while the live scoresheet loads', () => {
    vi.mocked(replicatedClassesTable.getClassById).mockImplementation(never as never);

    renderRoute(
      '/scoring/classes/:classId/entries/:entryId',
      <ScoresheetPage />,
      '/scoring/classes/class-1/entries/entry-1'
    );

    expect(screen.getByRole('status', { name: 'Loading scoresheet' })).toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeNull();
  });

  it('keeps the live scoresheet error state distinct from loading', async () => {
    vi.mocked(replicatedClassesTable.getClassById).mockResolvedValue(null as never);

    renderRoute(
      '/scoring/classes/:classId/entries/:entryId',
      <ScoresheetPage />,
      '/scoring/classes/class-1/entries/entry-1'
    );

    expect(await screen.findByText('Class not found')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading scoresheet' })).not.toBeInTheDocument();
  });

  it('uses a skeleton, not a spinner, while the paper scoresheet loads', () => {
    vi.mocked(replicatedClassesTable.getClassById).mockImplementation(never as never);

    renderRoute(
      '/scoring/classes/:classId/paper',
      <PaperScoresheetPage />,
      '/scoring/classes/class-1/paper'
    );

    expect(screen.getByRole('status', { name: 'Loading paper scoresheet' })).toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeNull();
  });

  it('keeps the paper scoresheet error state distinct from loading', async () => {
    vi.mocked(replicatedClassesTable.getClassById).mockResolvedValue(null as never);

    renderRoute(
      '/scoring/classes/:classId/paper',
      <PaperScoresheetPage />,
      '/scoring/classes/class-1/paper'
    );

    expect(await screen.findByText('Class not found')).toBeInTheDocument();
    expect(
      screen.queryByRole('status', { name: 'Loading paper scoresheet' })
    ).not.toBeInTheDocument();
  });

  it('uses a skeleton, not a spinner, while scoring entries load', () => {
    vi.mocked(replicatedClassesTable.getClassById).mockImplementation(never as never);

    renderRoute(
      '/scoring/classes/:classId/entries',
      <ScoringEntryListPage />,
      '/scoring/classes/class-1/entries'
    );

    expect(screen.getByRole('status', { name: 'Loading scoring entries' })).toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeNull();
  });

  it('keeps the scoring entry list error state distinct from loading', async () => {
    vi.mocked(replicatedClassesTable.getClassById).mockResolvedValue(null as never);

    renderRoute(
      '/scoring/classes/:classId/entries',
      <ScoringEntryListPage />,
      '/scoring/classes/class-1/entries'
    );

    expect(await screen.findByText('Class not found')).toBeInTheDocument();
    expect(
      screen.queryByRole('status', { name: 'Loading scoring entries' })
    ).not.toBeInTheDocument();
  });

  it('derives the scoring list total from the canonical show entry rows', async () => {
    vi.mocked(replicatedClassesTable.getClassById).mockResolvedValue({
      id: 'class-1',
      name: 'Container Novice A',
      trialId: 'trial-1',
    } as never);

    renderRoute(
      '/scoring/classes/:classId/entries',
      <ScoringEntryListPage />,
      '/scoring/classes/class-1/entries'
    );

    expect(await screen.findByText('8 Entries')).toBeInTheDocument();
  });

  it('shows an error instead of a false zero when canonical scoring rows are unavailable', async () => {
    vi.mocked(replicatedClassesTable.getClassById).mockResolvedValue({
      id: 'class-1',
      name: 'Container Novice A',
      trialId: 'trial-1',
    } as never);
    useSecretaryShowEntriesQueryMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
      error: new Error('Offline with no cached entries'),
      refetch: vi.fn(),
    });

    renderRoute(
      '/scoring/classes/:classId/entries',
      <ScoringEntryListPage />,
      '/scoring/classes/class-1/entries'
    );

    expect(await screen.findByText('Offline with no cached entries')).toBeInTheDocument();
    expect(screen.queryByText('0 Entries')).not.toBeInTheDocument();
  });

  it('keeps cached scoring rows visible when a background refresh fails', async () => {
    vi.mocked(replicatedClassesTable.getClassById).mockResolvedValue({
      id: 'class-1',
      name: 'Container Novice A',
      trialId: 'trial-1',
    } as never);
    const cachedEntries = useSecretaryShowEntriesQueryMock().data;
    useSecretaryShowEntriesQueryMock.mockReturnValue({
      data: cachedEntries,
      isLoading: false,
      isError: true,
      error: new Error('Refresh failed'),
      refetch: vi.fn(),
    });

    renderRoute(
      '/scoring/classes/:classId/entries',
      <ScoringEntryListPage />,
      '/scoring/classes/class-1/entries'
    );

    expect(await screen.findByText('8 Entries')).toBeInTheDocument();
    expect(screen.queryByText('Refresh failed')).not.toBeInTheDocument();
  });
});
