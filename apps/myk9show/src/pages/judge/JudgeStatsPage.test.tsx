import { render, screen } from '@/test/utils/testUtils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JudgeStatsPage from './JudgeStatsPage';

const mockStats = vi.hoisted(() => vi.fn());
const mockUpcoming = vi.hoisted(() => vi.fn());
const mockQualifications = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'auth-user-uuid' },
    userWithRoles: { databaseUserId: 'person-123' },
  }),
}));

vi.mock('@/hooks/queries/useJudgeAnalyticsQuery', () => ({
  useMyJudgeStats: (personId: string | undefined) => mockStats(personId),
  useUpcomingJudgeAssignments: (personId: string | undefined) => mockUpcoming(personId),
  useJudgeQualificationSummary: (personId: string | undefined) => mockQualifications(personId),
}));

describe('JudgeStatsPage', () => {
  beforeEach(() => {
    mockStats.mockReturnValue({ data: null, isLoading: false });
    mockUpcoming.mockReturnValue({ data: [], isLoading: false });
    mockQualifications.mockReturnValue({
      data: {
        total_qualifications: 0,
        active_qualifications: 0,
        expiring_soon: 0,
        organizations: [],
        disciplines: [],
      },
      isLoading: false,
    });
  });

  it('queries judge analytics with the database person ID', () => {
    render(<JudgeStatsPage />, { initialRoute: '/judge/stats' });

    expect(mockStats).toHaveBeenCalledWith('person-123');
    expect(mockUpcoming).toHaveBeenCalledWith('person-123');
    expect(mockQualifications).toHaveBeenCalledWith('person-123');
  });

  it('names the class on each upcoming row so one show is not listed repeatedly', () => {
    const base = {
      show_name: 'Heartland Scent Work Classic',
      show_start_date: '2026-12-07T00:00:00Z',
      status: 'confirmed',
    };
    mockUpcoming.mockReturnValue({
      data: [
        { ...base, id: 'a1', class_label: 'Interior Novice A' },
        { ...base, id: 'a2', class_label: 'Container Advanced' },
      ],
      isLoading: false,
    });

    render(<JudgeStatsPage />, { initialRoute: '/judge/stats' });

    expect(screen.getByText('Interior Novice A')).toBeInTheDocument();
    expect(screen.getByText('Container Advanced')).toBeInTheDocument();
  });

  it('does not claim a secretary fee figure it does not have', () => {
    mockStats.mockReturnValue({
      data: { showsJudged: 1, classesJudged: 2, totalFees: null, statusBreakdown: {} },
      isLoading: false,
    });

    render(<JudgeStatsPage />, { initialRoute: '/judge/stats' });

    expect(screen.getByText('Not shown on this dashboard')).toBeInTheDocument();
    expect(screen.queryByText(/secretary/i)).not.toBeInTheDocument();
  });

  describe('upcoming assignment date (MYK9-1174)', () => {
    const originalTimezone = process.env.TZ;
    afterEach(() => {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    });

    it.each(['America/Chicago', 'America/Los_Angeles', 'UTC'])(
      'shows the show’s own calendar day in %s',
      timezone => {
        process.env.TZ = timezone;
        mockUpcoming.mockReturnValue({
          data: [
            {
              id: 'a1',
              show_name: 'Heartland Scent Work Classic',
              // shows.start_date round-trips as a midnight-UTC instant.
              show_start_date: '2026-11-09T00:00:00Z',
              status: 'confirmed',
            },
          ],
          isLoading: false,
        });

        render(<JudgeStatsPage />, { initialRoute: '/judge/stats' });

        expect(screen.getByText(/Nov 9, 2026/)).toBeInTheDocument();
        expect(screen.queryByText(/Nov 8, 2026|11\/8\/2026/)).not.toBeInTheDocument();
      }
    );
  });
});
