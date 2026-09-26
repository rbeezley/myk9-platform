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
      authoritativeEntryFeeCents({
        ...base,
        showDayOfShowFee: null,
        nowIso: '2026-07-01T06:00:00Z',
      })
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

// MYK9-662: the junior handler fee, when the show configures one, replaces
// the tier-selected fee entirely for a junior handler. Trial date fixed
// before the show's day-of-show boundary so these cases isolate the junior
// override from the pre/day-of tier already covered above.
describe('authoritativeEntryFeeCents — junior handler fee (MYK9-662)', () => {
  const juniorBase = {
    ...base,
    showJuniorHandlerFee: 15,
    trialDate: '2026-06-20',
    trialRegistryId: 'AKC',
  };

  it('prices a junior handler (AKC, under 18 on the trial date) at the junior fee', () => {
    expect(authoritativeEntryFeeCents({ ...juniorBase, handlerDateOfBirth: '2010-01-01' })).toBe(
      1500
    );
  });

  it('prices an adult handler at the normal tier, not the junior fee', () => {
    expect(authoritativeEntryFeeCents({ ...juniorBase, handlerDateOfBirth: '1990-01-01' })).toBe(
      3000
    );
  });

  it('prices a missing date of birth at the normal tier (unknown never buys the discount)', () => {
    expect(authoritativeEntryFeeCents({ ...juniorBase, handlerDateOfBirth: null })).toBe(3000);
  });

  it('prices ASCA (no derivable ceiling) at the normal tier even for a young handler', () => {
    expect(
      authoritativeEntryFeeCents({
        ...juniorBase,
        trialRegistryId: 'ASCA',
        handlerDateOfBirth: '2015-01-01',
      })
    ).toBe(3000);
  });

  it('ignores the junior fee entirely when the show has not configured one', () => {
    expect(
      authoritativeEntryFeeCents({
        ...juniorBase,
        showJuniorHandlerFee: null,
        handlerDateOfBirth: '2010-01-01',
      })
    ).toBe(3000);
    expect(
      authoritativeEntryFeeCents({
        ...juniorBase,
        showJuniorHandlerFee: 0,
        handlerDateOfBirth: '2010-01-01',
      })
    ).toBe(3000);
  });

  it('applies the UKC fixed measuring date (January 1 of the trial year), not the trial date', () => {
    // Turns 18 on 2026-02-01: still a UKC junior at a trial in November 2026
    // (measured as of January 1, before the birthday), but already an adult
    // under AKC's own-day-of-trial rule for the same trial date.
    const turnsEighteenInFebruary = '2008-02-01';
    expect(
      authoritativeEntryFeeCents({
        ...juniorBase,
        trialRegistryId: 'UKC',
        trialDate: '2026-11-01',
        handlerDateOfBirth: turnsEighteenInFebruary,
      })
    ).toBe(1500);
    expect(
      authoritativeEntryFeeCents({
        ...juniorBase,
        trialRegistryId: 'AKC',
        trialDate: '2026-11-01',
        handlerDateOfBirth: turnsEighteenInFebruary,
      })
    ).toBe(3000);
  });

  it('treats a date of birth after the measuring date as bad data, not a very young handler', () => {
    expect(
      authoritativeEntryFeeCents({
        ...juniorBase,
        trialDate: '2026-06-20',
        handlerDateOfBirth: '2026-07-01',
      })
    ).toBe(3000);
  });
});
