import { describe, expect, it } from 'vitest';
import type { ReportEntry } from '@/lib/reports/types';
import type { RecordingFeeRate } from '@myk9/core';
import type { ReportAsyncData } from '@/lib/reports/types';
import {
  readAKCRecordingFeeRates,
  resolveAKCTrialSecretaryReportPolicy as resolvePolicy,
} from '../akcTrialSecretaryReportPolicy';

// The seeded AKC rows (migration 20261119031700): the only source of the rate now.
const RATES: RecordingFeeRate[] = [
  { registry: 'AKC', effectiveFrom: '2025-01-01', amountCents: 350 },
  { registry: 'AKC', effectiveFrom: '2026-01-01', amountCents: 450 },
  { registry: 'AKC', effectiveFrom: '2027-01-01', amountCents: 550 },
];

function resolveAKCTrialSecretaryReportPolicy(
  trialDate: string | null | undefined,
  entries: ReportEntry[],
  rates: RecordingFeeRate[] | null = RATES
) {
  return resolvePolicy(trialDate, entries, rates);
}

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
      'No AKC recording fee is set for this trial date. A site admin can add the rate on the Payouts page. Confirm the current AKC rate before generating this report.',
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

  it('prices a 2027 trial at $5.50 a run', () => {
    expect(
      resolveAKCTrialSecretaryReportPolicy('2027-03-06', [entry(), entry({ id: 'e2' })])
    ).toMatchObject({
      ok: true,
      rateEffectiveFrom: '2027-01-01',
      paidRuns: 2,
      formattedRate: '5.50',
      formattedTotal: '11.00',
    });
  });

  it('refuses, rather than guessing a rate, when the rate list could not be read', () => {
    expect(resolveAKCTrialSecretaryReportPolicy('2027-03-06', [entry()], null)).toEqual({
      ok: false,
      reason: 'rates-unavailable',
      recovery:
        'The AKC recording fee schedule could not be loaded. Reconnect and reopen this report.',
    });
  });

  it('treats a rate list that was read and is empty as "no rate in force"', () => {
    expect(resolveAKCTrialSecretaryReportPolicy('2027-03-06', [entry()], [])).toMatchObject({
      ok: false,
      reason: 'unsupported',
    });
  });

  it('uses a rate a site admin added later without a code change', () => {
    const rates = [...RATES, { registry: 'AKC', effectiveFrom: '2028-01-01', amountCents: 625 }];
    expect(resolveAKCTrialSecretaryReportPolicy('2028-02-01', [entry()], rates)).toMatchObject({
      ok: true,
      formattedRate: '6.25',
    });
  });
});

describe('readAKCRecordingFeeRates', () => {
  const read = (rates: ReportAsyncData<RecordingFeeRate[]> | undefined) =>
    readAKCRecordingFeeRates(rates);

  it('is null while loading, on error, and when the host passed nothing', () => {
    expect(read(undefined)).toBeNull();
    expect(read({ data: [], isLoading: true, isError: false })).toBeNull();
    expect(read({ data: [], isLoading: false, isError: true })).toBeNull();
  });

  it('keeps a list that was read, empty or not', () => {
    expect(read({ data: [], isLoading: false, isError: false })).toEqual([]);
    expect(read({ data: RATES, isLoading: false, isError: false })).toBe(RATES);
  });
});
