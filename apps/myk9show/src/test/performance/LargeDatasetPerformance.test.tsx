import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowseShowsPage } from '@/pages/BrowseShowsPage';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useShowStore } from '@/store/showStore';
import { useEntryStore } from '@/store/entryStore';
import { UserRole } from '@/types/auth-types';
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

// Performance measurement utilities
class PerformanceTracker {
  private marks: Map<string, number> = new Map();
  private measures: Map<string, number> = new Map();

  mark(name: string) {
    this.marks.set(name, performance.now());
  }

  measure(name: string, startMark: string, endMark?: string) {
    const start = this.marks.get(startMark);
    const end = endMark ? this.marks.get(endMark) : performance.now();
    
    if (!start) {
      console.warn(`Start mark ${startMark} not found`);
      return 0;
    }

    const duration = (end || performance.now()) - start;
    this.measures.set(name, duration);
    return duration;
  }

  getMeasure(name: string): number {
    return this.measures.get(name) || 0;
  }

  getReport() {
    const report: Record<string, number> = {};
    this.measures.forEach((value, key) => {
      report[key] = Math.round(value);
    });
    return report;
  }
}

// Generate large datasets
function generateLargeShowDataset(count: number): Show[] {
  const shows: Show[] = [];
  const statuses = ['Upcoming', 'Completed', 'Draft', 'Active'];
  const types = ['Agility', 'Obedience', 'Rally', 'Conformation'];
  const locations = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'];
  
  for (let i = 0; i < count; i++) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + (i % 365) - 180); // Spread across year
    
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + (i % 3) + 1); // 1-3 day shows
    
    shows.push({
      id: `show-${i}`,
      name: `${types[i % types.length]} Trial ${i}`,
      type: types[i % types.length],
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      location: `${locations[i % locations.length]} Venue ${i % 10}`,
      status: statuses[i % statuses.length],
      events: [types[i % types.length]],
      source: 'myK9Show',
      entryOpenDate: new Date(startDate.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      entryCloseDate: new Date(startDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      preEntryFee: `$${25 + (i % 20)}`,
      dayOfShowFee: `$${35 + (i % 20)}`,
      clubId: `club-${i % 50}`,
      clubName: `Test Club ${i % 50}`,
      clubAddress: `${i} Test Street`,
      clubEmail: `club${i % 50}@test.com`,
      chairman: `chairman-${i % 20}`,
      secretary: `secretary-${i % 30}`,
      chiefSteward: `steward-${i % 25}`,
      assignedJudges: i % 5 === 0 ? [{
        judgeId: `judge-${i % 10}`,
        assignedDate: new Date().toISOString(),
        breed: 'All Breeds'
      }] : [],
      stats: [],
      trials: []
    });
  }
  
  return shows;
}

function generateLargeEntryDataset(showCount: number, entryPercentage: number = 0.3): SyncableShowEntry[] {
  const entries: SyncableShowEntry[] = [];
  const entriedShows = Math.floor(showCount * entryPercentage);
  
  for (let i = 0; i < entriedShows; i++) {
    entries.push({
      id: `entry-${i}`,
      showId: `show-${i}`,
      userId: 'test-user',
      dogId: `dog-${i % 5}`,
      classes: ['Open A', 'Open B', 'Novice A'][i % 3].split(','),
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentMethod: 'credit_card',
      totalAmount: 25 + (i % 20),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      confirmationNumber: `CONF${i}`,
      lastSyncAt: new Date().toISOString(),
      localChanges: [],
      conflictStatus: 'none'
    });
  }
  
  return entries;
}

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

