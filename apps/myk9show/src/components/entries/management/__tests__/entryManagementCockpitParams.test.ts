import { describe, expect, it } from 'vitest';
import {
  normalizeEntryManagementCockpitParams,
  writeCockpitException,
  writeCockpitFocus,
  writeCockpitQueue,
  writeCockpitScope,
  writeCockpitSearch,
  writeCockpitTab,
} from '../entryManagementCockpitParams';

function params(value = ''): URLSearchParams {
  return new URLSearchParams(value);
}

describe('normalizeEntryManagementCockpitParams', () => {
  it.each([
    ['', { queue: 'needs-review', tab: 'registrations', exception: 'move-ups' }, ''],
    [
      'attention=missing_information',
      { queue: 'missing-information', tab: 'registrations', exception: 'move-ups' },
      'queue=missing-information',
    ],
    [
      'payment=pending&attention=accepted',
      { queue: 'payment-due', tab: 'registrations', exception: 'move-ups' },
      'queue=payment-due',
    ],
    [
      'entryTab=accepted',
      { queue: 'all', tab: 'registrations', exception: 'move-ups' },
      'queue=all',
    ],
    [
      'tab=pulls&trial=trial-1&class=class-1',
      { queue: 'needs-review', tab: 'exceptions', exception: 'pulls' },
      'tab=exceptions&exception=pulls',
    ],
    [
      'tab=waitlist',
      { queue: 'needs-review', tab: 'exceptions', exception: 'waitlist' },
      'tab=exceptions&exception=waitlist',
    ],
    [
      'attention=move-ups',
      { queue: 'needs-review', tab: 'exceptions', exception: 'move-ups' },
      'tab=exceptions',
    ],
    [
      'tab=exceptions&queue=pulled',
      { queue: 'needs-review', tab: 'exceptions', exception: 'pulls' },
      'tab=exceptions&exception=pulls',
    ],
    [
      'entryTab=scratches',
      { queue: 'needs-review', tab: 'exceptions', exception: 'pulls' },
      'tab=exceptions&exception=pulls',
    ],
    [
      'tab=exceptions&exception=waitlist',
      { queue: 'needs-review', tab: 'exceptions', exception: 'waitlist' },
      'tab=exceptions&exception=waitlist',
    ],
    [
      'attention=pending&person=Poppy',
      { queue: 'needs-review', tab: 'registrations', exception: 'move-ups', search: 'Poppy' },
      'search=Poppy',
    ],
    [
      'queue=unsupported',
      { queue: 'needs-review', tab: 'registrations', exception: 'move-ups' },
      '',
    ],
  ])('normalizes legacy "%s" into the cockpit contract', (raw, expectedState, expectedQuery) => {
    const normalized = normalizeEntryManagementCockpitParams(params(raw));

    expect(normalized.state).toMatchObject(expectedState);
    expect(normalized.params.toString()).toBe(expectedQuery);
  });

  it('maps a valid legacy child Entry focus to its parent registration and rejects unknown focus', () => {
    const entryToRegistration = new Map([['entry-1', 'registration-1']]);
    const validRegistrationKeys = new Set(['registration-1']);

    expect(
      normalizeEntryManagementCockpitParams(params('entry=entry-1'), {
        entryToRegistration,
        validRegistrationKeys,
      }).params.toString()
    ).toBe('registration=registration-1');
    expect(
      normalizeEntryManagementCockpitParams(params('registration=registration-other'), {
        entryToRegistration,
        validRegistrationKeys,
      }).params.toString()
    ).toBe('');
  });

  it('writes queue, search, and focus without disturbing supported scope', () => {
    let next = params('trial=trial-1&class=class-1');
    next = writeCockpitQueue(next, 'payment-due');
    next = writeCockpitSearch(next, 'Poppy');
    next = writeCockpitFocus(next, 'registration-1');

    expect(next.toString()).toBe(
      'trial=trial-1&class=class-1&queue=payment-due&search=Poppy&registration=registration-1'
    );
    expect(writeCockpitQueue(next, 'needs-review').has('queue')).toBe(false);
    expect(writeCockpitSearch(next, '').has('search')).toBe(false);
    expect(writeCockpitFocus(next, null).has('registration')).toBe(false);
  });

  it('drops retired presentation values while preserving supported density and scope', () => {
    const normalized = normalizeEntryManagementCockpitParams(
      params('mode=day-of&view=cards&display=show-day&density=compact&trial=t1&class=c1')
    );

    expect(normalized.params.toString()).toBe('density=compact&trial=t1&class=c1');
    expect(normalized.state).toMatchObject({ density: 'compact', trialId: 't1', classId: 'c1' });
  });

  it('writes scope and canonical exception navigation while clearing incompatible focus', () => {
    const scoped = writeCockpitScope(params('registration=r1'), 'trial-1', 'class-1');
    expect(scoped.toString()).toBe('trial=trial-1&class=class-1');

    const exceptions = writeCockpitException(scoped, 'waitlist');
    expect(exceptions.toString()).toBe('tab=exceptions&exception=waitlist');

    expect(writeCockpitTab(exceptions, 'registrations').toString()).toBe('');
  });
});
