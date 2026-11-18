import { describe, expect, it } from 'vitest';
import {
  clubPaymentsHref,
  clubPayoutsBlockPublish,
  clubPayoutsMessage,
  deriveClubPayoutsState,
} from '../clubPayoutsState';

const account = (onboarding_complete: boolean, payouts_enabled: boolean) => ({
  onboarding_complete,
  payouts_enabled,
});

describe('deriveClubPayoutsState (MYK9-2164)', () => {
  it.each([
    ['enabled', true, account(true, true), false, 'ready'],
    ['in review', true, account(true, false), false, 'in-review'],
    ['incomplete', true, account(false, false), false, 'incomplete'],
    ['not connected', true, null, false, 'not-connected'],
    ['demo with no account', true, null, true, 'demo'],
    ['account not read yet', false, undefined, false, 'unknown'],
    ['demo flag not read, no payouts', true, null, undefined, 'unknown'],
    ['demo flag not read, payouts on', true, account(true, true), undefined, 'ready'],
  ] as const)('%s', (_name, accountResolved, acct, isDemo, expected) => {
    expect(deriveClubPayoutsState({ accountResolved, account: acct, isDemo })).toBe(expected);
  });
});

describe('club payouts copy and link', () => {
  it('blocks publishing only for a state that is known to lack payouts', () => {
    expect(
      ['not-connected', 'incomplete', 'in-review'].every(s => clubPayoutsBlockPublish(s as never))
    ).toBe(true);
    expect(['ready', 'demo', 'unknown'].some(s => clubPayoutsBlockPublish(s as never))).toBe(false);
  });

  it('links the club Payments tab', () => {
    expect(clubPaymentsHref('c1')).toBe('/clubs/c1?tab=payments');
  });

  it('uses plain words, names the Payments tab and a club admin, and has no em dash', () => {
    for (const state of ['not-connected', 'incomplete'] as const) {
      const text = clubPayoutsMessage(state);
      expect(text).toMatch(/bank account/);
      expect(text).toMatch(/Payments tab/);
      expect(text).toMatch(/A club admin can do it if you can't/);
      expect(text).not.toMatch(/—/);
    }
    expect(clubPayoutsMessage('in-review')).toMatch(/usually a day or two/);
  });
});
