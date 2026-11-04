import { describe, expect, it } from 'vitest';
import { summarizeWithdrawalPolicy } from './withdrawalPolicySummary';

const base = { cutoffDate: null, retentionType: null, retentionValue: null, notes: null };

describe('summarizeWithdrawalPolicy', () => {
  it('is empty when the show sets nothing (club default applies)', () => {
    expect(summarizeWithdrawalPolicy(base)).toEqual([]);
  });

  it('states cutoff and retention in the exhibitor-facing wording', () => {
    const [line] = summarizeWithdrawalPolicy({
      ...base,
      cutoffDate: '2026-12-01',
      retentionType: 'flat',
      retentionValue: 500,
    });
    expect(line).toContain('Full refund of the entry fee until December 1, 2026');
    expect(line).toContain('$5.00 is kept');
  });

  it('claims no retention without a cutoff, so prose notes govern', () => {
    const lines = summarizeWithdrawalPolicy({
      ...base,
      retentionType: 'flat',
      retentionValue: 500,
      notes: 'Full refund until entries close.',
    });
    expect(lines.join(' ')).not.toContain('$5.00');
    expect(lines).toContain('Full refund until entries close.');
  });
});
