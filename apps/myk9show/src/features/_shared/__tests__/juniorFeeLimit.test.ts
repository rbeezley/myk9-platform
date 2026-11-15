import { describe, expect, it } from 'vitest';
import {
  formatFeeLimit,
  juniorFeeLimitError,
  juniorFeeLimitMessage,
  lowestShowRegularFee,
} from '../juniorFeeLimit';

describe('lowestShowRegularFee', () => {
  it.each([
    ['the pre-entry fee when it is the lowest', { preEntryFee: '15', dayOfShowFee: '35' }, 15],
    ['the day-of fee when it is the lowest', { preEntryFee: '30', dayOfShowFee: '20' }, 20],
    ['a zero pre-entry fee (a free entry)', { preEntryFee: '0', dayOfShowFee: '35' }, 0],
    ['never a zero day-of fee (no day-of tier)', { preEntryFee: '30', dayOfShowFee: '0' }, 30],
    ['the day-of fee alone when pre-entry is blank', { preEntryFee: '', dayOfShowFee: '35' }, 35],
    ['nothing when neither tier is set', { preEntryFee: '', dayOfShowFee: '' }, null],
    ['wizard numbers', { preEntryFee: 25, dayOfShowFee: 0 }, 25],
    ['a formatted amount', { preEntryFee: '$1,200.50', dayOfShowFee: undefined }, 1200.5],
  ])('%s', (_label, tiers, expected) => {
    expect(lowestShowRegularFee(tiers)).toBe(expected);
  });
});

describe('formatFeeLimit', () => {
  it.each([
    [15, '$15'],
    [15.5, '$15.50'],
    [12.25, '$12.25'],
    [0, '$0'],
    [1200, '$1,200'],
  ])('%s reads %s', (dollars, text) => {
    expect(formatFeeLimit(dollars)).toBe(text);
  });
});

describe('juniorFeeLimitError', () => {
  const show = { organization: 'AKC', preEntryFee: '15', dayOfShowFee: '35' };

  it('names the limit in plain words', () => {
    expect(juniorFeeLimitError({ ...show, juniorHandlerFee: '20' })).toBe(
      "The junior fee can't be more than $15, the lowest class fee in this show."
    );
  });

  it('allows a junior fee equal to the lowest fee', () => {
    expect(juniorFeeLimitError({ ...show, juniorHandlerFee: '15' })).toBeUndefined();
  });

  it('compares in cents, so float noise never blocks an equal fee', () => {
    expect(
      juniorFeeLimitError({ organization: 'AKC', preEntryFee: 0.1 + 0.2, juniorHandlerFee: 0.3 })
    ).toBeUndefined();
  });

  it('blocks a junior fee one cent over', () => {
    expect(juniorFeeLimitError({ ...show, juniorHandlerFee: '15.01' })).toBe(
      juniorFeeLimitMessage(15)
    );
  });

  it('blocks lowering a tier below the junior fee (the reverse)', () => {
    expect(juniorFeeLimitError({ ...show, dayOfShowFee: '12.50', juniorHandlerFee: '15' })).toBe(
      "The junior fee can't be more than $12.50, the lowest class fee in this show."
    );
  });

  it.each([
    ['blank', ''],
    ['zero (no junior tier)', '0'],
    ['unset', undefined],
  ])('never checks a junior fee that is %s', (_label, juniorHandlerFee) => {
    expect(juniorFeeLimitError({ ...show, preEntryFee: '0', juniorHandlerFee })).toBeUndefined();
  });

  it('never checks an ASCA show, which hides the field and clears it on save', () => {
    expect(
      juniorFeeLimitError({ ...show, organization: 'ASCA', juniorHandlerFee: '20' })
    ).toBeUndefined();
  });

  it('leaves a show with no fee tier to the database, which can see class fees', () => {
    expect(
      juniorFeeLimitError({
        organization: 'AKC',
        preEntryFee: '',
        dayOfShowFee: '',
        juniorHandlerFee: '20',
      })
    ).toBeUndefined();
  });
});
