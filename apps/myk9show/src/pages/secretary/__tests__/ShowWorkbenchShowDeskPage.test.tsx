import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShowWorkbenchShowDeskPage } from '@/pages/secretary/ShowWorkbenchShowDeskPage';
import type { ReactNode } from 'react';
import { queryKeys } from '@/lib/queryClient';

const getEntriesForShowMock = vi.hoisted(() => vi.fn());
const trialStoreState = vi.hoisted<{
  trials: Array<{
    id: string;
    showId: string;
    trialDate: string;
    trialNumber: string;
    name: string;
  }>;
  trialClasses: Record<
    string,
    Array<{
      id: string;
      element: string;
      level: string;
      section?: string;
      judgeName?: string;
      startTime?: string;
      status?: string;
      completedEntries?: number;
    }>
  >;
  trialsReadStatus: 'idle' | 'loading' | 'ready' | 'error';
  trialsReadError: string | null;
  trialsHasConfirmedSnapshot: boolean;
  trialClassesReadStatus: 'idle' | 'loading' | 'ready' | 'error';
  trialClassesReadError: string | null;
  trialClassesHasConfirmedSnapshot: boolean;
  loadTrials: ReturnType<typeof vi.fn>;
  loadTrialClasses: ReturnType<typeof vi.fn>;
}>(() => ({
  trials: [],
  trialClasses: {},
  trialsReadStatus: 'ready',
  trialsReadError: null,
  trialsHasConfirmedSnapshot: true,
  trialClassesReadStatus: 'ready',
  trialClassesReadError: null,
  trialClassesHasConfirmedSnapshot: true,
  loadTrials: vi.fn(async () => undefined),
  loadTrialClasses: vi.fn(async () => undefined),
}));

vi.mock('@/components/common/LoadingSkeleton', () => ({
  LoadingSkeleton: () => <div data-testid="loading-skeleton" />,
}));

vi.mock('@/hooks/useFastShowDetails', () => ({
  useFastShowDetails: () => ({
    show: { id: 'show-1', name: 'Bluegrass Classic', startDate: '2026-03-22' },
    isLoading: false,
  }),
}));

vi.mock('@/services/database/entries', () => ({
  getEntriesForShow: getEntriesForShowMock,
}));

vi.mock('@/hooks/queries/useShowJudges', () => ({
  useShowJudges: () => ({ data: [] }),
}));

vi.mock('@/hooks/mutations/useResultSubmission', () => ({
  useResultSubmissions: () => ({ data: [] }),
}));

vi.mock('@/services/database/show-incidents', () => ({
  showIncidentCloseoutQueryKey: (showId: string) => ['show-incidents', showId],
  listShowIncidentCloseout: vi.fn(async () => []),
}));

vi.mock('@/features/show-workbench/useJudgeHospitalityReminderCount', () => ({
  useJudgeHospitalityReminderCount: () => 0,
}));

vi.mock('@/hooks/queries/useSecretaryTasks', () => ({
  useSecretaryTasks: () => ({ data: [] }),
}));

vi.mock('@/store/trialStore', () => ({
  useTrialStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector(trialStoreState),
}));

vi.mock('@/features/show-map/ShowDeskPanel', () => ({
  default: ({
    entries,
    classes,
    tools,
  }: {
    entries: unknown[];
    classes: Array<{ entryCount: number; scoredCount: number }>;
    tools: Array<{ id: string; content: ReactNode }>;
  }) => (
    <div data-testid="show-desk-panel">
      <div data-testid="panel-entry-count">{entries.length}</div>
      <div data-testid="panel-class-entry-counts">
        {classes.map(cls => cls.entryCount).join(',')}
      </div>
      <div data-testid="panel-class-scored-counts">
        {classes.map(cls => cls.scoredCount).join(',')}
      </div>
      {tools.find(tool => tool.id === 'people-at-show')?.content}
      {tools.find(tool => tool.id === 'self-checkin')?.content}
      {tools.find(tool => tool.id === 'show-closeout')?.content}
    </div>
  ),
}));

