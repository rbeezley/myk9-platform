import { describe, it, expect } from 'vitest';
import { describeWithdrawalPolicy } from '../formatWithdrawalPolicy';
import type { WithdrawalPolicy } from '../withdrawalPolicy';

const base: WithdrawalPolicy = {
  cutoffDate: '2026-06-01',
  retentionType: 'flat',
  retentionValue: 1000,
  notes: null,
};

describe('describeWithdrawalPolicy', () => {
  it('always discloses that service fees are non-refundable', () => {
    expect(describeWithdrawalPolicy(base).refundLine).toContain('Service fees are non-refundable.');
    expect(describeWithdrawalPolicy(null).refundLine).toContain('Service fees are non-refundable.');
  });

  it('describes a flat retention after the cutoff', () => {
    const d = describeWithdrawalPolicy(base);
    expect(d.refundLine).toBe(
      'Full refund of the entry fee until June 1, 2026; after that, $10.00 is kept. Service fees are non-refundable.'
    );
    expect(d.notes).toBeNull();
  });

  it('describes a percentage retention', () => {
    const d = describeWithdrawalPolicy({
      ...base,
      retentionType: 'percent',
      retentionValue: 25,
    });
    expect(d.refundLine).toBe(
      'Full refund of the entry fee until June 1, 2026; after that, 25% is kept. Service fees are non-refundable.'
    );
  });

  it('formats the cutoff date in UTC (no off-by-one from a local parse)', () => {
    // A bare new Date('2026-01-01') is UTC midnight; a local-tz format west of
    // UTC would render Dec 31. Assert the day is preserved.
    const d = describeWithdrawalPolicy({ ...base, cutoffDate: '2026-01-01' });
    expect(d.refundLine).toContain('January 1, 2026');
  });

  it('omits the deadline when no retention is set (full refund regardless)', () => {
    const d = describeWithdrawalPolicy({ ...base, retentionValue: 0 });
    expect(d.refundLine).toBe('Full refund of the entry fee. Service fees are non-refundable.');
  });

  it('prose-only policy surfaces the notes and a fee disclosure, no deadline', () => {
    const d = describeWithdrawalPolicy({
      cutoffDate: null,
      retentionType: 'flat',
      retentionValue: 0,
      notes: '  Full until closing, then 50%, then none.  ',
    });
    expect(d.refundLine).toBe('Service fees are non-refundable.');
    expect(d.notes).toBe('Full until closing, then 50%, then none.'); // trimmed
  });

  it('unset policy returns a neutral "contact the club" line, never blank', () => {
    const d = describeWithdrawalPolicy(null);
    expect(d.refundLine).toBe(
      'Refund policy: contact the club. Service fees are non-refundable.'
    );
    expect(d.notes).toBeNull();
  });

  it('carries structured notes alongside the cutoff line', () => {
    const d = describeWithdrawalPolicy({ ...base, notes: 'Email the secretary to withdraw.' });
    expect(d.refundLine).toContain('$10.00 is kept');
    expect(d.notes).toBe('Email the secretary to withdraw.');
  });
});
