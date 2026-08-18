import { render } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
});
