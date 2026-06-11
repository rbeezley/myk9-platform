import { describe, it, expect } from 'vitest';
import { authoritativeEntryFeeCents } from './authoritativeFee';

const base = {
  showPreEntryFee: 30,
  showDayOfShowFee: 35,
  showStartDate: '2026-07-01',
  classEntryFee: 28,
  nowIso: '2026-06-15T12:00:00Z',
};

describe('authoritativeEntryFeeCents', () => {
  it('uses the pre-entry fee before the show starts', () => {
    expect(authoritativeEntryFeeCents(base)).toBe(3000);
  });

  it('switches to the day-of-show fee once the show has started', () => {
    expect(authoritativeEntryFeeCents({ ...base, nowIso: '2026-07-01T06:00:00Z' })).toBe(3500);
    expect(authoritativeEntryFeeCents({ ...base, nowIso: '2026-07-02T06:00:00Z' })).toBe(3500);
  });

  it('falls back to pre-entry on show day when no day-of fee is set', () => {
    expect(
      authoritativeEntryFeeCents({ ...base, showDayOfShowFee: null, nowIso: '2026-07-01T06:00:00Z' })
    ).toBe(3000);
  });

  it('falls back to the class fee when the show has no fees', () => {
    expect(
      authoritativeEntryFeeCents({ ...base, showPreEntryFee: null, showDayOfShowFee: null })
    ).toBe(2800);
  });

  it('respects an explicit $0 class fee (free classes exist)', () => {
    expect(
      authoritativeEntryFeeCents({
        ...base,
        showPreEntryFee: null,
        showDayOfShowFee: null,
        classEntryFee: 0,
      })
    ).toBe(0);
  });

  it('defaults to $25 when nothing is configured', () => {
    expect(
      authoritativeEntryFeeCents({
        ...base,
        showPreEntryFee: null,
        showDayOfShowFee: null,
        classEntryFee: null,
      })
    ).toBe(2500);
  });

  it('parses numeric strings and currency formatting from DECIMAL columns', () => {
    expect(authoritativeEntryFeeCents({ ...base, showPreEntryFee: '30.50' })).toBe(3050);
    expect(
      authoritativeEntryFeeCents({
        ...base,
        showPreEntryFee: null,
        showDayOfShowFee: null,
        classEntryFee: '$28.00',
      })
    ).toBe(2800);
  });

  it('ignores negative or garbage fees instead of charging them', () => {
    expect(authoritativeEntryFeeCents({ ...base, showPreEntryFee: -5 })).toBe(2800);
    expect(
      authoritativeEntryFeeCents({
        ...base,
        showPreEntryFee: 'abc',
        showDayOfShowFee: null,
        classEntryFee: null,
      })
    ).toBe(2500);
  });
});
