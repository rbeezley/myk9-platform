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

// A class with no fee of its own (undefined) charges the show's fee (MYK9-1931).
describe('getShowEntryFee with the junior handler fee choice', () => {
  it('returns the junior fee on a day-of entry when chosen', () => {
    expect(getShowEntryFee(show, undefined, true, true)).toBe(15);
  });

  it('returns the junior fee on a pre-entry when chosen', () => {
    expect(getShowEntryFee(show, undefined, false, true)).toBe(15);
  });

  it('is the normal fee when not chosen', () => {
    expect(getShowEntryFee(show, undefined, true)).toBe(35);
    expect(getShowEntryFee(show, undefined, false)).toBe(25);
  });

  it('is the normal fee when the show has no junior fee, even if chosen', () => {
    expect(getShowEntryFee({ ...show, juniorHandlerFee: undefined }, undefined, true, true)).toBe(35);
  });

  it('treats a zero or malformed junior fee as no junior tier', () => {
    expect(getShowEntryFee({ ...show, juniorHandlerFee: '0' }, undefined, true, true)).toBe(35);
    expect(getShowEntryFee({ ...show, juniorHandlerFee: '' }, undefined, true, true)).toBe(35);
    expect(getShowEntryFee({ ...show, juniorHandlerFee: 'abc' }, undefined, true, true)).toBe(35);
  });

  it('never exceeds the normal fee: junior 15, normal 10 quotes 10 (matches the server LEAST)', () => {
    const cheap = { ...show, preEntryFee: '10', dayOfShowFee: '12' };
    expect(getShowEntryFee(cheap, undefined, false, true)).toBe(10);
    expect(getShowEntryFee(cheap, undefined, true, true)).toBe(12);
    // No show-level fee: the class fee is the normal fee.
    expect(
      getShowEntryFee({ ...show, preEntryFee: '', dayOfShowFee: undefined }, 10, false, true)
    ).toBe(10);
  });

  // MYK9-1931: a class's own fee is the normal fee, and the junior fee still wins below it.
  it('returns the junior fee in a dearer class, before and on the day', () => {
    expect(getShowEntryFee(show, 40, false, true)).toBe(15);
    expect(getShowEntryFee(show, 40, true, true)).toBe(15);
    expect(getShowEntryFee(show, 40, false)).toBe(40);
    expect(getShowEntryFee(show, 40, true)).toBe(50);
  });

  it('accepts a formatted junior fee', () => {
    expect(getShowEntryFee({ ...show, juniorHandlerFee: '$15.00' }, undefined, true, true)).toBe(15);
  });
});
