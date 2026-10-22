import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SecretaryDashboardPage } from '../index';
import { ScopeType } from '@/types/auth-types';
import { useTrialStore } from '@/store/trialStore';
import { showFactory } from '@/test/utils/factories';

const mockUseMissionControlData = vi.fn();
let mockEntryCounts: ReadonlyMap<string, number> = new Map();
let mockPendingEntries: Array<{
  id: string;
  showId: string;
  showName: string;
  className: string;
  handlerName: string;
  dogName: string;
  submittedAt: string;
  entry_status: string | null;
  check_in_status: string | null;
}> = [];

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    firstName: 'Sam',
    isAdmin: false,
    hasRole: () => false,
    userWithRoles: {
      scopes: [{ scopeType: ScopeType.CLUB, scopeId: 'club-1' }],
    },
  }),
}));

vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({ shows: [] }),
}));

const mockUseSecretaryTasks = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/queries/useSecretaryTasks', () => ({
  useSecretaryTasks: (...args: unknown[]) => mockUseSecretaryTasks(...args),
  useCreateTask: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateTask: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteTask: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/queries/usePendingEntries', () => ({
  usePendingEntries: () => ({ data: mockPendingEntries }),
}));

const mockUseShowEntryCounts = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/queries/useShowEntryCounts', () => ({
  useShowEntryCounts: (ids: readonly string[]) => mockUseShowEntryCounts(ids),
}));

