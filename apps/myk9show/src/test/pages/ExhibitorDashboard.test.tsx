import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// Mock IntersectionObserver (used by StickyShowBar + framer-motion)
class MockIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    // Immediately call with not-intersecting so StickyShowBar renders in show-day tests
    setTimeout(() => {
      callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver
      );
    }, 0);
  }
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
});
import ExhibitorDashboard from '@/pages/ExhibitorDashboard';
import type { ShowDayData } from '@/types/show-day-types';

// ---------- Mocks ----------

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/hooks/useRoleRedirect', () => ({
  useRoleRedirect: vi.fn(),
}));

const mockShowDayData = vi.fn<() => ShowDayData>();
vi.mock('@/hooks/queries/useShowDayData', () => ({
  useShowDayData: () => mockShowDayData(),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { user_metadata: { full_name: 'Sarah Jones' }, email: 'sarah@test.com' },
    userWithRoles: { databaseUserId: 'user-1' },
  }),
}));

const mockEntriesQuery = vi.fn();
vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useEntriesQuery: () => mockEntriesQuery(),
  useEntryStatisticsQuery: () => ({ data: null }),
}));

vi.mock('@/hooks/queries/useDogsDatabase', () => ({
  useDogsQuery: () => ({ data: [{ id: 'dog-1' }, { id: 'dog-2' }] }),
}));

const mockResults = vi.fn();
vi.mock('@/hooks/queries/useExhibitorResults', () => ({
  useExhibitorResults: () => mockResults(),
}));

vi.mock('@/hooks/useMilestones', () => ({
  useMilestones: () => ({ activeTip: null, dismiss: vi.fn() }),
}));

// ---------- Helpers ----------

function makeNonShowDay(): ShowDayData {
  return {
    isShowDay: false,
    activeShows: [],
    activeShow: null,
    myClasses: [],
    nextUp: null,
    completedToday: [],
    stats: { total: 0, completed: 0, qualified: 0 },
    isLoading: false,
    error: null,
    isStale: false,
    lastUpdated: null,
  };
}

function makeShowDay(): ShowDayData {
  const nextUp = {
    classId: 'class-1',
    className: 'Container Novice A',
    element: 'Container',
    level: 'Novice',
    dogCallName: 'Storm',
    dogId: 'dog-1',
    armband: '160',
    entryId: 'entry-1',
    totalEntries: 12,
    scoredEntries: 5,
    currentDogInRing: 'Katie',
    myRunningOrder: 8,
    estimatedTimeMinutes: 9,
    entryStatus: 'checked-in',
    isScored: false,
    resultStatus: null,
    classStatus: 'in-progress',
    showId: 'show-1',
    showName: 'AKC Scent Work',
    trialDate: '2026-03-09',
  };

  return {
    isShowDay: true,
    activeShows: [
      {
        showId: 'show-1',
        showName: 'AKC Scent Work',
        location: 'Denver, CO',
        clubName: 'Denver KC',
        trialDate: '2026-03-09',
        showStatus: 'in_progress',
      },
    ],
    activeShow: {
      showId: 'show-1',
      showName: 'AKC Scent Work',
      location: 'Denver, CO',
      clubName: 'Denver KC',
      trialDate: '2026-03-09',
      showStatus: 'in_progress',
    },
    myClasses: [nextUp],
    nextUp,
    completedToday: [],
    stats: { total: 1, completed: 0, qualified: 0 },
    isLoading: false,
    error: null,
    isStale: false,
    lastUpdated: new Date(),
  };
}

function makeFutureEntry(overrides: Record<string, unknown> = {}) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 14);
  return {
    id: 'entry-1',
    show_id: 'show-1',
    dog_id: 'dog-1',
    class_id: 'class-1',
    entry_status: 'confirmed',
    show: {
      name: 'Rocky Mountain Classic',
      start_date: futureDate.toISOString(),
      location: 'Denver, CO',
    },
    dog: { call_name: 'Storm', name: 'Storm' },
    class: { name: 'Container Novice A', entry_fee: 30 },
    ...overrides,
  };
}

function makeResult(overrides: Record<string, unknown> = {}) {
  return {
    id: 'result-1',
    dogId: 'dog-1',
    dogName: 'Storm',
    dogCallName: 'Storm',
    showId: 'show-2',
    classId: 'class-2',
    className: 'Buried Advanced',
    classLevel: 'Advanced',
    classElement: 'Buried',
    resultText: 'Q',
    resultStatus: 'qualified',
    searchTimeSeconds: 42.5,
    totalFaults: 0,
    finalPlacement: 1,
    scoringCompletedAt: '2026-03-01',
    showName: 'Winter Classic',
    showDate: '2026-03-01',
    ...overrides,
  };
}

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ExhibitorDashboard />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ---------- Tests ----------

