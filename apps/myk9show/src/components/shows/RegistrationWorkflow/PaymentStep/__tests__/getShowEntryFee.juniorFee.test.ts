import { describe, expect, it } from 'vitest';
import { getShowEntryFee, type ShowFeeInfo } from '../utils';

// MYK9-878: the client quotes the junior fee only for the secretary's explicit
// choice. Age-derived junior pricing is the server's (the date of birth is private).
const show: ShowFeeInfo = {
  preEntryFee: '25',
  dayOfShowFee: '35',
  startDate: '2026-07-01',
  juniorHandlerFee: '15',
};

describe('getShowEntryFee with the junior handler fee choice', () => {
  it('returns the junior fee on a day-of entry when chosen', () => {
    expect(getShowEntryFee(show, 30, true, true)).toBe(15);
  });

  it('returns the junior fee on a pre-entry when chosen', () => {
    expect(getShowEntryFee(show, 30, false, true)).toBe(15);
  });

  it('is the normal fee when not chosen', () => {
    expect(getShowEntryFee(show, 30, true)).toBe(35);
    expect(getShowEntryFee(show, 30, false)).toBe(25);
  });

  it('is the normal fee when the show has no junior fee, even if chosen', () => {
    expect(getShowEntryFee({ ...show, juniorHandlerFee: undefined }, 30, true, true)).toBe(35);
  });

  it('treats a zero or malformed junior fee as no junior tier', () => {
    expect(getShowEntryFee({ ...show, juniorHandlerFee: '0' }, 30, true, true)).toBe(35);
    expect(getShowEntryFee({ ...show, juniorHandlerFee: '' }, 30, true, true)).toBe(35);
    expect(getShowEntryFee({ ...show, juniorHandlerFee: 'abc' }, 30, true, true)).toBe(35);
  });

  it('never exceeds the normal fee: junior 15, normal 10 quotes 10 (matches the server LEAST)', () => {
    const cheap = { ...show, preEntryFee: '10', dayOfShowFee: '12' };
    expect(getShowEntryFee(cheap, 30, false, true)).toBe(10);
    expect(getShowEntryFee(cheap, 30, true, true)).toBe(12);
    // No show-level fee: the class fee is the normal fee.
    expect(
      getShowEntryFee({ ...show, preEntryFee: '', dayOfShowFee: undefined }, 10, false, true)
    ).toBe(10);
  });

  it('accepts a formatted junior fee', () => {
    expect(getShowEntryFee({ ...show, juniorHandlerFee: '$15.00' }, 30, true, true)).toBe(15);
  });
});
