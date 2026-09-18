import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShowWorkbenchShowDeskPage } from '@/pages/secretary/ShowWorkbenchShowDeskPage';
import type { ReactNode } from 'react';
import { queryKeys } from '@/lib/queryClient';

const getEntriesForShowMock = vi.hoisted(() => vi.fn());
/**
 * The manage gate, as `useShowManageScope` reports it. `canManage` decides the
 * page; `canOperate` is strictly narrower and decides the three controls that
 * route into `ProtectedRoute(SECRETARY | SITE_ADMIN)` paths. A club admin is
 * `canManage: true, canOperate: false` -- the persona MYK9-630 phase 3 puts on
 * this tab.
 */
const manageScopeState = vi.hoisted<{
  value: {
    status: 'resolved' | 'resolving' | 'unavailable';
    canManage: boolean;
    canOperate: boolean;
    hasOperationalStaffRole: boolean;
    clubId: string | undefined;
  };
}>(() => ({
  value: {
    status: 'resolved',
    canManage: true,
    canOperate: true,
    hasOperationalStaffRole: true,
    clubId: 'club-1',
  },
}));
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
    tools: Array<{ id: string; content: ReactNode; defaultOpen?: boolean }>;
  }) => (
    <div data-testid="show-desk-panel">
      <div data-testid="panel-entry-count">{entries.length}</div>
      <div data-testid="panel-class-entry-counts">
        {classes.map(cls => cls.entryCount).join(',')}
      </div>
      <div data-testid="panel-class-scored-counts">
        {classes.map(cls => cls.scoredCount).join(',')}
      </div>
      {/* The three this file already exercised, PLUS the two that carry
          secretary-only destinations. A mock that renders a subset can only
          answer the authorization question for the subset -- which is how the
          add-entries and volunteers controls went ungated for a club admin in
          the first place (REV-2341 P1). Rendering every tool is not an option
          here: several mount heavy children this file does not stub. Each id is
          listed, so adding a tool with a secretary-only link and not listing it
          is a visible omission rather than a silent one. */}
      {(
        ['people-at-show', 'self-checkin', 'show-closeout', 'add-entries', 'volunteers'] as const
      ).map(id => {
        const tool = tools.find(item => item.id === id);
        if (!tool) return null;
        return (
          <div key={id} data-testid={`tool-${id}`} data-default-open={String(!!tool.defaultOpen)}>
            {tool.content}
          </div>
        );
      })}
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

vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => manageScopeState.value,
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
      <MemoryRouter initialEntries={['/shows/show-1/show-day']}>
        <Routes>
          <Route path="/shows/:id/show-day" element={<ShowWorkbenchShowDeskPage />} />
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
    manageScopeState.value = {
      status: 'resolved',
      canManage: true,
      canOperate: true,
      hasOperationalStaffRole: true,
      clubId: 'club-1',
    };
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
      '/shows/show-1/results'
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
  describe('a club admin — manages this show but is not its trial secretary', () => {
    // REV-2341 lens P, P1. MYK9-630 phase 3 puts Show Day in a club admin's
    // primary nav. Three controls in the page BODY route into
    // `ProtectedRoute(SECRETARY | SITE_ADMIN)` paths — "Add mail-in entry" and
    // "Add late entry" (`/secretary/register/:showId`) and "Open volunteer
    // scheduling" (`/secretary/volunteers`) — and all three were enabled, so a
    // click landed on a chrome-less "You don't have permission" wall. The header
    // Actions menu had greyed the identical mail-in item with a reason all along.
    beforeEach(() => {
      manageScopeState.value = {
        status: 'resolved',
        canManage: true,
        canOperate: false,
        hasOperationalStaffRole: false,
        clubId: 'club-1',
      };
      getEntriesForShowMock.mockResolvedValue({ data: [], error: null });
    });

    it('offers no ENABLED control that routes to a secretary-only path', async () => {
      renderPage();
      expect(await screen.findByTestId('show-desk-panel')).toBeInTheDocument();

      // The generic form of the bug, not three named buttons: nothing the
      // viewer can actually press may lead somewhere they will be refused.
      const enabledSecretaryLinks = screen
        .queryAllByRole('link')
        .filter(link => !link.hasAttribute('aria-disabled'))
        .map(link => link.getAttribute('href') ?? '')
        .filter(href => href.startsWith('/secretary/'));
      expect(enabledSecretaryLinks).toEqual([]);

      for (const name of [/add mail-in entry/i, /add late entry/i, /open volunteer scheduling/i]) {
        expect(screen.getByRole('button', { name })).toBeDisabled();
      }
    });

    it('says why, in the same sentence the Actions menu uses', async () => {
      renderPage();
      expect(await screen.findByTestId('show-desk-panel')).toBeInTheDocument();

      // Three controls, three reasons — one per control, so a focused button
      // has its own description rather than a note somewhere on the page.
      expect(screen.getAllByText('Trial secretary access only')).toHaveLength(3);
    });

    it('does not open the Add entries section onto mostly-disabled buttons', async () => {
      renderPage();
      expect(await screen.findByTestId('show-desk-panel')).toBeInTheDocument();

      expect(screen.getByTestId('tool-add-entries')).toHaveAttribute('data-default-open', 'false');
    });

    it('keeps "Enter my own dogs" live — that wizard has no role requirement', async () => {
      renderPage();
      expect(await screen.findByTestId('show-desk-panel')).toBeInTheDocument();

      expect(screen.getByRole('button', { name: /enter my own dogs/i })).toBeEnabled();
    });
  });

  describe('a trial secretary — the positive control', () => {
    beforeEach(() => {
      getEntriesForShowMock.mockResolvedValue({ data: [], error: null });
    });

    it('gets all three controls live and the Add entries section open', async () => {
      renderPage();
      expect(await screen.findByTestId('show-desk-panel')).toBeInTheDocument();

      expect(screen.getByRole('button', { name: /add mail-in entry/i })).toBeEnabled();
      expect(screen.getByRole('link', { name: /open volunteer scheduling/i })).toHaveAttribute(
        'href',
        expect.stringContaining('/secretary/volunteers')
      );
      expect(screen.getByTestId('tool-add-entries')).toHaveAttribute('data-default-open', 'true');
      expect(screen.queryByText('Trial secretary access only')).toBeNull();
    });
  });
});
