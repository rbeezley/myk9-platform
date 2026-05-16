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

vi.mock('@/store/messageStore', () => ({
  useMessageStore: (selector: (state: { unreadCount: number }) => unknown) =>
    selector({ unreadCount: 0 }),
}));

vi.mock('@/hooks/queries/useSecretaryTasks', () => ({
  useSecretaryTasks: () => ({ data: [] }),
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
    mockPendingEntries = [];
    mockUseMissionControlData.mockReturnValue({
      shows: [],
      isLoading: false,
      classesByStage: new Map(),
    });
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
    expect(screen.getAllByText('Managed Show').length).toBeGreaterThan(0);
    expect(screen.queryByText('Other Club Show')).not.toBeInTheDocument();
  });
});
