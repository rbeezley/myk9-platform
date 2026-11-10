import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShowWorkbenchShowDeskPage } from '@/pages/secretary/ShowWorkbenchShowDeskPage';
import type { ReactNode } from 'react';
import { queryKeys } from '@/lib/queryClient';
import { usePageEditTargetStore } from '@/features/actions/pageEditTarget';
import { HeaderActions } from '@/components/layout/HeaderActions';
import { getCheckInDeskHref } from '@/components/entries/management/checkInDesk/checkInDeskRoutes';

const getEntriesForShowMock = vi.hoisted(() => vi.fn());
/** How each `onRefreshEntries` call the panel made settled. */
const refreshOutcomes = vi.hoisted<Array<'resolved' | 'rejected'>>(() => []);
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

/** MYK9-1685: the "This show uses…" switches as the page reads them. */
const usesSwitches = vi.hoisted(() => ({
  show: {} as Record<string, boolean>,
  selfCheckinEnabled: undefined as boolean | undefined,
}));

vi.mock('@/hooks/useFastShowDetails', () => ({
  useFastShowDetails: () => ({
    show: {
      id: 'show-1',
      name: 'Bluegrass Classic',
      startDate: '2026-03-22',
      ...usesSwitches.show,
    },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/queries/useShowSettingsDatabase', () => ({
  useShowSettings: () => ({
    data:
      usesSwitches.selfCheckinEnabled === undefined
        ? undefined
        : { selfCheckinEnabled: usesSwitches.selfCheckinEnabled },
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

const deskSignals = vi.hoisted(() => ({
  incidents: [] as Array<{ id: string; severity: string; occurred_at: string }>,
  tasks: [] as Array<{ id: string; status: string }> | undefined,
}));

vi.mock('@/services/database/show-incidents', () => ({
  showIncidentCloseoutQueryKey: (showId: string) => ['show-incidents', showId],
  listShowIncidentCloseout: vi.fn(async () => deskSignals.incidents),
}));

vi.mock('@/hooks/queries/useSecretaryTasks', () => ({
  useSecretaryTasks: () => ({ data: deskSignals.tasks }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ hasRole: () => true, hasPermission: () => true, rbacLoading: false }),
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
    onRefreshEntries,
  }: {
    onRefreshEntries?: () => Promise<void>;
    entries: unknown[];
    classes: Array<{ entryCount: number; scoredCount: number }>;
    tools: Array<{
      id: string;
      group: string;
      href?: string;
      content: ReactNode;
      defaultOpen?: boolean;
    }>;
  }) => (
    <div data-testid="show-desk-panel">
      <button
        type="button"
        data-testid="panel-refresh-entries"
        onClick={() => {
          void onRefreshEntries?.().then(
            () => refreshOutcomes.push('resolved'),
            () => refreshOutcomes.push('rejected')
          );
        }}
      />
      <div data-testid="panel-entry-count">{entries.length}</div>
      <div data-testid="panel-class-entry-counts">
        {classes.map(cls => cls.entryCount).join(',')}
      </div>
      <div data-testid="panel-class-scored-counts">
        {classes.map(cls => cls.scoredCount).join(',')}
      </div>
      {/* The two this file already exercised, PLUS the one that carries a
          secretary-only destination. A mock that renders a subset can only
          answer the authorization question for the subset -- which is how the
          add-entries and volunteers controls went ungated for a club admin in
          the first place (REV-2341 P1). Rendering every tool is not an option
          here: several mount heavy children this file does not stub. Each id is
          listed, so adding a tool with a secretary-only link and not listing it
          is a visible omission rather than a silent one. */}
      <div data-testid="panel-tool-ids">{tools.map(tool => tool.id).join(',')}</div>
      <ol data-testid="tool-inventory">
        {tools.map(tool => (
          <li key={tool.id} data-href={tool.href ?? ''}>
            {`${tool.group}:${tool.id}`}
          </li>
        ))}
      </ol>
      {(['self-checkin', 'volunteers'] as const).map(id => {
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

vi.mock('@/features/show-workbench/SelfCheckinTool', () => ({
  SelfCheckinTool: ({ showId }: { showId: string }) => (
    <div data-testid="self-checkin-tool">Self check-in for {showId}</div>
  ),
}));

vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => manageScopeState.value,
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="entries-location">{`${location.pathname}${location.search}`}</div>;
}

function renderPage(initialEntries?: unknown[], route = '/shows/show-1/show-day') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (initialEntries) {
    queryClient.setQueryData(queryKeys.showEntries('show-1'), initialEntries);
  }

  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/shows/:id/show-day" element={<ShowWorkbenchShowDeskPage />} />
          <Route path="/shows/:id/entries" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

  return { ...result, queryClient };
}

describe('ShowWorkbenchShowDeskPage', () => {
  beforeEach(() => {
    usePageEditTargetStore.setState({ showTools: null, showToolsOwner: null });
    getEntriesForShowMock.mockReset();
    refreshOutcomes.length = 0;
    deskSignals.incidents = [];
    deskSignals.tasks = [];
    usesSwitches.show = {};
    usesSwitches.selfCheckinEnabled = undefined;
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
    // No panel exists to open, so the header must not offer ?tool= rows yet.
    expect(usePageEditTargetStore.getState().showTools).toBeNull();
  });

  it('feeds Show Desk and People roster from the same show-scoped entries', async () => {
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
    // Once the desk body renders, its tools reach the header for this show.
    expect(usePageEditTargetStore.getState().showTools?.showId).toBe('show-1');
    expect(usePageEditTargetStore.getState().showTools?.tools).toHaveLength(10);
    expect(screen.getByTestId('panel-entry-count')).toHaveTextContent('8');
    expect(screen.getByTestId('panel-class-entry-counts')).toHaveTextContent('8');
    expect(screen.getByTestId('panel-class-scored-counts')).toHaveTextContent('3');
    expect(screen.getByTestId('self-checkin-tool')).toHaveTextContent('Self check-in for show-1');
  });

  // MYK9-1685: each "This show uses…" switch hides its Actions row when off and restores it when
  // on, on the page's real tool list. An unknown value keeps the row (the default case above).
  describe.each([
    [
      'Exhibitor self check-in',
      'self-checkin',
      () => (usesSwitches.selfCheckinEnabled = false),
      () => (usesSwitches.selfCheckinEnabled = true),
    ],
    [
      'Judges score on devices',
      'access-codes',
      () => (usesSwitches.show.usesDeviceScoring = false),
      () => (usesSwitches.show.usesDeviceScoring = true),
    ],
    [
      'Paper fallback packet',
      'emergency-trial-packet',
      () => (usesSwitches.show.usesPaperPacket = false),
      () => (usesSwitches.show.usesPaperPacket = true),
    ],
    [
      'Volunteer tracking',
      'volunteers',
      () => (usesSwitches.show.usesVolunteers = false),
      () => (usesSwitches.show.usesVolunteers = true),
    ],
  ])('%s switch', (_label, toolId, turnOff, turnOn) => {
    // The header menu's tools (what the Actions menu lists); the panel keeps resolving all of them.
    async function inventory() {
      getEntriesForShowMock.mockResolvedValue({ data: [], error: null });
      renderPage();
      await screen.findByTestId('show-desk-panel');
      const menu = usePageEditTargetStore.getState().showTools?.tools ?? [];
      return menu.map(tool => tool.id);
    }

    it('off hides only its row', async () => {
      turnOff();
      const rows = await inventory();
      expect(rows).not.toContain(toolId);
      expect(rows).toHaveLength(9);
      // A deep link still opens it: the panel is handed the full list.
      expect(screen.getByTestId('panel-tool-ids')).toHaveTextContent(toolId);
    });

    it('on keeps its row', async () => {
      turnOn();
      const rows = await inventory();
      expect(rows).toContain(toolId);
      expect(rows).toHaveLength(10);
    });
  });

  // MYK9-954: the sheet used to hold eleven tools. Eight stay, in two groups;
  // three moved to where the work happens, each with its own test there:
  //   add-entries   -> Entries "Add Entry" (EntryManagementPage.manageGate.test.tsx)
  //   show-closeout -> Results step 3 "Close the show" (ShowResultsSection.test.tsx)
  //   schedule-slip -> the class's expected-start change (SecretaryCockpitFocusedClass.test.tsx)
  it('sends a retired ?tool=people-at-show link to the Check-in desk, keeping the not-checked-in view', async () => {
    renderPage(undefined, '/shows/show-1/show-day?tool=people-at-show&view=needs-check-in');

    expect(await screen.findByTestId('entries-location')).toHaveTextContent(
      '/shows/show-1/entries?tab=exceptions&exception=check-in&checkin=pending'
    );
  });

  it('offers a Check-in desk door in the Show Desk Actions menu (MYK9-1690)', async () => {
    getEntriesForShowMock.mockResolvedValue({ data: [], error: null });

    renderPage();

    expect(await screen.findByTestId('show-desk-panel')).toBeInTheDocument();
    const door = usePageEditTargetStore
      .getState()
      .showTools?.tools.find(tool => tool.id === 'check-in-desk');
    expect(door).toEqual({
      id: 'check-in-desk',
      group: 'show-day',
      title: 'Check-in desk',
      href: getCheckInDeskHref({ showId: 'show-1' }),
    });
  });

  it('keeps exactly nine tools in two groups, in sheet order', async () => {
    getEntriesForShowMock.mockResolvedValue({ data: [], error: null });

    renderPage();

    expect(await screen.findByTestId('show-desk-panel')).toBeInTheDocument();
    const inventory = within(screen.getByTestId('tool-inventory'))
      .getAllByRole('listitem')
      .map(item => item.textContent);
    expect(inventory).toEqual([
      'show-day:check-in-desk',
      'show-day:self-checkin',
      'show-day:access-codes',
      'show-day:emergency-trial-packet',
      'show-day:message-exhibitors',
      'show-logistics:volunteers',
      'show-logistics:lunch-orders',
      'show-logistics:judge-supplies',
      'show-logistics:tasks-notes',
      'show-logistics:incident-log',
    ]);
  });

  it('offers Message exhibitors as a door to this show in the Message Center (MYK9-1727)', async () => {
    getEntriesForShowMock.mockResolvedValue({ data: [], error: null });
    renderPage();

    expect(await screen.findByTestId('show-desk-panel')).toBeInTheDocument();
    const row = within(screen.getByTestId('tool-inventory'))
      .getAllByRole('listitem')
      .find(item => item.textContent === 'show-day:message-exhibitors');
    expect(row).toHaveAttribute('data-href', '/secretary/messages?showId=show-1');
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

  it('rejects the Check-in cell re-read when it fails, so the cell keeps the status just written (MYK9-1803)', async () => {
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
      'trial-1': [{ id: 'class-1', element: 'Container', level: 'Novice', status: 'Scheduled' }],
    };
    getEntriesForShowMock.mockResolvedValue({ data: null, error: new Error('Refresh failed') });

    renderPage([{ id: 'entry-1', show_id: 'show-1', class_id: 'class-1', is_scored: false }]);
    fireEvent.click(await screen.findByTestId('panel-refresh-entries'));

    await waitFor(() => expect(refreshOutcomes).toEqual(['rejected']));
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
    expect(usePageEditTargetStore.getState().showTools).toBeNull();
    expect(screen.queryByText(/Show-day work has not started/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try schedule again' }));

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
    // primary nav. "Open volunteer scheduling" routes into a
    // `ProtectedRoute(SECRETARY | SITE_ADMIN)` path (`/secretary/volunteers`)
    // and was enabled, so a click landed on a chrome-less "You don't have
    // permission" wall. The two add-entry doors that carried the same gate moved
    // to Entries with MYK9-954 and are tested there.
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

      // The generic form of the bug, not a named button: nothing the viewer can
      // actually press may lead somewhere they will be refused.
      const enabledSecretaryLinks = screen
        .queryAllByRole('link')
        .filter(link => !link.hasAttribute('aria-disabled'))
        .map(link => link.getAttribute('href') ?? '')
        .filter(href => href.startsWith('/secretary/'));
      expect(enabledSecretaryLinks).toEqual([]);

      expect(screen.getByRole('button', { name: /open volunteer scheduling/i })).toBeDisabled();
    });

    it('says why, in the same sentence the Actions menu uses', async () => {
      renderPage();
      expect(await screen.findByTestId('show-desk-panel')).toBeInTheDocument();

      expect(screen.getAllByText('Trial secretary access only')).toHaveLength(1);
    });
  });

  describe('a trial secretary — the positive control', () => {
    beforeEach(() => {
      getEntriesForShowMock.mockResolvedValue({ data: [], error: null });
    });

    it('gets volunteer scheduling live', async () => {
      renderPage();
      expect(await screen.findByTestId('show-desk-panel')).toBeInTheDocument();

      expect(screen.getByRole('link', { name: /open volunteer scheduling/i })).toHaveAttribute(
        'href',
        expect.stringContaining('/secretary/volunteers')
      );
      expect(screen.queryByText('Trial secretary access only')).toBeNull();
    });
  });

  // MYK9-1597: the header Actions trigger count is the sum of the row badges, on the rendered menu.
  describe('Show Desk Actions trigger and row badges', () => {
    const incident = (id: string, severity: string) => ({
      id,
      severity,
      occurred_at: '2026-05-19T14:30:00.000Z',
    });

    async function openMenu() {
      getEntriesForShowMock.mockResolvedValue({ data: [], error: null });
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/shows/show-1/show-day']}>
            <HeaderActions />
            <Routes>
              <Route path="/shows/:id/show-day" element={<ShowWorkbenchShowDeskPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );
      await screen.findByTestId('show-desk-panel');
      await userEvent.click(await screen.findByTestId('header-actions-trigger'));
      await screen.findByTestId('header-action-show-tool-tasks-notes');
    }

    const rowBadges = () =>
      ['tasks-notes', 'incident-log'].map(id => {
        const row = screen.getByTestId(`header-action-show-tool-${id}`);
        return (
          within(row).queryByTestId(`header-action-show-tool-${id}-badge`)?.textContent ?? null
        );
      });

    it('marks the Tasks and notes row with the same count the trigger shows', async () => {
      deskSignals.tasks = [{ id: 't1', status: 'todo' }];
      await openMenu();
      await waitFor(() =>
        expect(screen.getByTestId('header-actions-badge')).toHaveTextContent(
          '1 item needs attention'
        )
      );
      expect(rowBadges()).toEqual(['1 open', null]);
    });

    it('keeps the trigger count equal to the sum of the row badges across incidents and tasks', async () => {
      deskSignals.incidents = [incident('i1', 'reportable'), incident('i2', 'reportable')];
      deskSignals.tasks = [
        { id: 't1', status: 'todo' },
        { id: 't2', status: 'todo' },
        { id: 't3', status: 'done' },
      ];
      await openMenu();
      await waitFor(() =>
        expect(screen.getByTestId('header-actions-badge')).toHaveTextContent(
          '4 items need attention'
        )
      );
      const [tasks, incidents] = rowBadges();
      const sum = [tasks, incidents].reduce((n, text) => n + Number.parseInt(text ?? '0', 10), 0);
      expect(tasks).toBe('2 open');
      expect(incidents).toBe('2 reportable');
      expect(sum).toBe(4);
      expect(screen.getByTestId('header-actions-badge')).toHaveAttribute('data-tone', 'urgent');
    });

    it('draws the tasks badge calm and gives a lone open task a routine trigger', async () => {
      deskSignals.tasks = [{ id: 't1', status: 'todo' }];
      await openMenu();
      await waitFor(() =>
        expect(screen.getByTestId('header-actions-badge')).toHaveAttribute('data-tone', 'routine')
      );
      expect(screen.getByTestId('header-action-show-tool-tasks-notes-badge')).not.toHaveClass(
        'bg-destructive'
      );
    });

    it('puts no badge on the Tasks row when nothing is open, and none when tasks are unread', async () => {
      deskSignals.tasks = [{ id: 't1', status: 'done' }];
      await openMenu();
      expect(rowBadges()).toEqual([null, null]);
    });

    it('keeps the incomplete trigger and no task badge when the tasks read is unknown', async () => {
      deskSignals.tasks = undefined;
      deskSignals.incidents = [incident('i1', 'reportable')];
      await openMenu();
      await waitFor(() =>
        expect(screen.getByTestId('header-actions-badge')).toHaveTextContent(
          '1 item needs attention, and some could not be checked'
        )
      );
      expect(rowBadges()).toEqual([null, '1 reportable']);
    });
  });
});
