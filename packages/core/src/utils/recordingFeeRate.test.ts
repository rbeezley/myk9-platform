import { describe, expect, it } from 'vitest';
import {
  formatRecordingFeeAmount,
  RECORDING_FEE_RATES,
  RECORDING_FEE_RATES_KNOWN_THROUGH,
  recordingFeeRateInForce,
  toCalendarDate,
  type RecordingFeeRate,
} from './recordingFeeRate';

describe('RECORDING_FEE_RATES', () => {
  it("carries the three AKC rates from the AKC Secretary's Page, September 2025", () => {
    expect(RECORDING_FEE_RATES).toEqual([
      { registry: 'AKC', effectiveFrom: '2025-01-01', amountCents: 350 },
      { registry: 'AKC', effectiveFrom: '2026-01-01', amountCents: 450 },
      { registry: 'AKC', effectiveFrom: '2027-01-01', amountCents: 550 },
    ]);
  });
});

describe('recordingFeeRateInForce', () => {
  it('has no rate after the last date AKC has announced: the last row is not carried forward', () => {
    expect(RECORDING_FEE_RATES_KNOWN_THROUGH).toBe('2027-12-31');
    expect(recordingFeeRateInForce('AKC', '2028-01-01')).toBeNull();
    expect(recordingFeeRateInForce('AKC', '2031-06-01')).toBeNull();
  });

  it.each([
    ['2025-01-01', 350],
    ['2025-12-31', 350],
    ['2026-01-01', 450],
    ['2026-12-31', 450],
    ['2027-01-01', 550],
    ['2027-12-31', 550],
  ])('AKC on %s is %s cents', (date, cents) => {
    expect(recordingFeeRateInForce('AKC', date)?.amountCents).toBe(cents);
  });

  it('is null before the first rate, for another registry, and for a bad date', () => {
    expect(recordingFeeRateInForce('AKC', '2024-12-31')).toBeNull();
    expect(recordingFeeRateInForce('UKC', '2027-01-01')).toBeNull();
    expect(recordingFeeRateInForce('ASCA', '2027-01-01')).toBeNull();
    expect(recordingFeeRateInForce('AKC', '2027-02-30')).toBeNull();
    expect(recordingFeeRateInForce('AKC', undefined)).toBeNull();
    expect(recordingFeeRateInForce('AKC', '2027-01-01', [])).toBeNull();
  });

  it('picks the latest row on or before the date, in any table order, per registry', () => {
    const rates: RecordingFeeRate[] = [
      { registry: 'AKC', effectiveFrom: '2027-01-01', amountCents: 550 },
      { registry: 'UKC', effectiveFrom: '2026-06-01', amountCents: 100 },
      { registry: 'AKC', effectiveFrom: '2025-01-01', amountCents: 350 },
    ];
    expect(recordingFeeRateInForce('AKC', '2026-12-31', rates)?.amountCents).toBe(350);
    expect(recordingFeeRateInForce('UKC', '2026-05-31', rates)).toBeNull();
    expect(recordingFeeRateInForce('UKC', '2026-06-01', rates)?.amountCents).toBe(100);
  });

  it('reads the date as written, so a timestamp does not shift a day', () => {
    expect(toCalendarDate('2026-12-31T23:30:00-08:00')).toBe('2026-12-31');
    expect(recordingFeeRateInForce('AKC', '2026-12-31T23:30:00-08:00')?.amountCents).toBe(450);
  });
});

describe('formatRecordingFeeAmount', () => {
  it('prints dollars with two decimals', () => {
    expect(formatRecordingFeeAmount(550)).toBe('5.50');
    expect(formatRecordingFeeAmount(350)).toBe('3.50');
  });
});
