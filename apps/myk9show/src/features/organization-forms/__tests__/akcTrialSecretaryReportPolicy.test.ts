import { describe, expect, it } from 'vitest';
import type { ReportEntry } from '@/lib/reports/types';
import { resolveAKCTrialSecretaryReportPolicy } from '../akcTrialSecretaryReportPolicy';
import { NEW_YEAR_SHOW } from '@/test/fixtures/recordingFeeCalendar';

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
  it('bills AKC for ONE run when a dog is moved up, not two (MYK9-639)', () => {
    // The finding's pair, on the 2026 schedule ($4.50/run). The dog enters the
    // ring once, in the destination class; counting the vacated source too
    // remitted $9.00 for one run, and put this report back into disagreement
    // with the Financial Report and the UKC report, which both count 1.
    const result = resolveAKCTrialSecretaryReportPolicy('2026-06-12', [
      entry({ id: 'source-moved', entryStatus: 'moved' }),
      entry({ id: 'destination', entryStatus: 'confirmed', movedFromEntryId: 'source-moved' }),
    ]);

    expect(result).toMatchObject({
      ok: true,
      totalEntries: 1,
      paidRuns: 1,
      feeRate: 4.5,
      formattedTotal: '4.50',
    });
  });

  it('leaves the post-closing withdrawal exclusions alone (MYK9-317 / MYK9-445 own those)', () => {
    // Dropping the superseded half of a move-up is a different question from
    // whether a withdrawn dog is billable. This pins that the narrow change did
    // not quietly widen.
    const result = resolveAKCTrialSecretaryReportPolicy('2026-06-12', [
      entry({ id: 'ran', entryStatus: 'confirmed' }),
      entry({ id: 'withdrawn-in-season', withdrawalReason: 'Bitch in season' }),
    ]);

    expect(result).toMatchObject({ ok: true, totalEntries: 2, excludedRuns: 1, paidRuns: 1 });
  });

  it.each([
    ['2025-12-31', 3.5, '3.50'],
    ['2026-01-01', 4.5, '4.50'],
    ['2026-12-31', 4.5, '4.50'],
    ['2027-01-01', 5.5, '5.50'],
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
      'unsupported (before the first rate)',
      '2024-12-31',
      'unsupported',
      'This fee schedule covers events from January 1, 2025. Confirm the AKC rate for this trial date before generating this report.',
    ],
    [
      'a timestamp',
      '2027-01-01T00:00:00Z',
      'invalid',
      'Set a valid trial date before generating this report.',
    ],
  ] as const)('fails closed when the trial date is %s', (_label, trialDate, reason, recovery) => {
    expect(resolveAKCTrialSecretaryReportPolicy(trialDate, [entry()])).toEqual({
      ok: false,
      reason,
      recovery,
    });
  });

  it('charges only AKC-approved post-closing withdrawal reasons', () => {
    const result = resolveAKCTrialSecretaryReportPolicy('2026-06-12', [
      entry({ id: 'entered' }),
      entry({
        id: 'in-season',
        entryStatus: 'withdrawn',
        withdrawalReason: 'Bitch in Season',
      }),
      entry({ id: 'judge-change', entryStatus: 'withdrawn', withdrawalReason: 'Judge Change' }),
      entry({ id: 'absent', entryStatus: 'absent', resultText: 'absent' }),
      entry({ id: 'scratched', entryStatus: 'scratched', withdrawalReason: 'Dog absent' }),
      entry({ id: 'pulled', checkInStatus: 'pulled', withdrawalReason: 'Pulled day-of' }),
    ]);

    expect(result).toMatchObject({
      ok: true,
      totalEntries: 6,
      excludedRuns: 2,
      paidRuns: 4,
      formattedTotal: '18.00',
    });
  });

  it('accepts official AIS and AJC result codes', () => {
    const result = resolveAKCTrialSecretaryReportPolicy('2026-06-12', [
      entry({ id: 'ais', resultText: 'AIS' }),
      entry({ id: 'ajc', resultText: 'AJC' }),
    ]);

    expect(result).toMatchObject({ excludedRuns: 2, paidRuns: 0, formattedTotal: '0.00' });
  });

  it('prices a 2027 trial at $5.50 a run, in whole cents', () => {
    expect(
      resolveAKCTrialSecretaryReportPolicy('2027-03-06', [entry(), entry({ id: 'e2' })])
    ).toMatchObject({
      ok: true,
      rateEffectiveFrom: '2027-01-01',
      paidRuns: 2,
      feeRate: 5.5,
      formattedRate: '5.50',
      totalFee: 11,
      formattedTotal: '11.00',
    });
  });

  it('bills each New Year show trial at the rate the premium states for its date (MYK9-2044)', () => {
    // Same dates as the premium's New Year case in
    // supabase/functions/generate-premium/recordingFeeRate.test.ts, which states
    // "AKC recording fee: $4.50 per entry; $5.50 per entry from January 1, 2027".
    const [eve, newYear] = NEW_YEAR_SHOW.trialDates;
    expect(resolveAKCTrialSecretaryReportPolicy(eve, [entry()])).toMatchObject({
      ok: true,
      rateEffectiveFrom: '2026-01-01',
      formattedRate: '4.50',
    });
    expect(resolveAKCTrialSecretaryReportPolicy(newYear, [entry()])).toMatchObject({
      ok: true,
      rateEffectiveFrom: '2027-01-01',
      formattedRate: '5.50',
    });
  });
});
