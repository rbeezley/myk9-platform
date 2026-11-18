// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  formatRecordingFeeAmount as coreFormat,
  recordingFeeRateInForce as coreInForce,
  toCalendarDate as coreToCalendarDate,
} from '../../../packages/core/src/utils/recordingFeeRate';
import {
  NEW_YEAR_SHOW,
  SEEDED_AKC_RECORDING_FEE_ROWS,
} from '../../../apps/myk9show/src/test/fixtures/recordingFeeCalendar';
import {
  buildPremiumRecordingFee,
  formatRecordingFeeAmount,
  premiumRecordingFeeDates,
  recordingFeeRateInForce,
  recordingFeeRatesFromRows,
  toCalendarDate,
  type RecordingFeeRate,
} from './recordingFeeRate';

// The seeded AKC rows (migration 20261119031700), as the function reads them.
const ROWS = SEEDED_AKC_RECORDING_FEE_ROWS.map(rate => ({
  registry: rate.registry,
  effective_from: rate.effectiveFrom,
  amount_cents: rate.amountCents,
}));
const RATES = recordingFeeRatesFromRows(ROWS);

function feeText(organization: string | null, dates: readonly string[], rates = RATES) {
  return buildPremiumRecordingFee(organization, dates, rates)?.text ?? null;
}

describe('premium recording fee statement (MYK9-2044)', () => {
  it('prints the 2027 rate for an AKC show dated 2027', () => {
    expect(buildPremiumRecordingFee('AKC', ['2027-01-15'], RATES)).toEqual({
      registry: 'AKC',
      rates: [{ amountCents: 550, appliesFrom: null }],
      text: 'AKC recording fee: $5.50 per entry',
    });
  });

  it('prints the 2026 rate for a 2026 show, including the last day of the year', () => {
    expect(feeText('AKC', ['2026-06-12'])).toBe('AKC recording fee: $4.50 per entry');
    expect(feeText('AKC', ['2026-12-31'])).toBe('AKC recording fee: $4.50 per entry');
  });

  it('prints no line when no rate is in force, there is no date, or the show is not AKC', () => {
    expect(feeText('AKC', ['2024-12-31'])).toBeNull();
    expect(feeText('AKC', [])).toBeNull();
    expect(feeText('AKC', ['2027-01-15'], [])).toBeNull();
    expect(feeText('UKC', ['2027-01-15'])).toBeNull();
    expect(feeText(null, ['2027-01-15'])).toBeNull();
  });

  it('prints no line when any trial date has no rate in force, rather than half a statement', () => {
    expect(feeText('AKC', ['2024-12-31', '2025-01-01'])).toBeNull();
  });

  it('states one rate when trials on both sides of a new row carry the same amount', () => {
    const flat: RecordingFeeRate[] = [
      ...RATES,
      { registry: 'AKC', effectiveFrom: '2028-01-01', amountCents: 550 },
    ];
    expect(feeText('AKC', ['2027-12-31', '2028-01-01'], flat)).toBe(
      'AKC recording fee: $5.50 per entry'
    );
  });
});

describe('premium recording fee across a rate change (MYK9-2044 New Year show)', () => {
  it('names both rates, the later with the date it applies from', () => {
    const dates = premiumRecordingFeeDates(
      NEW_YEAR_SHOW.trialDates.map(date => ({ date, status: 'upcoming', deleted_at: null })),
      NEW_YEAR_SHOW.startDate
    );

    expect(dates).toEqual(['2026-12-31', '2027-01-01']);
    expect(buildPremiumRecordingFee('AKC', dates, RATES)).toEqual({
      registry: 'AKC',
      rates: [
        { amountCents: 450, appliesFrom: null },
        { amountCents: 550, appliesFrom: '2027-01-01' },
      ],
      text: 'AKC recording fee: $4.50 per entry; $5.50 per entry from January 1, 2027',
    });
  });

  it('prices only live trials: a cancelled or deleted New Year trial leaves one rate', () => {
    const [eve, newYear] = NEW_YEAR_SHOW.trialDates;
    for (const gone of [
      { date: newYear, status: 'cancelled', deleted_at: null },
      { date: newYear, status: 'upcoming', deleted_at: '2026-11-01T00:00:00Z' },
    ]) {
      const dates = premiumRecordingFeeDates(
        [{ date: eve, status: 'upcoming', deleted_at: null }, gone],
        NEW_YEAR_SHOW.startDate
      );
      expect(feeText('AKC', dates)).toBe('AKC recording fee: $4.50 per entry');
    }
  });

  it('falls back to the show start date before any trial is dated', () => {
    expect(premiumRecordingFeeDates([], NEW_YEAR_SHOW.startDate)).toEqual(['2026-12-31']);
    expect(premiumRecordingFeeDates(null, '2027-01-01')).toEqual(['2027-01-01']);
    expect(
      premiumRecordingFeeDates(
        [{ date: '2027-01-01', status: 'cancelled', deleted_at: null }],
        NEW_YEAR_SHOW.startDate
      )
    ).toEqual(['2026-12-31']);
    expect(premiumRecordingFeeDates([], null)).toEqual([]);
  });

  it('reads trial dates as calendar dates, with no timezone shift', () => {
    expect(
      premiumRecordingFeeDates(
        [{ date: '2027-01-01T00:30:00+14:00' }, { date: '2026-12-31T23:30:00-10:00' }],
        null
      )
    ).toEqual(['2026-12-31', '2027-01-01']);
  });
});

describe('parity with @myk9/core (the Trial Secretary report reads the core copy)', () => {
  const EXTRA: RecordingFeeRate[] = [
    { registry: 'UKC', effectiveFrom: '2026-03-01', amountCents: 125 },
    { registry: 'AKC', effectiveFrom: '2028-07-04', amountCents: 600 },
  ];
  const all = [...RATES, ...EXTRA];
  const dates = [
    '2024-12-31',
    '2025-01-01',
    '2025-12-31',
    '2026-01-01',
    '2026-12-31',
    '2027-01-01',
    '2028-02-29',
    '2027-02-29',
    '2028-07-03',
    '2028-07-04',
    '2027-02-30',
    '2027-13-01',
    '2026-12-31T23:30:00-08:00',
    ' 2027-01-01 ',
    '',
    'not a date',
    null,
    undefined,
  ];

  it.each(dates)('picks the same rate for %s', date => {
    expect(toCalendarDate(date)).toBe(coreToCalendarDate(date));
    for (const registry of ['AKC', 'UKC', 'ASCA']) {
      expect(recordingFeeRateInForce(all, registry, date)).toEqual(
        coreInForce(all, registry, date)
      );
    }
  });

  it.each([1, 5, 350, 450, 550, 1999, 100_000])('formats %s cents the same', cents => {
    expect(formatRecordingFeeAmount(cents)).toBe(coreFormat(cents));
  });
});
