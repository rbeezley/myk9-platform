import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowseShowsPage } from '@/pages/BrowseShowsPage';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useShowStore } from '@/store/showStore';
import { useEntryStore } from '@/store/entryStore';
import { UserRole, PERMISSIONS } from '@/types/auth-types';
import type { UserWithRoles } from '@/types/auth-types';
import type { Show } from '@/types/show-types';
import type { SyncableShowEntry } from '@/store/entryStore';

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

// Test data factory
const createShow = (overrides: Partial<Show> = {}): Show => ({
  id: `show-${Math.random()}`,
  name: 'Test Show',
  type: 'Agility',
  startDate: new Date(Date.now() + 86400000).toISOString(),
  endDate: new Date(Date.now() + 172800000).toISOString(),
  location: 'Test Location',
  status: 'Upcoming',
  events: ['Agility'],
  source: 'myK9Show',
  entryOpenDate: new Date().toISOString(),
  entryCloseDate: new Date(Date.now() + 43200000).toISOString(),
  preEntryFee: '$25',
  dayOfShowFee: '$35',
  clubId: 'club-1',
  clubName: 'Test Club',
  clubAddress: 'Test Address',
  clubEmail: 'test@club.com',
  chairman: 'chairman-1',
  secretary: 'secretary-1',
  chiefSteward: 'steward-1',
  assignedJudges: [],
  stats: [],
  trials: [],
  ...overrides
});