describe('Large Dataset Performance Tests', () => {
  const tracker = new PerformanceTracker();

  describe('Initial Render Performance', () => {
    it('should render 100 shows within acceptable time', async () => {
      const shows = generateLargeShowDataset(100);
      
      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        userWithRoles: {
          id: 'test-user',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          roles: [UserRole.EXHIBITOR],
          permissions: []
        },
        loading: false
      });

      (useShowStore as ReturnType<typeof vi.fn>).mockReturnValue({
        shows,
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

      tracker.mark('render-start');
      renderWithProviders(<BrowseShowsPage />);
      
      await waitFor(() => {
        expect(screen.getAllByTestId(/show-card/i)).toHaveLength(expect.any(Number));
      });
      
      const renderTime = tracker.measure('render-100-shows', 'render-start');
      
      // Should render within 500ms
      expect(renderTime).toBeLessThan(500);
      console.log(`Rendered 100 shows in ${renderTime}ms`);
    });

    it('should render 1000 shows with pagination', async () => {
      const shows = generateLargeShowDataset(1000);
      
      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        userWithRoles: {
          id: 'test-user',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          roles: [UserRole.SECRETARY],
          permissions: []
        },
        loading: false
      });

      (useShowStore as ReturnType<typeof vi.fn>).mockReturnValue({
        shows,
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

      tracker.mark('render-1000-start');
      renderWithProviders(<BrowseShowsPage />);
      
      await waitFor(() => {
        // Should show first page of results
        expect(screen.getAllByTestId(/show-card/i).length).toBeLessThanOrEqual(50);
      });
      
      const renderTime = tracker.measure('render-1000-shows', 'render-1000-start');
      
      // Should render first page within 1 second
      expect(renderTime).toBeLessThan(1000);
      console.log(`Rendered 1000 shows (paginated) in ${renderTime}ms`);
    });
  });

  describe('Tab Switching Performance', () => {
    it('should switch tabs quickly with large datasets', async () => {
      const shows = generateLargeShowDataset(500);
      const entries = generateLargeEntryDataset(500, 0.4); // 40% of shows have entries
      
      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        userWithRoles: {
          id: 'test-user',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          roles: [UserRole.EXHIBITOR],
          permissions: []
        },
        loading: false
      });

      (useShowStore as ReturnType<typeof vi.fn>).mockReturnValue({
        shows,
        isLoading: false,
        error: null,
        loadShows: vi.fn()
      });

      (useEntryStore as ReturnType<typeof vi.fn>).mockReturnValue({
        entries,
        isLoading: false,
        error: null,
        loadEntries: vi.fn()
      });

      renderWithProviders(<BrowseShowsPage />);
      
      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /all shows/i })).toBeInTheDocument();
      });

      // Measure tab switch time
      tracker.mark('tab-switch-start');
      
      const myEntriesTab = screen.getByRole('tab', { name: /my entries/i });
      fireEvent.click(myEntriesTab);
      
      await waitFor(() => {
        expect(screen.getByTestId('tab-content-entries')).toBeInTheDocument();
      });
      
      const tabSwitchTime = tracker.measure('tab-switch', 'tab-switch-start');
      
      // Tab switch should be under 200ms
      expect(tabSwitchTime).toBeLessThan(200);
      console.log(`Tab switch completed in ${tabSwitchTime}ms`);
    });
  });

  describe('Search and Filter Performance', () => {
    it('should filter shows quickly with large dataset', async () => {
      const shows = generateLargeShowDataset(1000);
      
      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        userWithRoles: {
          id: 'test-user',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          roles: [UserRole.EXHIBITOR],
          permissions: []
        },
        loading: false
      });

      (useShowStore as ReturnType<typeof vi.fn>).mockReturnValue({
        shows,
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

      renderWithProviders(<BrowseShowsPage />);
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search shows/i)).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search shows/i);
      
      // Measure search performance
      tracker.mark('search-start');
      
      fireEvent.change(searchInput, { target: { value: 'Agility' } });
      
      await waitFor(() => {
        const agilityShows = screen.getAllByText(/Agility Trial/i);
        expect(agilityShows.length).toBeGreaterThan(0);
      });
      
      const searchTime = tracker.measure('search-filter', 'search-start');
      
      // Search should complete within 300ms
      expect(searchTime).toBeLessThan(300);
      console.log(`Search filter completed in ${searchTime}ms`);
    });

    it('should handle multiple filter combinations efficiently', async () => {
      const shows = generateLargeShowDataset(500);
      
      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        userWithRoles: {
          id: 'test-user',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          roles: [UserRole.EXHIBITOR],
          permissions: []
        },
        loading: false
      });

      (useShowStore as ReturnType<typeof vi.fn>).mockReturnValue({
        shows,
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

      renderWithProviders(<BrowseShowsPage />);
      
      await waitFor(() => {
        expect(screen.getByLabelText(/discipline/i)).toBeInTheDocument();
      });

      tracker.mark('multi-filter-start');
      
      // Apply multiple filters
      const disciplineFilter = screen.getByLabelText(/discipline/i);
      fireEvent.change(disciplineFilter, { target: { value: 'Agility' } });
      
      const locationFilter = screen.getByLabelText(/location/i);
      fireEvent.change(locationFilter, { target: { value: 'New York' } });
      
      const dateRangeFilter = screen.getByLabelText(/date range/i);
      fireEvent.change(dateRangeFilter, { target: { value: 'upcoming' } });
      
      await waitFor(() => {
        const filteredShows = screen.getAllByTestId(/show-card/i);
        expect(filteredShows.length).toBeLessThan(shows.length);
      });
      
      const multiFilterTime = tracker.measure('multi-filter', 'multi-filter-start');
      
      // Multiple filters should complete within 400ms
      expect(multiFilterTime).toBeLessThan(400);
      console.log(`Multiple filters completed in ${multiFilterTime}ms`);
    });
  });

  describe('Memory Usage Tests', () => {
    it('should handle memory efficiently with large datasets', async () => {
      const shows = generateLargeShowDataset(2000);
      const entries = generateLargeEntryDataset(2000, 0.5);
      
      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        userWithRoles: {
          id: 'test-user',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          roles: [UserRole.SECRETARY, UserRole.JUDGE],
          permissions: []
        },
        loading: false
      });

      (useShowStore as ReturnType<typeof vi.fn>).mockReturnValue({
        shows,
        isLoading: false,
        error: null,
        loadShows: vi.fn()
      });

      (useEntryStore as ReturnType<typeof vi.fn>).mockReturnValue({
        entries,
        isLoading: false,
        error: null,
        loadEntries: vi.fn()
      });

      // Measure initial memory (if available)
      const initialMemory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
      
      renderWithProviders(<BrowseShowsPage />);
      
      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /all shows/i })).toBeInTheDocument();
      });

      // Cycle through all tabs to test memory management
      const tabs = ['past', 'entries', 'managing', 'assignments'];
      
      for (const tabName of tabs) {
        const tab = screen.queryByRole('tab', { name: new RegExp(tabName, 'i') });
        if (tab) {
          fireEvent.click(tab);
          await waitFor(() => {
            expect(screen.getByTestId(`tab-content-${tabName}`)).toBeInTheDocument();
          });
        }
      }

      // Check final memory (if available)
      const finalMemory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
      
      if (initialMemory && finalMemory) {
        const memoryIncrease = finalMemory - initialMemory;
        const memoryIncreaseMB = memoryIncrease / (1024 * 1024);
        
        console.log(`Memory increase: ${memoryIncreaseMB.toFixed(2)} MB`);
        
        // Memory increase should be reasonable (less than 50MB for 2000 shows)
        expect(memoryIncreaseMB).toBeLessThan(50);
      }
    });
  });

  describe('Scroll Performance', () => {
    it('should maintain smooth scrolling with virtualization', async () => {
      const shows = generateLargeShowDataset(1000);
      
      (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
        userWithRoles: {
          id: 'test-user',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          roles: [UserRole.EXHIBITOR],
          permissions: []
        },
        loading: false
      });

      (useShowStore as ReturnType<typeof vi.fn>).mockReturnValue({
        shows,
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

      renderWithProviders(<BrowseShowsPage />);
      
      await waitFor(() => {
        expect(screen.getAllByTestId(/show-card/i)).toHaveLength(expect.any(Number));
      });

      const container = screen.getByTestId('shows-container');
      
      // Simulate scroll events
      tracker.mark('scroll-start');
      
      // Scroll to middle
      fireEvent.scroll(container, { target: { scrollTop: 5000 } });
      
      // Scroll to bottom
      fireEvent.scroll(container, { target: { scrollTop: 10000 } });
      
      // Scroll back to top
      fireEvent.scroll(container, { target: { scrollTop: 0 } });
      
      const scrollTime = tracker.measure('scroll-performance', 'scroll-start');
      
      // Scroll operations should be smooth (under 100ms total)
      expect(scrollTime).toBeLessThan(100);
      console.log(`Scroll operations completed in ${scrollTime}ms`);
    });
  });

  // Generate performance report
  afterAll(() => {
    console.log('\n=== Performance Test Results ===');
    console.log(tracker.getReport());
    console.log('================================\n');
  });
});