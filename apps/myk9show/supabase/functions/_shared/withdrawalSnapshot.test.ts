import { describe, it, expect } from 'vitest';
import { resolveWithdrawalSnapshot } from './withdrawalSnapshot.ts';

const club = {
  default_withdrawal_cutoff_date: '2026-05-01',
  default_withdrawal_retention_type: 'flat',
  default_withdrawal_retention_value: 500,
  default_withdrawal_policy_notes: null,
};

describe('resolveWithdrawalSnapshot', () => {
  it('uses the show override when any override field is set', () => {
    const snap = resolveWithdrawalSnapshot(
      {
        withdrawal_cutoff_date: '2026-06-01',
        withdrawal_retention_type: 'percent',
        withdrawal_retention_value: 20,
        withdrawal_policy_notes: null,
      },
      club
    );
    expect(snap).toEqual({
      cutoffDate: '2026-06-01',
      retentionType: 'percent',
      retentionValue: 20,
      notes: null,
    });
  });

  it('falls back to the club default when the show declares nothing', () => {
    const snap = resolveWithdrawalSnapshot(
      {
        withdrawal_cutoff_date: null,
        withdrawal_retention_type: null,
        withdrawal_retention_value: null,
        withdrawal_policy_notes: null,
      },
      club
    );
    expect(snap).toEqual({
      cutoffDate: '2026-05-01',
      retentionType: 'flat',
      retentionValue: 500,
      notes: null,
    });
  });

  it('returns null when neither show nor club declares a policy', () => {
    expect(resolveWithdrawalSnapshot(null, null)).toBeNull();
    expect(resolveWithdrawalSnapshot({}, {})).toBeNull();
  });

  it('treats a show with only prose notes as an override (cutoff null)', () => {
    const snap = resolveWithdrawalSnapshot({ withdrawal_policy_notes: 'See premium.' }, club);
    expect(snap?.notes).toBe('See premium.');
    expect(snap?.cutoffDate).toBeNull();
    expect(snap?.retentionType).toBe('flat');
  });

  it('defaults an unknown retention type to flat', () => {
    const snap = resolveWithdrawalSnapshot(
      { withdrawal_retention_type: 'weird', withdrawal_retention_value: 100 },
      null
    );
    expect(snap?.retentionType).toBe('flat');
    expect(snap?.retentionValue).toBe(100);
  });
});
