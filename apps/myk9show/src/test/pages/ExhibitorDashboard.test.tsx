import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// Mock IntersectionObserver (used by framer-motion's FadeIn)
class MockIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
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
  useDogsByOwnerQuery: () => ({ data: [{ id: 'dog-1' }, { id: 'dog-2' }] }),
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
    myClasses: [],
    nextUp: null,
    completedToday: [],
    stats: { total: 0, completed: 0, qualified: 0 },
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

describe('ExhibitorDashboard (Home)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEntriesQuery.mockReturnValue({ data: [], isLoading: false, error: null });
    mockResults.mockReturnValue({ data: [] });
    mockShowDayData.mockReturnValue(makeNonShowDay());
  });

  describe('Home layout', () => {
    it('shows time-of-day greeting with user name', () => {
      renderDashboard();
      expect(screen.getByText(/Good (morning|afternoon|evening).*Sarah Jones/)).toBeInTheDocument();
    });

    it('shows contextual subtitle', () => {
      renderDashboard();
      expect(screen.getByText(/what's happening with your shows/i)).toBeInTheDocument();
    });

    it('renders CompactStatsRow with correct counts', () => {
      mockEntriesQuery.mockReturnValue({
        data: [makeFutureEntry()],
        isLoading: false,
        error: null,
      });
      renderDashboard();
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
      expect(screen.getByText('Ready for your next show?')).toBeInTheDocument();
    });

    it('renders results section collapsed by default', () => {
      mockResults.mockReturnValue({ data: [makeResult()] });
      renderDashboard();
      expect(screen.getByText(/Recent Results \(1\)/)).toBeInTheDocument();
      expect(screen.queryByText('Winter Classic')).not.toBeInTheDocument();
    });

    it('expands results section on click', async () => {
      mockResults.mockReturnValue({ data: [makeResult()] });
      renderDashboard();
      await userEvent.click(screen.getByText(/Recent Results \(1\)/));
      expect(screen.getByText('Winter Classic')).toBeInTheDocument();
    });

    it('renders quick action cards', () => {
      renderDashboard();
      // Quick Actions section has cards with titles and descriptions
      expect(screen.getByText('Quick Actions')).toBeInTheDocument();
      expect(screen.getAllByText('Find Shows').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('My Dogs').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('My Entries').length).toBeGreaterThanOrEqual(1);
    });

    it('navigates to shows when Find Shows card is clicked', async () => {
      renderDashboard();
      // Click the first "Find Shows" (in empty state or quick actions)
      await userEvent.click(screen.getAllByText('Find Shows')[0]);
      expect(mockNavigate).toHaveBeenCalledWith('/shows');
    });
  });

  describe('Show day alert card', () => {
    it('shows alert card when show day is active', () => {
      mockShowDayData.mockReturnValue(makeShowDay());
      renderDashboard();
      expect(screen.getByText('You have a show today!')).toBeInTheDocument();
      expect(
        screen.getByText('Check in, view run order, and see live results')
      ).toBeInTheDocument();
    });

    it('links to show day page', () => {
      mockShowDayData.mockReturnValue(makeShowDay());
      renderDashboard();
      const link = screen.getByText('You have a show today!').closest('a');
      expect(link).toHaveAttribute('href', '/exhibitor/show-day');
    });

    it('does not show alert card when no show day', () => {
      renderDashboard();
      expect(screen.queryByText('You have a show today!')).not.toBeInTheDocument();
    });
  });

  describe('Loading and error states', () => {
    it('shows spinner when entries are loading', () => {
      mockEntriesQuery.mockReturnValue({ data: [], isLoading: true, error: null });
      const { container } = renderDashboard();
      expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    });

    it('shows error message on entries error', () => {
      mockEntriesQuery.mockReturnValue({
        data: [],
        isLoading: false,
        error: new Error('fetch failed'),
      });
      renderDashboard();
      expect(screen.getByText(/Unable to load entries/)).toBeInTheDocument();
    });
  });
});