vi.mock('@/features/show-desk-people-roster/ShowDeskPeopleRoster', () => ({
  ShowDeskPeopleRoster: ({
    entries,
    classes,
  }: {
    entries: unknown[];
    classes: Array<{ entryCount: number }>;
  }) => (
    <div data-testid="people-roster">
      <span data-testid="people-roster-entry-count">{entries.length}</span>
      <span data-testid="people-roster-class-entry-counts">
        {classes.map(cls => cls.entryCount).join(',')}
      </span>
    </div>
  ),
}));

vi.mock('@/features/show-workbench/SelfCheckinTool', () => ({
  SelfCheckinTool: ({ showId }: { showId: string }) => (
    <div data-testid="self-checkin-tool">Self check-in for {showId}</div>
  ),
}));

vi.mock('@/features/show-workbench/ShowCloseoutSummary', () => ({
  ShowCloseoutSummary: ({ entries }: { entries: unknown[] }) => (
    <div data-testid="closeout-entry-count">{entries.length}</div>
  ),
}));

function renderPage(initialEntries?: unknown[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (initialEntries) {
    queryClient.setQueryData(queryKeys.showEntries('show-1'), initialEntries);
  }

  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/shows/show-1/show-desk']}>
        <Routes>
          <Route path="/shows/:id/show-desk" element={<ShowWorkbenchShowDeskPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

  return { ...result, queryClient };
}

describe('ShowWorkbenchShowDeskPage', () => {
  beforeEach(() => {
    getEntriesForShowMock.mockReset();
    trialStoreState.trials = [];
    trialStoreState.trialClasses = {};
    trialStoreState.trialsReadStatus = 'ready';
    trialStoreState.trialsReadError = null;
    trialStoreState.trialsHasConfirmedSnapshot = true;
    trialStoreState.trialClassesReadStatus = 'ready';
    trialStoreState.trialClassesReadError = null;
    trialStoreState.trialClassesHasConfirmedSnapshot = true;
    trialStoreState.loadTrials.mockClear();
    trialStoreState.loadTrialClasses.mockClear();
  });

  it('holds Show Desk while entries are loading so counts cannot render as false zero', () => {
    getEntriesForShowMock.mockReturnValue(new Promise(() => undefined));

    renderPage();

    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('show-desk-panel')).not.toBeInTheDocument();
  });

  it('feeds Show Desk, People roster, and closeout from the same show-scoped entries', async () => {
    trialStoreState.trials = [
      {
        id: 'trial-1',
        showId: 'show-1',
        trialDate: '2026-03-22',
        trialNumber: '1',
        name: 'Trial 1',
      },
    ];
    trialStoreState.trialClasses = {
      'trial-1': [
        {
          id: 'class-1',
          element: 'Container',
          level: 'Novice',
          status: 'Scheduled',
        },
      ],
    };
    getEntriesForShowMock.mockResolvedValue({
      data: Array.from({ length: 8 }, (_, index) => ({
        id: `entry-${index + 1}`,
        show_id: 'show-1',
        class_id: 'class-1',
        is_scored: index < 3,
      })),
      error: null,
    });

    renderPage();

    expect(await screen.findByTestId('show-desk-panel')).toBeInTheDocument();
    expect(screen.getByTestId('panel-entry-count')).toHaveTextContent('8');
    expect(screen.getByTestId('panel-class-entry-counts')).toHaveTextContent('8');
    expect(screen.getByTestId('panel-class-scored-counts')).toHaveTextContent('3');
    expect(screen.getByTestId('people-roster-entry-count')).toHaveTextContent('8');
    expect(screen.getByTestId('people-roster-class-entry-counts')).toHaveTextContent('8');
    expect(screen.getByTestId('closeout-entry-count')).toHaveTextContent('8');
    expect(screen.getByTestId('self-checkin-tool')).toHaveTextContent('Self check-in for show-1');
    expect(screen.getByRole('link', { name: 'Results' })).toHaveAttribute(
      'href',
      '/shows/show-1/results-control'
    );
  });

  it('keeps cached Show Desk counts visible when a background refresh fails', async () => {
    trialStoreState.trials = [
      {
        id: 'trial-1',
        showId: 'show-1',
        trialDate: '2026-03-22',
        trialNumber: '1',
        name: 'Trial 1',
      },
    ];
    trialStoreState.trialClasses = {
      'trial-1': [
        {
          id: 'class-1',
          element: 'Container',
          level: 'Novice',
          status: 'Scheduled',
        },
      ],
    };
    const cachedEntries = Array.from({ length: 8 }, (_, index) => ({
      id: `entry-${index + 1}`,
      show_id: 'show-1',
      class_id: 'class-1',
      is_scored: index < 3,
    }));
    getEntriesForShowMock.mockResolvedValue({ data: null, error: new Error('Refresh failed') });

    const { queryClient } = renderPage(cachedEntries);

    expect(await screen.findByTestId('panel-class-entry-counts')).toHaveTextContent('8');
    void queryClient.invalidateQueries({ queryKey: queryKeys.showEntries('show-1') });

    await waitFor(() => expect(getEntriesForShowMock).toHaveBeenCalled());
    expect(screen.getByTestId('show-desk-panel')).toBeInTheDocument();
    expect(screen.getByTestId('panel-class-entry-counts')).toHaveTextContent('8');
    expect(screen.getByTestId('panel-class-scored-counts')).toHaveTextContent('3');
    expect(screen.queryByText("Couldn't load show entries.")).not.toBeInTheDocument();
  });

  it('pauses Show Desk claims and retries both schedule reads after an initial failure', async () => {
    trialStoreState.trialsReadStatus = 'error';
    trialStoreState.trialsReadError = 'Trial read failed';
    trialStoreState.trialsHasConfirmedSnapshot = false;
    trialStoreState.trialClassesReadStatus = 'error';
    trialStoreState.trialClassesReadError = 'Class read failed';
    trialStoreState.trialClassesHasConfirmedSnapshot = false;
    getEntriesForShowMock.mockResolvedValue({ data: [], error: null });

    renderPage();

    expect(await screen.findByText("Couldn't load the show schedule.")).toBeInTheDocument();
    expect(screen.queryByTestId('show-desk-panel')).not.toBeInTheDocument();
    expect(screen.queryByText(/No Classes are scheduled/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Show-day work has not started/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry schedule' }));

    expect(trialStoreState.loadTrials).toHaveBeenCalledTimes(1);
    expect(trialStoreState.loadTrialClasses).toHaveBeenCalledTimes(1);
  });

  it('holds Show Desk while the initial schedule snapshot is loading', async () => {
    trialStoreState.trialsReadStatus = 'loading';
    trialStoreState.trialsHasConfirmedSnapshot = false;
    trialStoreState.trialClassesReadStatus = 'loading';
    trialStoreState.trialClassesHasConfirmedSnapshot = false;
    getEntriesForShowMock.mockResolvedValue({ data: [], error: null });

    renderPage();

    expect(await screen.findByTestId('loading-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('show-desk-panel')).not.toBeInTheDocument();
  });

  it('keeps a confirmed schedule visible and warns when refresh fails', async () => {
    trialStoreState.trials = [
      {
        id: 'trial-1',
        showId: 'show-1',
        trialDate: '2026-03-22',
        trialNumber: '1',
        name: 'Trial 1',
      },
    ];
    trialStoreState.trialClasses = {
      'trial-1': [
        {
          id: 'class-1',
          element: 'Container',
          level: 'Novice',
          status: 'Scheduled',
        },
      ],
    };
    trialStoreState.trialsReadStatus = 'error';
    trialStoreState.trialsReadError = 'Trial refresh failed';
    trialStoreState.trialClassesReadStatus = 'error';
    trialStoreState.trialClassesReadError = 'Class refresh failed';
    getEntriesForShowMock.mockResolvedValue({ data: [], error: null });

    renderPage();

    expect(await screen.findByTestId('show-desk-panel')).toBeInTheDocument();
    expect(screen.getByText("Couldn't refresh the show schedule.")).toBeInTheDocument();
    expect(screen.getByText(/last loaded schedule is still shown/i)).toBeInTheDocument();
  });
});