describe('ExhibitorDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEntriesQuery.mockReturnValue({ data: [], isLoading: false, error: null });
    mockResults.mockReturnValue({ data: [] });
  });

  describe('Non-show day layout', () => {
    beforeEach(() => {
      mockShowDayData.mockReturnValue(makeNonShowDay());
    });

    it('shows "Exhibitor Dashboard" heading', () => {
      renderDashboard();
      expect(screen.getByText('Exhibitor Dashboard')).toBeInTheDocument();
    });

    it('shows welcome message with user name', () => {
      renderDashboard();
      expect(screen.getByText(/Welcome back, Sarah Jones/)).toBeInTheDocument();
    });

    it('renders CompactStatsRow with correct counts', () => {
      mockEntriesQuery.mockReturnValue({
        data: [makeFutureEntry()],
        isLoading: false,
        error: null,
      });
      renderDashboard();
      // 1 confirmed entry, 1 upcoming show, 2 dogs (from mock)
      expect(screen.getByLabelText(/1 active entry/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/1 upcoming show/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/2 dogs registered/i)).toBeInTheDocument();
    });

    it('shows upcoming entries section', () => {
      mockEntriesQuery.mockReturnValue({
        data: [makeFutureEntry()],
        isLoading: false,
        error: null,
      });
      renderDashboard();
      expect(screen.getByText('Upcoming Entries')).toBeInTheDocument();
      expect(screen.getByText('Rocky Mountain Classic')).toBeInTheDocument();
    });

    it('shows empty state when no upcoming entries', () => {
      renderDashboard();
      expect(screen.getByText('No Upcoming Entries')).toBeInTheDocument();
      expect(screen.getByText('Browse Shows')).toBeInTheDocument();
    });

    it('renders results section collapsed by default', () => {
      mockResults.mockReturnValue({ data: [makeResult()] });
      renderDashboard();

      // Title with count is visible
      expect(screen.getByText(/Recent Results \(1\)/)).toBeInTheDocument();
      // Content is NOT visible until expanded
      expect(screen.queryByText('Winter Classic')).not.toBeInTheDocument();
    });

    it('expands results section on click', async () => {
      mockResults.mockReturnValue({ data: [makeResult()] });
      renderDashboard();

      await userEvent.click(screen.getByText(/Recent Results \(1\)/));
      expect(screen.getByText('Winter Classic')).toBeInTheDocument();
    });

    it('renders quick action buttons', () => {
      renderDashboard();
      expect(screen.getByText('Find Shows')).toBeInTheDocument();
      expect(screen.getAllByText('My Dogs').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('My Entries')).toBeInTheDocument();
    });

    it('navigates to shows when Find Shows is clicked', async () => {
      renderDashboard();
      await userEvent.click(screen.getByText('Find Shows'));
      expect(mockNavigate).toHaveBeenCalledWith('/shows');
    });

    it('does NOT show ShowDayHero', () => {
      renderDashboard();
      expect(screen.queryByText('Live')).not.toBeInTheDocument();
    });
  });

  describe('Show day layout', () => {
    beforeEach(() => {
      mockShowDayData.mockReturnValue(makeShowDay());
    });

    it('shows "Show Day" heading', () => {
      renderDashboard();
      expect(screen.getByText('Show Day')).toBeInTheDocument();
    });

    it('renders ShowDayHero with live indicator', () => {
      renderDashboard();
      expect(screen.getByText('Live')).toBeInTheDocument();
    });

    it('renders NextUpCard within ShowDayHero', () => {
      renderDashboard();
      expect(screen.getByText('Next Up')).toBeInTheDocument();
      expect(screen.getByText('Container Novice')).toBeInTheDocument();
    });

    it('does NOT show CompactStatsRow', () => {
      renderDashboard();
      expect(screen.queryByLabelText(/active entries/i)).not.toBeInTheDocument();
    });

    it('does NOT show quick action buttons', () => {
      renderDashboard();
      expect(screen.queryByText('Find Shows')).not.toBeInTheDocument();
    });

    it('shows entries as collapsible section', () => {
      mockEntriesQuery.mockReturnValue({
        data: [makeFutureEntry()],
        isLoading: false,
        error: null,
      });
      renderDashboard();

      // Collapsed by default
      expect(screen.getByText(/My Entries \(1\)/)).toBeInTheDocument();
      expect(screen.queryByText('Rocky Mountain Classic')).not.toBeInTheDocument();
    });

    it('expands entries section on click during show day', async () => {
      mockEntriesQuery.mockReturnValue({
        data: [makeFutureEntry()],
        isLoading: false,
        error: null,
      });
      renderDashboard();

      await userEvent.click(screen.getByText(/My Entries \(1\)/));
      expect(screen.getByText('Rocky Mountain Classic')).toBeInTheDocument();
    });
  });

  describe('Loading and error states', () => {
    it('shows spinner when entries are loading (non-show day)', () => {
      mockShowDayData.mockReturnValue(makeNonShowDay());
      mockEntriesQuery.mockReturnValue({ data: [], isLoading: true, error: null });
      const { container } = renderDashboard();
      expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    });

    it('shows error message on entries error (non-show day)', () => {
      mockShowDayData.mockReturnValue(makeNonShowDay());
      mockEntriesQuery.mockReturnValue({
        data: [],
        isLoading: false,
        error: new Error('fetch failed'),
      });
      renderDashboard();
      expect(screen.getByText(/Unable to load entries/)).toBeInTheDocument();
    });

    it('still renders show day layout even if entries fail to load', () => {
      mockShowDayData.mockReturnValue(makeShowDay());
      mockEntriesQuery.mockReturnValue({
        data: [],
        isLoading: false,
        error: new Error('fetch failed'),
      });
      renderDashboard();
      // Should still show the show day hero, not the error state
      expect(screen.getByText('Show Day')).toBeInTheDocument();
      expect(screen.getByText('Live')).toBeInTheDocument();
    });
  });
});
