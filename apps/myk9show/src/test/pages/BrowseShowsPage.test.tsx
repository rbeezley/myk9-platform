import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowseShowsPage } from '@/pages/BrowseShowsPage';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useShowStore } from '@/store/showStore';
import { useEntryStore } from '@/store/entryStore';
import { UserRole } from '@/types/auth-types';
import type { UserWithRoles } from '@/types/auth-types';
import type { Show } from '@/types/show-types';

// Mock dependencies
vi.mock('@/hooks/useAuthContext');
vi.mock('@/store/showStore');
vi.mock('@/store/entryStore');
vi.mock('@/services/NotificationService', () => ({
  useStatusUpdates: () => ({ subscribe: vi.fn(), unsubscribe: vi.fn() })
}));
vi.mock('@/hooks/useRealTimeUpdates', () => ({
  useRealTimeUpdates: () => ({ subscribe: vi.fn(), unsubscribe: vi.fn() })
}));
vi.mock('@/services/AuditService', () => ({
  auditService: {
    logAction: vi.fn()
  }
}));

// Test data
const mockShows: Show[] = [
  {
    id: 'show-1',
    name: 'Spring Agility Trial',
    type: 'Agility',
    startDate: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
    endDate: new Date(Date.now() + 172800000).toISOString(),
    location: 'Test Location 1',
    status: 'Upcoming',
    events: ['Agility'],
    source: 'myK9Show',
    entryOpenDate: new Date().toISOString(),
    entryCloseDate: new Date(Date.now() + 43200000).toISOString(),
    preEntryFee: '$25',
    dayOfShowFee: '$35',
    clubId: 'club-1',
    clubName: 'Test Club 1',
    clubAddress: 'Test Address 1',
    clubEmail: 'test1@club.com',
    chairman: 'chairman-1',
    secretary: 'secretary-1',
    chiefSteward: 'steward-1',
    assignedJudges: [],
    stats: [],
    trials: []
  },
  {
    id: 'show-2',
    name: 'Fall Obedience Trial',
    type: 'Obedience',
    startDate: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
    endDate: new Date(Date.now() - 86400000).toISOString(),
    location: 'Test Location 2',
    status: 'Completed',
    events: ['Obedience'],
    source: 'myK9Show',
    entryOpenDate: new Date(Date.now() - 604800000).toISOString(),
    entryCloseDate: new Date(Date.now() - 259200000).toISOString(),
    preEntryFee: '$30',
    dayOfShowFee: '$40',
    clubId: 'club-2',
    clubName: 'Test Club 2',
    clubAddress: 'Test Address 2',
    clubEmail: 'test2@club.com',
    chairman: 'chairman-2',
    secretary: 'secretary-2',
    chiefSteward: 'steward-2',
    assignedJudges: [],
    stats: [],
    trials: []
  }
];

// Test utilities
const createMockUser = (role: UserRole, id: string = 'test-user'): UserWithRoles => ({
  id,
  email: `${role}@test.com`,
  firstName: 'Test',
  lastName: 'User',
  roles: [role],
  permissions: []
});

