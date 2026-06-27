import { describe, it, expect } from 'vitest';
import { resolveWithdrawalPolicy, describeWithdrawalPolicyText } from './withdrawalPolicy.ts';

const club = {
  default_withdrawal_cutoff_date: '2026-05-01',
  default_withdrawal_retention_type: 'flat',
  default_withdrawal_retention_value: 500,
  default_withdrawal_policy_notes: null,
};

describe('resolveWithdrawalPolicy', () => {
  it('uses the show override when any override field is set', () => {
    const policy = resolveWithdrawalPolicy(
      {
        withdrawal_cutoff_date: '2026-06-01',
        withdrawal_retention_type: 'percent',
        withdrawal_retention_value: 20,
        withdrawal_policy_notes: null,
      },
      club
    );
    expect(policy).toEqual({
      cutoffDate: '2026-06-01',
      retentionType: 'percent',
      retentionValue: 20,
      notes: null,
    });
  });

  it('falls back to the club default when the show declares nothing', () => {
    const policy = resolveWithdrawalPolicy(
      {
        withdrawal_cutoff_date: null,
        withdrawal_retention_type: null,
        withdrawal_retention_value: null,
        withdrawal_policy_notes: null,
      },
      club
    );
    expect(policy).toEqual({
      cutoffDate: '2026-05-01',
      retentionType: 'flat',
      retentionValue: 500,
      notes: null,
    });
  });

  it('returns null when neither show nor club declares a policy', () => {
    expect(resolveWithdrawalPolicy(null, null)).toBeNull();
    expect(resolveWithdrawalPolicy({}, {})).toBeNull();
  });

  it('treats a show with only prose notes as an override (cutoff null)', () => {
    const policy = resolveWithdrawalPolicy({ withdrawal_policy_notes: 'See premium.' }, club);
    expect(policy?.notes).toBe('See premium.');
    expect(policy?.cutoffDate).toBeNull();
    expect(policy?.retentionType).toBe('flat');
    // Normalized like the app contract: an unset retention is 0, never null.
    expect(policy?.retentionValue).toBe(0);
  });

  it('defaults an unknown retention type to flat', () => {
    const policy = resolveWithdrawalPolicy(
      { withdrawal_retention_type: 'weird', withdrawal_retention_value: 100 },
      null
    );
    expect(policy?.retentionType).toBe('flat');
    expect(policy?.retentionValue).toBe(100);
  });
});

describe('describeWithdrawalPolicyText', () => {
  it('renders a single string with a flat retention after the cutoff', () => {
    const text = describeWithdrawalPolicyText({
      cutoffDate: '2026-06-01',
      retentionType: 'flat',
      retentionValue: 1000,
      notes: null,
    });
    expect(text).toBe(
      'Full refund of the entry fee until June 1, 2026; after that, $10.00 is kept. Service fees are non-refundable.'
    );
  });

  it('renders a percentage', () => {
    const text = describeWithdrawalPolicyText({
      cutoffDate: '2026-06-01',
      retentionType: 'percent',
      retentionValue: 25,
      notes: null,
    });
    expect(text).toContain('25% is kept');
  });

  it('appends prose notes inline', () => {
    const text = describeWithdrawalPolicyText({
      cutoffDate: '2026-06-01',
      retentionType: 'flat',
      retentionValue: 1000,
      notes: 'Email the secretary to withdraw.',
    });
    expect(text).toContain('$10.00 is kept');
    expect(text.endsWith('Email the secretary to withdraw.')).toBe(true);
  });

  it('prose-only policy renders notes + fee sentence, no deadline', () => {
    const text = describeWithdrawalPolicyText({
      cutoffDate: null,
      retentionType: 'flat',
      retentionValue: 0,
      notes: 'Full until closing, then 50%.',
    });
    expect(text).toBe('Service fees are non-refundable. Full until closing, then 50%.');
  });

  it('unset policy renders the neutral contact-the-club line', () => {
    expect(describeWithdrawalPolicyText(null)).toBe(
      'Refund policy: contact the club. Service fees are non-refundable.'
    );
  });

  it('always ends every variant with the service-fee disclosure', () => {
    expect(describeWithdrawalPolicyText(null)).toContain('Service fees are non-refundable.');
    expect(
      describeWithdrawalPolicyText({
        cutoffDate: '2026-06-01',
        retentionType: 'flat',
        retentionValue: 0,
        notes: null,
      })
    ).toContain('Service fees are non-refundable.');
  });
});
