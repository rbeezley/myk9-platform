import { describe, expect, it } from 'vitest';
import { calculateMailInReserved } from './waitlistCapacity';

describe('calculateMailInReserved', () => {
  it('calculates fixed and percentage reserves', () => {
    expect(calculateMailInReserved({ capacity: 125, strategy: 'fixed', value: 20 })).toBe(20);
    expect(calculateMailInReserved({ capacity: 100, strategy: 'percentage', value: 15 })).toBe(15);
  });

  it('drops the reserve on or after the auto-release date', () => {
    expect(
      calculateMailInReserved({
        capacity: 125,
        strategy: 'fixed',
        value: 20,
        autoRelease: true,
        releaseDate: '2026-05-01',
        todayIso: '2026-05-01',
      })
    ).toBe(0);
  });

  it('treats timestamp-shaped release dates as releasing on their date', () => {
    expect(
      calculateMailInReserved({
        capacity: 125,
        strategy: 'fixed',
        value: 20,
        autoRelease: true,
        releaseDate: '2026-05-01T23:59:59Z',
        todayIso: '2026-05-01',
      })
    ).toBe(0);
  });

  it('keeps the reserve before the auto-release date', () => {
    expect(
      calculateMailInReserved({
        capacity: 125,
        strategy: 'fixed',
        value: 20,
        autoRelease: true,
        releaseDate: '2026-05-02',
        todayIso: '2026-05-01',
      })
    ).toBe(20);
  });
});