const renderWithProviders = (ui: React.ReactElement, { route = '/browse-shows' } = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('BrowseShowsPage - Tab Rendering Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default store mocks
    (useShowStore as ReturnType<typeof vi.fn>).mockReturnValue({
      shows: mockShows,
      isLoading: false,
      error: null,
      loadShows: vi.fn()
    });
    
    (useEntryStore as ReturnType<typeof vi.fn>).mockReturnValue({
      entries: [],
      isLoading: false,
      error: null,
      loadEntries: vi.fn()
    });
  });

  describe('Guest User Tab Rendering', () => {
    beforeEach(() => {
      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        userWithRoles: null,
        loading: false
      });
    });

    it('should render only All Shows and Past Shows tabs for guests', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /all shows/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /past shows/i })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /my entries/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /managing/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /my assignments/i })).not.toBeInTheDocument();
      });
    });

    it('should not show Create Show button for guests', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /create show/i })).not.toBeInTheDocument();
      });
    });
  });

  describe('Exhibitor Tab Rendering', () => {
    beforeEach(() => {
      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        userWithRoles: createMockUser(UserRole.EXHIBITOR),
        loading: false
      });
    });

    it('should render base tabs plus My Entries for exhibitors', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /all shows/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /past shows/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /my entries/i })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /managing/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /my assignments/i })).not.toBeInTheDocument();
      });
    });

    it('should not show Create Show button for exhibitors', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /create show/i })).not.toBeInTheDocument();
      });
    });
  });

  describe('Secretary Tab Rendering', () => {
    const secretaryUser = createMockUser(UserRole.SECRETARY, 'secretary-1');

    beforeEach(() => {
      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        userWithRoles: secretaryUser,
        loading: false
      });
    });

    it('should render all base tabs plus Managing tab for secretaries', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /all shows/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /past shows/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /my entries/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /managing/i })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /my assignments/i })).not.toBeInTheDocument();
      });
    });

    it('should show Create Show button for secretaries', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        const createButton = screen.getByRole('button', { name: /create show/i });
        expect(createButton).toBeInTheDocument();
      });
    });

    it('should show correct tab counts', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        // Check that Managing tab shows count of shows user is secretary for
        const managingTab = screen.getByRole('tab', { name: /managing/i });
        expect(managingTab.textContent).toContain('1'); // secretary-1 manages show-1
      });
    });
  });

  describe('Judge Tab Rendering', () => {
    const judgeUser = createMockUser(UserRole.JUDGE, 'judge-1');

    beforeEach(() => {
      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        userWithRoles: judgeUser,
        loading: false
      });
      
      // Update mock shows to include judge assignment
      const showsWithJudge = [...mockShows];
      showsWithJudge[0].assignedJudges = [{
        judgeId: 'judge-1',
        assignedDate: new Date().toISOString(),
        breed: 'All Breeds'
      }];
      
      (useShowStore as ReturnType<typeof vi.fn>).mockReturnValue({
        shows: showsWithJudge,
        isLoading: false,
        error: null,
        loadShows: vi.fn()
      });
    });

    it('should render all base tabs plus My Assignments for judges', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /all shows/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /past shows/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /my entries/i })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /managing/i })).not.toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /my assignments/i })).toBeInTheDocument();
      });
    });

    it('should show correct assignment count', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        const assignmentsTab = screen.getByRole('tab', { name: /my assignments/i });
        expect(assignmentsTab.textContent).toContain('1'); // judge-1 assigned to show-1
      });
    });
  });

  describe('Site Admin Tab Rendering', () => {
    beforeEach(() => {
      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        userWithRoles: createMockUser(UserRole.SITE_ADMIN),
        loading: false
      });
    });

    it('should render all tabs except My Assignments for site admins', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /all shows/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /past shows/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /my entries/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /managing/i })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /my assignments/i })).not.toBeInTheDocument();
      });
    });

    it('should show all shows in Managing tab for site admins', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        const managingTab = screen.getByRole('tab', { name: /managing/i });
        expect(managingTab.textContent).toContain('2'); // All shows visible to admin
      });
    });
  });

  describe('Multi-Role User Tab Rendering', () => {
    it('should render combined tabs for exhibitor + secretary', async () => {
      const multiRoleUser: UserWithRoles = {
        id: 'multi-user',
        email: 'multi@test.com',
        firstName: 'Multi',
        lastName: 'User',
        roles: [UserRole.EXHIBITOR, UserRole.SECRETARY],
        permissions: []
      };

      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        userWithRoles: multiRoleUser,
        loading: false
      });

      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /all shows/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /past shows/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /my entries/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /managing/i })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /my assignments/i })).not.toBeInTheDocument();
      });
    });

    it('should render all tabs for secretary + judge combination', async () => {
      const multiRoleUser: UserWithRoles = {
        id: 'multi-user',
        email: 'multi@test.com',
        firstName: 'Multi',
        lastName: 'User',
        roles: [UserRole.SECRETARY, UserRole.JUDGE],
        permissions: []
      };

      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        userWithRoles: multiRoleUser,
        loading: false
      });

      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /all shows/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /past shows/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /my entries/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /managing/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /my assignments/i })).toBeInTheDocument();
      });
    });
  });

  describe('Tab Navigation and URL Persistence', () => {
    beforeEach(() => {
      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        userWithRoles: createMockUser(UserRole.SECRETARY),
        loading: false
      });
    });

    it('should update URL when switching tabs', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        const managingTab = screen.getByRole('tab', { name: /managing/i });
        fireEvent.click(managingTab);
      });

      await waitFor(() => {
        expect(window.location.search).toContain('tab=managing');
      });
    });

    it('should persist tab selection on page load', async () => {
      renderWithProviders(<BrowseShowsPage />, { route: '/browse-shows?tab=past' });

      await waitFor(() => {
        const pastTab = screen.getByRole('tab', { name: /past shows/i });
        expect(pastTab).toHaveAttribute('data-state', 'active');
      });
    });

    it('should handle invalid tab in URL gracefully', async () => {
      renderWithProviders(<BrowseShowsPage />, { route: '/browse-shows?tab=invalid' });

      await waitFor(() => {
        const allTab = screen.getByRole('tab', { name: /all shows/i });
        expect(allTab).toHaveAttribute('data-state', 'active');
      });
    });
  });

  describe('Loading and Error States', () => {
    it('should show loading skeleton while data is loading', async () => {
      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        userWithRoles: createMockUser(UserRole.EXHIBITOR),
        loading: true
      });

      renderWithProviders(<BrowseShowsPage />);

      expect(screen.getByTestId('shows-page-skeleton')).toBeInTheDocument();
    });

    it('should show error state when shows fail to load', async () => {
      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        userWithRoles: createMockUser(UserRole.EXHIBITOR),
        loading: false
      });

      (useShowStore as ReturnType<typeof vi.fn>).mockReturnValue({
        shows: [],
        isLoading: false,
        error: new Error('Failed to load shows'),
        loadShows: vi.fn()
      });

      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.getByText(/failed to load shows/i)).toBeInTheDocument();
      });
    });
  });
});