const createEntry = (showId: string, userId: string): SyncableShowEntry => ({
  id: `entry-${Math.random()}`,
  showId,
  userId,
  dogId: 'dog-1',
  classes: ['Open A'],
  status: 'confirmed',
  paymentStatus: 'paid',
  paymentMethod: 'credit_card',
  totalAmount: 25,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  confirmationNumber: 'CONF123',
  lastSyncAt: new Date().toISOString(),
  localChanges: [],
  conflictStatus: 'none'
});

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('Role-Based Filtering Integration Tests', () => {
  const upcomingShow1 = createShow({ 
    id: 'show-upcoming-1', 
    name: 'Spring Agility Trial',
    secretary: 'secretary-1' 
  });
  
  const upcomingShow2 = createShow({ 
    id: 'show-upcoming-2', 
    name: 'Summer Obedience Trial',
    secretary: 'secretary-2',
    assignedJudges: [{
      judgeId: 'judge-1',
      assignedDate: new Date().toISOString(),
      breed: 'All Breeds'
    }]
  });
  
  const pastShow = createShow({ 
    id: 'show-past-1',
    name: 'Winter Rally Trial',
    startDate: new Date(Date.now() - 172800000).toISOString(),
    endDate: new Date(Date.now() - 86400000).toISOString(),
    status: 'Completed'
  });

  const draftShow = createShow({
    id: 'show-draft-1',
    name: 'Planning Show',
    status: 'Draft'
  });

  const allShows = [upcomingShow1, upcomingShow2, pastShow, draftShow];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default store mocks
    (useShowStore as ReturnType<typeof vi.fn>).mockReturnValue({
      shows: allShows,
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

  describe('Guest User Filtering', () => {
    beforeEach(() => {
      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        userWithRoles: null,
        loading: false
      });
    });

    it('should filter out draft shows for guests', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        const showCards = screen.queryAllByTestId(/show-card/i);
        expect(showCards).toHaveLength(2); // Only upcoming shows visible
        
        expect(screen.getByText('Spring Agility Trial')).toBeInTheDocument();
        expect(screen.getByText('Summer Obedience Trial')).toBeInTheDocument();
        expect(screen.queryByText('Planning Show')).not.toBeInTheDocument();
      });
    });

    it('should show past shows in Past Shows tab for guests', async () => {
      renderWithProviders(<BrowseShowsPage />);

      const pastTab = await screen.findByRole('tab', { name: /past shows/i });
      fireEvent.click(pastTab);

      await waitFor(() => {
        expect(screen.getByText('Winter Rally Trial')).toBeInTheDocument();
        expect(screen.queryByText('Spring Agility Trial')).not.toBeInTheDocument();
      });
    });
  });

  describe('Exhibitor Filtering', () => {
    const exhibitorUser: UserWithRoles = {
      id: 'exhibitor-1',
      email: 'exhibitor@test.com',
      firstName: 'Test',
      lastName: 'Exhibitor',
      roles: [UserRole.EXHIBITOR],
      permissions: []
    };

    beforeEach(() => {
      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        userWithRoles: exhibitorUser,
        loading: false
      });
    });

    it('should show only entered shows in My Entries tab', async () => {
      const entries = [
        createEntry('show-upcoming-1', 'exhibitor-1'),
        createEntry('show-past-1', 'exhibitor-1')
      ];

      (useEntryStore as ReturnType<typeof vi.fn>).mockReturnValue({
        entries,
        isLoading: false,
        error: null,
        loadEntries: vi.fn()
      });

      renderWithProviders(<BrowseShowsPage />);

      const entriesTab = await screen.findByRole('tab', { name: /my entries/i });
      fireEvent.click(entriesTab);

      await waitFor(() => {
        const showCards = screen.queryAllByTestId(/show-card/i);
        expect(showCards).toHaveLength(2);
        
        expect(screen.getByText('Spring Agility Trial')).toBeInTheDocument();
        expect(screen.getByText('Winter Rally Trial')).toBeInTheDocument();
        expect(screen.queryByText('Summer Obedience Trial')).not.toBeInTheDocument();
      });
    });

    it('should show register button for upcoming shows not entered', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        const showCard = screen.getByText('Summer Obedience Trial').closest('[data-testid*="show-card"]');
        const registerButton = within(showCard!).getByRole('button', { name: /register/i });
        expect(registerButton).toBeInTheDocument();
      });
    });
  });

  describe('Secretary Filtering', () => {
    const secretaryUser: UserWithRoles = {
      id: 'secretary-1',
      email: 'secretary@test.com',
      firstName: 'Test',
      lastName: 'Secretary',
      roles: [UserRole.SECRETARY],
      permissions: [
        PERMISSIONS.SHOW_CREATE,
        PERMISSIONS.SHOW_UPDATE,
        PERMISSIONS.SHOW_MANAGE_ENTRIES
      ]
    };

    beforeEach(() => {
      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        userWithRoles: secretaryUser,
        loading: false
      });
    });

    it('should show only managed shows in Managing tab', async () => {
      renderWithProviders(<BrowseShowsPage />);

      const managingTab = await screen.findByRole('tab', { name: /managing/i });
      fireEvent.click(managingTab);

      await waitFor(() => {
        const showCards = screen.queryAllByTestId(/show-card/i);
        expect(showCards).toHaveLength(1);
        
        expect(screen.getByText('Spring Agility Trial')).toBeInTheDocument();
        expect(screen.queryByText('Summer Obedience Trial')).not.toBeInTheDocument();
      });
    });

    it('should show management actions for managed shows', async () => {
      renderWithProviders(<BrowseShowsPage />);

      const managingTab = await screen.findByRole('tab', { name: /managing/i });
      fireEvent.click(managingTab);

      await waitFor(() => {
        const showCard = screen.getByText('Spring Agility Trial').closest('[data-testid*="show-card"]');
        
        expect(within(showCard!).getByRole('button', { name: /edit show/i })).toBeInTheDocument();
        expect(within(showCard!).getByRole('button', { name: /manage entries/i })).toBeInTheDocument();
      });
    });

    it('should show Create Show button in All Shows tab', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create show/i })).toBeInTheDocument();
      });
    });
  });

  describe('Judge Filtering', () => {
    const judgeUser: UserWithRoles = {
      id: 'judge-1',
      email: 'judge@test.com',
      firstName: 'Test',
      lastName: 'Judge',
      roles: [UserRole.JUDGE],
      permissions: [
        PERMISSIONS.JUDGE_VIEW_ASSIGNMENTS,
        PERMISSIONS.JUDGE_ENTER_RESULTS
      ]
    };

    beforeEach(() => {
      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        userWithRoles: judgeUser,
        loading: false
      });
    });

    it('should show only assigned shows in My Assignments tab', async () => {
      renderWithProviders(<BrowseShowsPage />);

      const assignmentsTab = await screen.findByRole('tab', { name: /my assignments/i });
      fireEvent.click(assignmentsTab);

      await waitFor(() => {
        const showCards = screen.queryAllByTestId(/show-card/i);
        expect(showCards).toHaveLength(1);
        
        expect(screen.getByText('Summer Obedience Trial')).toBeInTheDocument();
        expect(screen.queryByText('Spring Agility Trial')).not.toBeInTheDocument();
      });
    });

    it('should show judge-specific actions for assignments', async () => {
      renderWithProviders(<BrowseShowsPage />);

      const assignmentsTab = await screen.findByRole('tab', { name: /my assignments/i });
      fireEvent.click(assignmentsTab);

      await waitFor(() => {
        const showCard = screen.getByText('Summer Obedience Trial').closest('[data-testid*="show-card"]');
        
        expect(within(showCard!).getByRole('button', { name: /assignment details/i })).toBeInTheDocument();
        expect(within(showCard!).getByRole('button', { name: /enter results/i })).toBeInTheDocument();
      });
    });
  });

  describe('Site Admin Filtering', () => {
    const adminUser: UserWithRoles = {
      id: 'admin-1',
      email: 'admin@test.com',
      firstName: 'Test',
      lastName: 'Admin',
      roles: [UserRole.SITE_ADMIN],
      permissions: [
        PERMISSIONS.SHOW_CREATE,
        PERMISSIONS.SHOW_UPDATE,
        PERMISSIONS.SHOW_DELETE,
        PERMISSIONS.SHOW_MANAGE_ENTRIES
      ]
    };

    beforeEach(() => {
      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        userWithRoles: adminUser,
        loading: false
      });
    });

    it('should show all shows including drafts for site admins', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        const showCards = screen.queryAllByTestId(/show-card/i);
        expect(showCards).toHaveLength(3); // All except past shows in All Shows tab
        
        expect(screen.getByText('Spring Agility Trial')).toBeInTheDocument();
        expect(screen.getByText('Summer Obedience Trial')).toBeInTheDocument();
        expect(screen.getByText('Planning Show')).toBeInTheDocument();
      });
    });

    it('should show all shows in Managing tab for site admins', async () => {
      renderWithProviders(<BrowseShowsPage />);

      const managingTab = await screen.findByRole('tab', { name: /managing/i });
      fireEvent.click(managingTab);

      await waitFor(() => {
        const showCards = screen.queryAllByTestId(/show-card/i);
        expect(showCards).toHaveLength(4); // All shows visible to admin
      });
    });

    it('should show delete action for site admins', async () => {
      renderWithProviders(<BrowseShowsPage />);

      const managingTab = await screen.findByRole('tab', { name: /managing/i });
      fireEvent.click(managingTab);

      await waitFor(() => {
        const showCard = screen.getByText('Spring Agility Trial').closest('[data-testid*="show-card"]');
        
        // Check for three-dot menu that contains delete action
        const menuButton = within(showCard!).getByRole('button', { name: /more options/i });
        expect(menuButton).toBeInTheDocument();
      });
    });
  });

  describe('Multi-Role User Filtering', () => {
    it('should combine permissions for secretary + judge', async () => {
      const multiRoleUser: UserWithRoles = {
        id: 'multi-1',
        email: 'multi@test.com',
        firstName: 'Multi',
        lastName: 'User',
        roles: [UserRole.SECRETARY, UserRole.JUDGE],
        permissions: [
          PERMISSIONS.SHOW_CREATE,
          PERMISSIONS.SHOW_UPDATE,
          PERMISSIONS.SHOW_MANAGE_ENTRIES,
          PERMISSIONS.JUDGE_VIEW_ASSIGNMENTS,
          PERMISSIONS.JUDGE_ENTER_RESULTS
        ]
      };

      // Update shows to include multi-role user
      const showsWithMultiRole = [...allShows];
      showsWithMultiRole[1] = {
        ...showsWithMultiRole[1],
        assignedJudges: [{
          judgeId: 'multi-1',
          assignedDate: new Date().toISOString(),
          breed: 'All Breeds'
        }]
      };
      showsWithMultiRole[2] = {
        ...showsWithMultiRole[2],
        secretary: 'multi-1'
      };

      (useShowStore as ReturnType<typeof vi.fn>).mockReturnValue({
        shows: showsWithMultiRole,
        isLoading: false,
        error: null,
        loadShows: vi.fn()
      });

      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        userWithRoles: multiRoleUser,
        loading: false
      });

      renderWithProviders(<BrowseShowsPage />);

      // Check Managing tab
      const managingTab = await screen.findByRole('tab', { name: /managing/i });
      fireEvent.click(managingTab);

      await waitFor(() => {
        expect(screen.getByText('Winter Rally Trial')).toBeInTheDocument();
      });

      // Check Assignments tab
      const assignmentsTab = await screen.findByRole('tab', { name: /my assignments/i });
      fireEvent.click(assignmentsTab);

      await waitFor(() => {
        expect(screen.getByText('Summer Obedience Trial')).toBeInTheDocument();
      });
    });
  });

  describe('Filter Persistence Across Tabs', () => {
    beforeEach(() => {
      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        userWithRoles: {
          id: 'user-1',
          email: 'user@test.com',
          firstName: 'Test',
          lastName: 'User',
          roles: [UserRole.SECRETARY],
          permissions: []
        },
        loading: false
      });
    });

    it('should maintain search filter when switching tabs', async () => {
      renderWithProviders(<BrowseShowsPage />);

      // Apply search filter
      const searchInput = await screen.findByPlaceholderText(/search shows/i);
      fireEvent.change(searchInput, { target: { value: 'Agility' } });

      await waitFor(() => {
        expect(screen.getByText('Spring Agility Trial')).toBeInTheDocument();
        expect(screen.queryByText('Summer Obedience Trial')).not.toBeInTheDocument();
      });

      // Switch to Managing tab
      const managingTab = screen.getByRole('tab', { name: /managing/i });
      fireEvent.click(managingTab);

      // Search should still be active
      await waitFor(() => {
        expect(searchInput).toHaveValue('Agility');
      });
    });
  });
});