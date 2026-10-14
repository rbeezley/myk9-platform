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
