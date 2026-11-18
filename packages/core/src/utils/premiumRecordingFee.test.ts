import { describe, expect, it } from 'vitest';
import {
  buildPremiumRecordingFee,
  formatCalendarDateLong,
  isLivePremiumTrial,
  premiumRecordingFeeDates,
} from './premiumRecordingFee';
import { RECORDING_FEE_RATES, type RecordingFeeRate } from './recordingFeeRate';

// The New Year show the app's report and premium tests also price
// (apps/myk9show/src/test/fixtures/recordingFeeCalendar.ts).
const EVE = '2026-12-31';
const NEW_YEAR = '2027-01-01';

const text = (organization: string | null, dates: readonly string[]) =>
  buildPremiumRecordingFee(organization, dates)?.text ?? null;

describe('buildPremiumRecordingFee (MYK9-2044)', () => {
  it('states one rate for dates under one rate', () => {
    expect(buildPremiumRecordingFee('AKC', ['2027-01-15'])).toEqual({
      registry: 'AKC',
      rates: [{ amountCents: 550, appliesFrom: null }],
      text: 'AKC recording fee: $5.50 per entry',
    });
    expect(text('AKC', ['2025-12-31'])).toBe('AKC recording fee: $3.50 per entry');
    expect(text('AKC', ['2026-06-12', EVE])).toBe('AKC recording fee: $4.50 per entry');
  });

  it('names both rates of the New Year pair, the later with the date it applies from', () => {
    expect(buildPremiumRecordingFee('AKC', [NEW_YEAR, EVE])).toEqual({
      registry: 'AKC',
      rates: [
        { amountCents: 450, appliesFrom: null },
        { amountCents: 550, appliesFrom: NEW_YEAR },
      ],
      text: 'AKC recording fee: $4.50 per entry; $5.50 per entry from January 1, 2027',
    });
  });

  it('states no line when any date has no known rate, rather than half a statement', () => {
    expect(text('AKC', ['2028-01-01'])).toBeNull();
    expect(text('AKC', ['2027-12-31', '2028-01-01'])).toBeNull();
    expect(text('AKC', ['2024-12-31', '2025-01-01'])).toBeNull();
  });

  it('states no line with no date or for a registry other than AKC', () => {
    expect(text('AKC', [])).toBeNull();
    expect(text('UKC', [NEW_YEAR])).toBeNull();
    expect(text(null, [NEW_YEAR])).toBeNull();
  });

  it('collapses a new row that keeps the same amount into one rate', () => {
    const flat: RecordingFeeRate[] = [
      ...RECORDING_FEE_RATES,
      { registry: 'AKC', effectiveFrom: '2028-01-01', amountCents: 550 },
    ];
    expect(buildPremiumRecordingFee('AKC', ['2027-12-31', '2028-01-01'], flat)?.text).toBe(
      'AKC recording fee: $5.50 per entry'
    );
  });
});

describe('premiumRecordingFeeDates (MYK9-2044)', () => {
  it('prices each live trial date once, oldest first', () => {
    expect(
      premiumRecordingFeeDates([{ date: NEW_YEAR }, { date: EVE }, { date: EVE }], null)
    ).toEqual([EVE, NEW_YEAR]);
  });

  it('skips a cancelled or soft-deleted trial', () => {
    for (const gone of [
      { date: NEW_YEAR, status: 'cancelled' },
      { date: NEW_YEAR, deleted_at: '2026-11-01T00:00:00Z' },
    ]) {
      const dates = premiumRecordingFeeDates([{ date: EVE }, gone], EVE);
      expect(dates).toEqual([EVE]);
      expect(text('AKC', dates)).toBe('AKC recording fee: $4.50 per entry');
    }
  });

  it('falls back to the start date when no live trial is dated, and is empty when nothing is', () => {
    expect(premiumRecordingFeeDates([], EVE)).toEqual([EVE]);
    expect(premiumRecordingFeeDates(null, NEW_YEAR)).toEqual([NEW_YEAR]);
    expect(premiumRecordingFeeDates([{ date: NEW_YEAR, status: 'cancelled' }], EVE)).toEqual([EVE]);
    expect(premiumRecordingFeeDates([{ date: null }], null)).toEqual([]);
    expect(premiumRecordingFeeDates([], null)).toEqual([]);
  });

  it('reads dates as calendar dates, with no timezone shift', () => {
    expect(
      premiumRecordingFeeDates(
        [{ date: '2027-01-01T00:30:00+14:00' }, { date: '2026-12-31T23:30:00-10:00' }],
        null
      )
    ).toEqual([EVE, NEW_YEAR]);
  });
});

describe('isLivePremiumTrial and formatCalendarDateLong', () => {
  it('treats only cancelled and soft-deleted trials as gone', () => {
    expect(isLivePremiumTrial({})).toBe(true);
    expect(isLivePremiumTrial({ status: 'published', deleted_at: null })).toBe(true);
    expect(isLivePremiumTrial({ status: 'cancelled' })).toBe(false);
    expect(isLivePremiumTrial({ deleted_at: '2026-11-01T00:00:00Z' })).toBe(false);
  });

  it('writes a calendar date out long', () => {
    expect(formatCalendarDateLong(NEW_YEAR)).toBe('January 1, 2027');
    expect(formatCalendarDateLong('2028-12-31')).toBe('December 31, 2028');
  });
});
