import { describe, it, expect } from 'vitest';
import {
  formatFeeDollars,
  juniorFeeLimitError,
  lowestRegularFee,
  showFormJuniorFeeLimitError,
} from './juniorFeeLimit';

describe('lowestRegularFee (mirrors private.show_lowest_regular_fee)', () => {
  it.each([
    ['the pre-entry fee', { preEntryFee: 15, dayOfShowFee: 25 }, 15],
    ['a day-of fee below the pre-entry fee', { preEntryFee: 30, dayOfShowFee: 12 }, 12],
    ['a day-of fee of 0 is no tier', { preEntryFee: 30, dayOfShowFee: 0 }, 30],
    ['a pre-entry fee of 0 is charged as 0', { preEntryFee: 0, dayOfShowFee: null }, 0],
    [
      'class fees are ignored while there is a pre-entry fee',
      { preEntryFee: 30, dayOfShowFee: null, classFees: [10] },
      30,
    ],
    [
      'class fees are the limit with no pre-entry fee',
      { preEntryFee: null, dayOfShowFee: null, classFees: [25, 12.5] },
      12.5,
    ],
    [
      'a day-of fee still counts with no pre-entry fee',
      { preEntryFee: null, dayOfShowFee: 11, classFees: [25] },
      11,
    ],
    ['nothing to compare against', { preEntryFee: null, dayOfShowFee: null }, null],
  ])('%s', (_label, tiers, expected) => {
    expect(lowestRegularFee(tiers)).toBe(expected);
  });
});

describe('juniorFeeLimitError', () => {
  const tiers = { preEntryFee: 15, dayOfShowFee: 25 };

  it('names the limit in plain words', () => {
    expect(juniorFeeLimitError(20, tiers)).toBe(
      "The junior fee can't be more than $15, the lowest class fee in this show."
    );
  });

  it('allows a junior fee equal to or below the limit', () => {
    expect(juniorFeeLimitError(15, tiers)).toBeUndefined();
    expect(juniorFeeLimitError(10, tiers)).toBeUndefined();
  });

  it.each([undefined, null, 0, Number.NaN])('never limits no junior tier (%s)', fee => {
    expect(juniorFeeLimitError(fee, { preEntryFee: 0, dayOfShowFee: null })).toBeUndefined();
  });

  it('never limits a show with no fee at all', () => {
    expect(juniorFeeLimitError(20, { preEntryFee: null, dayOfShowFee: null })).toBeUndefined();
  });
});

describe('formatFeeDollars', () => {
  it('drops cents only for whole dollars', () => {
    expect(formatFeeDollars(15)).toBe('$15');
    expect(formatFeeDollars(12.5)).toBe('$12.50');
    expect(formatFeeDollars(0)).toBe('$0');
  });
});

describe('showFormJuniorFeeLimitError (the show edit form)', () => {
  it('reads a pre-entry fee of 0 as none, the way the save stores it', () => {
    expect(
      showFormJuniorFeeLimitError({
        preEntryFee: '0',
        juniorHandlerFee: '15',
        trials: [{ classes: [{ entryFee: 12 }] }],
      })
    ).toBe("The junior fee can't be more than $12, the lowest class fee in this show.");
  });

  it('skips a class fee of 0, which the class read cannot tell from no fee', () => {
    expect(
      showFormJuniorFeeLimitError({
        preEntryFee: '',
        juniorHandlerFee: '15',
        trials: [{ classes: [{ entryFee: 0 }, { entryFee: 20 }] }],
      })
    ).toBeUndefined();
  });

  it('does not limit an ASCA show', () => {
    expect(
      showFormJuniorFeeLimitError({
        organization: 'ASCA',
        preEntryFee: '10',
        juniorHandlerFee: '15',
      })
    ).toBeUndefined();
  });
});
