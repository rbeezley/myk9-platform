import { describe, expect, it } from 'vitest';
import { day, makeClass } from '@/test/fixtures/myShowsFixtures';
import type { MyShowClass, MyShowDog } from './groupEntriesByShow';
import { deriveShowCountdown, formatCountdown } from './myShowCountdown';

function dogWith(...classes: Partial<MyShowClass>[]): MyShowDog {
  return {
    id: 'd1',
    dogId: 'dog-1',
    dogName: 'Rex',
    classes: classes.map(cls => ({
      ...makeClass(cls),
      orderId: 'o1',
      registrationId: null,
    })),
    entryStatus: 'accepted' as MyShowDog['entryStatus'],
    orderIds: ['o1'],
  };
}

describe('formatCountdown', () => {
  it('words today, tomorrow and N days', () => {
    expect(formatCountdown(0)).toBe('Today');
    expect(formatCountdown(1)).toBe('Tomorrow');
    expect(formatCountdown(5)).toBe('In 5 days');
    expect(formatCountdown(-1)).toBeNull();
  });
});

describe('deriveShowCountdown', () => {
  // 2026-10-24 17:00Z is noon in Chicago.
  const now = new Date('2026-10-24T17:00:00Z');

  it('counts days to the earliest entered class', () => {
    const dog = dogWith(
      { trialDate: day('2026-10-29') },
      { id: 'c2', trialDate: day('2026-10-27') }
    );
    expect(deriveShowCountdown([dog], now)).toBe('In 3 days');
  });

  it('reads today and tomorrow in the trial zone, not the browser zone', () => {
    // 03:00Z on the 25th is still the 24th in Chicago and already the 25th in UTC.
    const late = new Date('2026-10-25T03:00:00Z');
    expect(deriveShowCountdown([dogWith({ trialDate: day('2026-10-24') })], late)).toBe('Today');
    expect(deriveShowCountdown([dogWith({ trialDate: day('2026-10-25') })], late)).toBe('Tomorrow');
  });

  it('skips a day already past and a class that is not entered', () => {
    const dog = dogWith(
      { trialDate: day('2026-10-20') },
      { id: 'c2', trialDate: day('2026-10-26'), status: 'withdrawn' },
      { id: 'c3', trialDate: day('2026-10-30') }
    );
    expect(deriveShowCountdown([dog], now)).toBe('In 6 days');
  });

  it('says nothing for a past or undated show', () => {
    expect(deriveShowCountdown([dogWith({ trialDate: day('2026-10-01') })], now)).toBeNull();
    expect(deriveShowCountdown([dogWith({ trialDate: undefined })], now)).toBeNull();
  });
});
