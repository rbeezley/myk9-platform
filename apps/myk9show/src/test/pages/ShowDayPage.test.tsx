import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// Mock IntersectionObserver (used by StickyShowBar)
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

import ShowDayPage from '@/pages/ShowDayPage';
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

vi.mock('@/hooks/useShowDayAlerts', () => ({
  useShowDayAlerts: vi.fn(),
}));

vi.mock('@/hooks/mutations/useCheckInMutation', () => ({
  useCheckInMutation: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/hooks/queries/useSelfCheckinEnabled', () => ({
  useSelfCheckinMap: () => ({}),
}));

vi.mock('@/store/notificationStore', () => ({
  useNotificationStore: () => vi.fn(),
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
}));

const mockResults = vi.fn();
vi.mock('@/hooks/queries/useExhibitorResults', () => ({
  useExhibitorResults: () => mockResults(),
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

function renderShowDay() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ShowDayPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ---------- Tests ----------

describe('ShowDayPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEntriesQuery.mockReturnValue({ data: [] });
    mockResults.mockReturnValue({ data: [] });
  });

  describe('Empty state (no active show)', () => {
    beforeEach(() => {
      mockShowDayData.mockReturnValue(makeNonShowDay());
    });

    it('shows "Show Day" heading', () => {
      renderShowDay();
      expect(screen.getByText('Show Day')).toBeInTheDocument();
    });

    it('shows friendly empty state message', () => {
      renderShowDay();
      expect(screen.getByText('No show today')).toBeInTheDocument();
      expect(
        screen.getByText(/When you have entries for a show happening today/)
      ).toBeInTheDocument();
    });

    it('shows Find Shows and My Entries buttons', () => {
      renderShowDay();
      expect(screen.getByText('Find Shows')).toBeInTheDocument();
      expect(screen.getByText('My Entries')).toBeInTheDocument();
    });

    it('navigates to shows on Find Shows click', async () => {
      const { default: userEvent } = await import('@testing-library/user-event');
      renderShowDay();
      await userEvent.click(screen.getByText('Find Shows'));
      expect(mockNavigate).toHaveBeenCalledWith('/shows');
    });
  });

  describe('Active show day', () => {
    beforeEach(() => {
      mockShowDayData.mockReturnValue(makeShowDay());
    });

    it('shows "Show Day" heading', () => {
      renderShowDay();
      expect(screen.getByText('Show Day')).toBeInTheDocument();
    });

    it('renders ShowDayHero with live indicator', () => {
      renderShowDay();
      expect(screen.getByText('Live')).toBeInTheDocument();
    });

    it('renders NextUpCard within ShowDayHero', () => {
      renderShowDay();
      expect(screen.getByText('Next Up')).toBeInTheDocument();
      expect(screen.getByText('Container Novice')).toBeInTheDocument();
    });

    it('does not show empty state', () => {
      renderShowDay();
      expect(screen.queryByText('No show today')).not.toBeInTheDocument();
    });
  });

  describe('Loading state', () => {
    it('shows spinner when loading', () => {
      mockShowDayData.mockReturnValue({
        ...makeNonShowDay(),
        isLoading: true,
      });
      const { container } = renderShowDay();
      expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  describe('Error state', () => {
    it('shows error message when data fetch fails', () => {
      mockShowDayData.mockReturnValue({
        ...makeNonShowDay(),
        error: new Error('network error'),
      });
      renderShowDay();
      expect(screen.getByText(/Unable to load show day info/)).toBeInTheDocument();
    });
  });
});
