import { describe, expect, it } from 'vitest';
import {
  formatRecordingFeeAmount,
  recordingFeeRateInForce,
  toCalendarDate,
  type RecordingFeeRate,
} from './recordingFeeRate';

const RATES: RecordingFeeRate[] = [
  { registry: 'AKC', effectiveFrom: '2027-01-01', amountCents: 550 },
  { registry: 'AKC', effectiveFrom: '2025-01-01', amountCents: 350 },
  { registry: 'AKC', effectiveFrom: '2026-01-01', amountCents: 450 },
  { registry: 'UKC', effectiveFrom: '2026-06-01', amountCents: 100 },
];

describe('recordingFeeRateInForce', () => {
  it.each([
    ['2025-01-01', 350],
    ['2025-12-31', 350],
    ['2026-01-01', 450],
    ['2026-12-31', 450],
    ['2027-01-01', 550],
    ['2031-06-01', 550],
  ])('AKC on %s is %s cents', (date, cents) => {
    expect(recordingFeeRateInForce(RATES, 'AKC', date)?.amountCents).toBe(cents);
  });

  it('is null before the first rate, for another registry, and for a bad date', () => {
    expect(recordingFeeRateInForce(RATES, 'AKC', '2024-12-31')).toBeNull();
    expect(recordingFeeRateInForce(RATES, 'ASCA', '2027-01-01')).toBeNull();
    expect(recordingFeeRateInForce(RATES, 'UKC', '2026-05-31')).toBeNull();
    expect(recordingFeeRateInForce(RATES, 'AKC', '2027-02-30')).toBeNull();
    expect(recordingFeeRateInForce(RATES, 'AKC', undefined)).toBeNull();
    expect(recordingFeeRateInForce([], 'AKC', '2027-01-01')).toBeNull();
  });

  it('reads the date as written, so a timestamp does not shift a day', () => {
    expect(toCalendarDate('2026-12-31T23:30:00-08:00')).toBe('2026-12-31');
    expect(recordingFeeRateInForce(RATES, 'AKC', '2026-12-31T23:30:00-08:00')?.amountCents).toBe(
      450
    );
  });
});

describe('formatRecordingFeeAmount', () => {
  it('prints dollars with two decimals', () => {
    expect(formatRecordingFeeAmount(550)).toBe('5.50');
    expect(formatRecordingFeeAmount(350)).toBe('3.50');
  });
});
