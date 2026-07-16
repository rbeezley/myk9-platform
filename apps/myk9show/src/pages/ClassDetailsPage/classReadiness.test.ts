import { describe, expect, it } from 'vitest';
import { buildClassReadinessSummary, type ClassReadinessEntry } from './classReadiness';

const entry = (overrides: Partial<ClassReadinessEntry> = {}): ClassReadinessEntry => ({
  entry_status: 'accepted',
  payment_status: 'paid_online',
  check_in_status: 'no-status',
  is_scored: false,
  ...overrides,
});

describe('buildClassReadinessSummary', () => {
  it('uses the canonical attention reasons for class-scoped counts', () => {
    const summary = buildClassReadinessSummary(
      {
        status: 'In Progress',
        is_scoring_finalized: false,
        reopened_after_closeout_at: null,
      },
      [
        entry({ entry_status: 'accepted', check_in_status: 'checked-in' }),
        entry({ entry_status: 'submitted' }),
        entry({ entry_status: 'missing_info' }),
        entry({ payment_status: 'pending', is_scored: true }),
        entry({ entry_status: 'scratched', payment_status: 'pending' }),
      ]
    );

    expect(summary).toEqual({
      totalEntries: 5,
      pendingReviewCount: 1,
      missingInformationCount: 1,
      paymentDueCount: 1,
      checkedInCount: 1,
      checkInEligibleCount: 2,
      scoredCount: 1,
      paymentStatusUnavailable: false,
      classStatus: 'In Progress',
      isScoringFinalized: false,
      reopenedAfterCloseoutAt: null,
    });
  });

  it('does not claim a payment count when enrollment payment data is unavailable', () => {
    const summary = buildClassReadinessSummary(
      {
        status: 'In Progress',
        is_scoring_finalized: false,
        reopened_after_closeout_at: null,
      },
      [entry({ payment_status: 'paid_online', registration_id: 'registration-1' })]
    );

    expect(summary.paymentStatusUnavailable).toBe(true);
    expect(summary.paymentDueCount).toBe(0);
  });

  it('preserves server lifecycle fields without inferring completion from scored equality', () => {
    const summary = buildClassReadinessSummary(
      {
        status: 'Completed',
        is_scoring_finalized: false,
        reopened_after_closeout_at: null,
      },
      [entry({ is_scored: true }), entry({ is_scored: true })]
    );

    expect(summary.classStatus).toBe('Completed');
    expect(summary.isScoringFinalized).toBe(false);
    expect(summary.scoredCount).toBe(2);
  });

  it('normalizes replicated camelCase lifecycle fields', () => {
    const summary = buildClassReadinessSummary(
      {
        status: 'Completed',
        isScoringFinalized: true,
        reopenedAfterCloseoutAt: '2026-07-16T12:00:00Z',
      },
      []
    );

    expect(summary.isScoringFinalized).toBe(true);
    expect(summary.reopenedAfterCloseoutAt).toBe('2026-07-16T12:00:00Z');
  });

  it('counts check-in progress only for accepted entries', () => {
    const summary = buildClassReadinessSummary(
      {
        status: 'In Progress',
        is_scoring_finalized: false,
        reopened_after_closeout_at: null,
      },
      [
        entry({ entry_status: 'accepted', check_in_status: 'checked-in' }),
        entry({ entry_status: 'accepted', check_in_status: 'no-status' }),
        entry({ entry_status: 'submitted', check_in_status: 'checked-in' }),
      ]
    );

    expect(summary.checkedInCount).toBe(1);
    expect(summary.checkInEligibleCount).toBe(2);
  });

  it('does not surface attention work for withdrawn, scratched, or pulled entries', () => {
    const summary = buildClassReadinessSummary(
      {
        status: 'Completed',
        is_scoring_finalized: false,
        reopened_after_closeout_at: null,
      },
      [
        entry({ entry_status: 'withdrawn', payment_status: 'pending' }),
        entry({ entry_status: 'scratched', payment_status: 'pending' }),
        entry({ check_in_status: 'pulled', payment_status: 'pending' }),
      ]
    );

    expect(summary.pendingReviewCount).toBe(0);
    expect(summary.missingInformationCount).toBe(0);
    expect(summary.paymentDueCount).toBe(0);
    expect(summary.classStatus).toBe('Completed');
  });
});
