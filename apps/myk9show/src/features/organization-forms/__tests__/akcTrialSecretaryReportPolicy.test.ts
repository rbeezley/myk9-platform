import { describe, expect, it } from 'vitest';
import type { ReportEntry } from '@/lib/reports/types';
import { resolveAKCTrialSecretaryReportPolicy } from '../akcTrialSecretaryReportPolicy';

function entry(overrides: Partial<ReportEntry> = {}): ReportEntry {
  return {
    id: 'entry-1',
    armband: '1',
    runOrder: 1,
    callName: 'Rocket',
    breed: 'Beagle',
    handler: 'Jamie Walker',
    registrationNumber: 'PAL123',
    checkInStatus: 'checked-in',
    section: 'A',
    isScored: true,
    resultText: 'Q',
    searchTimeSeconds: null,
    totalFaults: null,
    finalPlacement: null,
    ...overrides,
  };
}

describe('resolveAKCTrialSecretaryReportPolicy', () => {
  it.each([
    ['2025-12-31', 3.5, '3.50'],
    ['2026-01-01', 4.5, '4.50'],
  ])('uses the fee schedule at the %s year boundary', (trialDate, feeRate, formattedRate) => {
    expect(resolveAKCTrialSecretaryReportPolicy(trialDate, [entry()])).toMatchObject({
      ok: true,
      feeRate,
      formattedRate,
    });
  });

  it.each([
    ['missing', undefined, 'missing', 'Set a valid trial date before generating this report.'],
    ['invalid', '2026-02-30', 'invalid', 'Set a valid trial date before generating this report.'],
    [
      'unsupported',
      '2027-01-01',
      'unsupported',
      'This fee schedule covers 2025 and 2026 events only. Confirm the current AKC rate before generating this report.',
    ],
  ] as const)('fails closed when the trial date is %s', (_label, trialDate, reason, recovery) => {
    expect(resolveAKCTrialSecretaryReportPolicy(trialDate, [entry()])).toEqual({
      ok: false,
      reason,
      recovery,
    });
  });

  it('preserves withdrawn, scratched, and cancelled run exclusions from MYK9-317', () => {
    const result = resolveAKCTrialSecretaryReportPolicy('2026-06-12', [
      entry({ id: 'entered' }),
      entry({ id: 'withdrawn', entryStatus: 'withdrawn' }),
      entry({ id: 'scratched', entryStatus: 'scratched' }),
      entry({ id: 'cancelled', resultText: 'cancelled' }),
    ]);

    expect(result).toMatchObject({
      ok: true,
      totalEntries: 4,
      excludedRuns: 3,
      paidRuns: 1,
      formattedTotal: '4.50',
    });
  });
});
