import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SecretaryDashboardPage } from '../index';
import { ScopeType } from '@/types/auth-types';

const mockUseMissionControlData = vi.fn();
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
    expect(screen.getByRole('link', { name: /Add Dog/i })).toHaveAttribute(
      'href',
      '/dogs?add=true'
    );
    expect(screen.getByRole('link', { name: /Add Person/i })).toHaveAttribute(
      'href',
      '/people?add=true'
    );
    const quickLinks = screen.getByRole('navigation', { name: /Dashboard quick links/i });
    expect(quickLinks).toBeInTheDocument();
    expect(quickLinks.querySelector('[data-testid="dashboard-quick-links-row"]')).toHaveClass(
      'grid-cols-3'
    );
    expect(screen.queryByText('Open dogs')).not.toBeInTheDocument();
    expect(screen.queryByText('Open people')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New Show/i })).not.toBeInTheDocument();
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
    expect(screen.getByText('1 entry pending review')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /1 entry pending review/i })).toHaveAttribute(
      'href',
      '/shows/managed-show/entry-management?entryTab=pending'
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
});
