import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import JudgeAnalyticsPage from '../JudgeAnalyticsPage';

const idle = { data: undefined, isLoading: false, error: null };
const alerts = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock('@/hooks/queries/useJudgeAnalyticsQuery', () => ({
  useJudgeRosterSummary: () => idle,
  useJudgeUtilizationStats: () => ({ ...idle, data: [] }),
  useJudgeQualificationAlerts: () => ({ data: alerts.rows, isLoading: false, error: null }),
  useJudgeAssignmentTrends: () => ({ ...idle, data: [] }),
}));

/**
 * MYK9-1198: expiration_date is a DATE. Compared as UTC midnight, a qualification expiring
 * today read "Expired" all evening west of UTC, disagreeing with the server's local-day window.
 */
describe('JudgeAnalyticsPage qualification alerts (MYK9-1198)', () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'America/Chicago';
    vi.useFakeTimers({ toFake: ['Date'] });
    // 19:00 on Nov 9 in Chicago, already Nov 10 in UTC.
    vi.setSystemTime(new Date('2026-11-10T01:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('a qualification expiring on the local day reads Expiring, one from yesterday Expired', () => {
    alerts.rows = [
      {
        id: 'today',
        organization: 'AKC',
        qualification_level: 'Novice',
        expiration_date: '2026-11-09',
        suspension_date: null,
        people: { first_name: 'Ada', last_name: 'Today' },
      },
      {
        id: 'yesterday',
        organization: 'AKC',
        qualification_level: 'Novice',
        expiration_date: '2026-11-08',
        suspension_date: null,
        people: { first_name: 'Bo', last_name: 'Yesterday' },
      },
    ];
    render(<JudgeAnalyticsPage />);

    expect(screen.getAllByText('Expiring')).toHaveLength(1);
    expect(screen.getAllByText('Expired')).toHaveLength(1);
  });
});