vi.mock('@/features/pipeline/hooks/useMissionControlData', () => ({
  useMissionControlData: () => mockUseMissionControlData(),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <SecretaryDashboardPage />
    </MemoryRouter>
  );
}

describe('SecretaryDashboardPage', () => {
  beforeEach(() => {
    localStorage.clear();
    mockPendingEntries = [];
    mockEntryCounts = new Map();
    mockUseShowEntryCounts.mockImplementation(() => mockEntryCounts);
    mockUseSecretaryTasks.mockReturnValue({ data: [] });
    mockUseMissionControlData.mockReturnValue({
      shows: [],
      isLoading: false,
      classesByStage: new Map(),
    });
  });

  it("renders TasksTab which queries useSecretaryTasks scoped to personal tasks ('general' filter)", () => {
    renderPage();
    expect(mockUseSecretaryTasks).toHaveBeenCalledWith('general');
  });

  it('does not show the empty state while post-login show sync is still loading', () => {
    mockUseMissionControlData.mockReturnValue({
      shows: [],
      isLoading: true,
      classesByStage: new Map(),
    });

    renderPage();

    expect(screen.getByTestId('my-shows-section-skeleton')).toBeInTheDocument();
    expect(screen.queryByText('No shows yet.')).not.toBeInTheDocument();
  });

  it('shows the empty state after loading finishes with no managed shows', () => {
    renderPage();

    expect(screen.getByText('No shows yet.')).toBeInTheDocument();
  });

  it('renders compact quick links to existing creation surfaces without duplicating the show action', () => {
    renderPage();

    expect(screen.getByRole('link', { name: /Add Show/i })).toHaveAttribute(
      'href',
      '/secretary/create-show/wizard'
    );
    expect(screen.getByRole('button', { name: /Add Entry/i })).toBeDisabled();
    expect(screen.queryByRole('link', { name: /Add Dog/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Add Person/i })).not.toBeInTheDocument();
    const quickLinks = screen.getByRole('navigation', { name: /Dashboard quick links/i });
    expect(quickLinks).toBeInTheDocument();
    expect(quickLinks.querySelector('[data-testid="dashboard-quick-links-row"]')).toHaveClass(
      'grid-cols-2'
    );
    expect(screen.queryByText('Open dogs')).not.toBeInTheDocument();
    expect(screen.queryByText('Open people')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add Show/i })).not.toBeInTheDocument();
  });

  it('only surfaces pending-entry attention for shows the secretary manages', () => {
    mockUseMissionControlData.mockReturnValue({
      shows: [
        {
          id: 'managed-show',
          name: 'Managed Show',
          clubId: 'club-1',
          startDate: '2026-06-12',
          endDate: '2026-06-14',
          entryCloseDate: '2026-06-05',
          status: 'published',
        },
      ],
      isLoading: false,
      classesByStage: new Map(),
    });
    mockPendingEntries = [
      {
        id: 'entry-1',
        showId: 'managed-show',
        showName: 'Managed Show',
        className: 'Container Novice A',
        handlerName: 'Ada Handler',
        dogName: 'Ace',
        submittedAt: '2026-05-11T12:00:00Z',
        entry_status: 'submitted',
        check_in_status: null,
      },
      {
        id: 'entry-paid',
        showId: 'managed-show',
        showName: 'Managed Show',
        className: 'Container Advanced A',
        handlerName: 'Cyd Handler',
        dogName: 'Copper',
        submittedAt: '2026-05-11T12:02:00Z',
        entry_status: 'paid',
        check_in_status: null,
      },
      {
        id: 'entry-2',
        showId: 'other-show',
        showName: 'Other Club Show',
        className: 'Interior Novice A',
        handlerName: 'Bea Handler',
        dogName: 'Bravo',
        submittedAt: '2026-05-11T12:01:00Z',
        entry_status: 'submitted',
        check_in_status: null,
      },
    ];

    renderPage();

    expect(screen.getByText('Managing 1 show')).toBeInTheDocument();
    expect(screen.getByText('2 pending entries')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /2 pending entries/i })).toHaveAttribute(
      'href',
      '/shows/managed-show/entries?mode=review&attention=pending'
    );
    expect(screen.getAllByText('Managed Show').length).toBeGreaterThan(0);
    expect(screen.queryByText('Other Club Show')).not.toBeInTheDocument();
  });

  // D5 structural lock-in: pin the post-refocus dashboard shape. If a future PR
  // accidentally re-introduces a tab bar, a MessagesTab, a per-show task filter,
  // or any other surface the dashboard-refocus plan deliberately removed, this
  // test fails and forces the contributor to either revert or update the plan.
  // See docs/plan-dashboard-refocus.md phase D5.
  it('renders the post-refocus structure: header + greeting + Personal tasks section, no tab bar, no Messages surface', () => {
    renderPage();

    // Header + greeting are present.
    expect(screen.getByText(/Good (morning|afternoon|evening)/i)).toBeInTheDocument();
    expect(screen.getByText(/Sam/)).toBeInTheDocument();

    // Personal Tasks section header is present (was previously a tab; D3b
    // collapsed it to an inline section).
    expect(screen.getByRole('heading', { name: /Personal tasks/i })).toBeInTheDocument();

    // No tab bar — D3b removed activeTab + the Tasks/Messages tab bar.
    // The dashboard no longer renders elements with role="tab".
    expect(screen.queryAllByRole('tab')).toHaveLength(0);

    // No Messages tab content / heading — Messages moved to /secretary/messages
    // in D3a/D3b. The dashboard should not render any "Messages" heading.
    expect(screen.queryByRole('heading', { name: /messages/i })).not.toBeInTheDocument();

    // No FilterChips remnants from the per-show task filter (D2) or the
    // per-show message filter (D3b). FilterChips.tsx itself is deleted in D5.
    expect(screen.queryByText('All Shows')).not.toBeInTheDocument();
  });

  it('gives two same-named Today shows their own date range, venue and class counts', () => {
    const dayKey = (offset: number) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return [d.getFullYear(), d.getMonth() + 1, d.getDate()]
        .map((n, idx) => String(n).padStart(idx === 0 ? 4 : 2, '0'))
        .join('-');
    };
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const showA = showFactory.build({
      id: 'show-a',
      name: 'Heartland Scent Work Week',
      startDate: dayKey(-1),
      endDate: dayKey(1),
      location: 'Des Moines, IA',
      status: 'in_progress',
    });
    const showB = showFactory.build({
      id: 'show-b',
      name: 'Heartland Scent Work Week',
      startDate: dayKey(0),
      endDate: dayKey(2),
      location: 'Omaha, NE',
      status: 'in_progress',
    });
    mockUseMissionControlData.mockReturnValue({ shows: [showA, showB], isLoading: false });
    const prior = useTrialStore.getState();
    useTrialStore.setState({
      trials: [
        { id: 'ta', showId: 'show-a', trialDate: dayKey(0), timezone },
        { id: 'tb', showId: 'show-b', trialDate: dayKey(0), timezone },
      ] as unknown as typeof prior.trials,
      trialClasses: {
        ta: [{ id: 'a1', status: 'in_progress' }],
        tb: [
          { id: 'b1', status: 'upcoming' },
          { id: 'b2', status: 'upcoming' },
          { id: 'b3', status: 'completed', isScoringFinalized: true },
        ],
      } as unknown as typeof prior.trialClasses,
    });

    try {
      renderPage();

      const cardFor = (venue: string) => screen.getByText(new RegExp(venue)).closest('div')!;
      const cardA = cardFor('Des Moines, IA');
      const cardB = cardFor('Omaha, NE');
      expect(cardA).not.toBe(cardB);
      expect(cardA).toHaveTextContent('1 live · 0 not started · 0 closed');
      expect(cardB).toHaveTextContent('0 live · 2 not started · 1 closed');
      expect(cardA).toHaveTextContent(/\d{4} · Des Moines, IA/);
      expect(cardB).toHaveTextContent(/\d{4} · Omaha, NE/);
    } finally {
      useTrialStore.setState({ trials: prior.trials, trialClasses: prior.trialClasses });
    }
  });

  it("shows each card its own show's real entry count and none for a show with no answer", () => {
    const upcomingStart = new Date(Date.now() + 14 * 86_400_000).toISOString().split('T')[0];
    const counted = showFactory.build({
      id: 'show-counted',
      name: 'Counted Show',
      startDate: upcomingStart,
      endDate: upcomingStart,
      status: 'published',
    });
    const unknown = showFactory.build({
      id: 'show-unknown',
      name: 'Unknown Show',
      startDate: upcomingStart,
      endDate: upcomingStart,
      status: 'published',
    });
    mockUseMissionControlData.mockReturnValue({ shows: [counted, unknown], isLoading: false });
    mockEntryCounts = new Map([['show-counted', 5]]);

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Upcoming/ }));

    expect(mockUseShowEntryCounts).toHaveBeenCalledWith(
      expect.arrayContaining(['show-counted', 'show-unknown'])
    );
    const lines = screen.getAllByTestId('show-card-entry-count');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveTextContent('5 entries');
    expect(screen.queryByText(/^0 entries$/)).not.toBeInTheDocument();
  });
});
