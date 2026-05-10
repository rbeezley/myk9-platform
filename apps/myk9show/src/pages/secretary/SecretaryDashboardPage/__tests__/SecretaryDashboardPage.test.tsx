import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SecretaryDashboardPage } from '../index';
import { ScopeType } from '@/types/auth-types';

const mockUseMissionControlData = vi.fn();
const mockUseShowStore = vi.fn();

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
  useShowStore: () => mockUseShowStore(),
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
  usePendingEntries: () => ({ data: [] }),
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
    mockUseShowStore.mockReturnValue({ shows: [] });
    mockUseMissionControlData.mockReturnValue({
      isLoading: false,
      classesByStage: new Map(),
    });
  });

  it('does not show the empty state while post-login show sync is still loading', () => {
    mockUseMissionControlData.mockReturnValue({
      isLoading: true,
      classesByStage: new Map(),
    });

    renderPage();

    expect(screen.getByText('Loading your shows...')).toBeInTheDocument();
    expect(screen.queryByText('No shows yet.')).not.toBeInTheDocument();
  });

  it('shows the empty state after loading finishes with no managed shows', () => {
    renderPage();

    expect(screen.getByText('No shows yet.')).toBeInTheDocument();
  });
});
