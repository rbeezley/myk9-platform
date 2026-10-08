import { describe, expect, it } from 'vitest';
import {
  entryManagementViewId,
  normalizeEntryManagementCockpitParams,
  writeCockpitException,
  writeCockpitFocus,
  writeCockpitQueue,
  writeCockpitScope,
  writeCockpitSearch,
  writeCockpitTab,
  widenCockpitFilters,
  writeCockpitView,
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
    // MYK9-754: waitlisted dogs live in waitlist_entries, never in an entries
    // status, so a "waitlist" attention link opens the Waitlist sub-tab rather
    // than filtering entry rows that can never match.
    [
      'attention=waitlist',
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
      'attention=pulled',
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

  it('preserves an in-progress multiword search instead of trimming each keystroke', () => {
    const next = writeCockpitSearch(params(), 'Alice ');
    const normalized = normalizeEntryManagementCockpitParams(next);

    expect(next.get('search')).toBe('Alice ');
    expect(normalized.state.search).toBe('Alice ');
    expect(normalized.params.get('search')).toBe('Alice ');
  });

  it('drops retired presentation values, density included, while preserving scope', () => {
    const normalized = normalizeEntryManagementCockpitParams(
      params('mode=day-of&view=cards&display=show-day&density=compact&trial=t1&class=c1')
    );

    expect(normalized.params.toString()).toBe('trial=t1&class=c1');
    expect(normalized.state).toMatchObject({ trialId: 't1', classId: 'c1' });
    expect(normalized.state).not.toHaveProperty('density');
  });

  it('writes scope and canonical exception navigation while clearing incompatible focus', () => {
    const scoped = writeCockpitScope(params('registration=r1'), 'trial-1', 'class-1');
    expect(scoped.toString()).toBe('trial=trial-1&class=class-1');

    const exceptions = writeCockpitException(scoped, 'waitlist');
    expect(exceptions.toString()).toBe('tab=exceptions&exception=waitlist');

    expect(writeCockpitTab(exceptions, 'registrations').toString()).toBe('');
  });

  // MYK9-906: the Payment status filter was cut; a stale link must not narrow the list.
  describe('retired paymentStatus param', () => {
    it('is ignored and dropped from the normalized URL', () => {
      const normalized = normalizeEntryManagementCockpitParams(params('paymentStatus=paid_online'));
      expect(normalized.state).not.toHaveProperty('paymentStatus');
      expect(normalized.params.toString()).toBe('');
    });
  });

  // MYK9-795: one setter for the unified `ListViewTabs` row.
  describe('writeCockpitView / entryManagementViewId', () => {
    it('routes a registration queue id through the Registrations tab', () => {
      const next = writeCockpitView(params('tab=exceptions&exception=waitlist'), 'payment-due');
      expect(next.toString()).toBe('queue=payment-due');
      expect(entryManagementViewId(normalizeEntryManagementCockpitParams(next).state)).toBe(
        'payment-due'
      );
    });

    it('routes an exception id to the Exceptions workspace', () => {
      const next = writeCockpitView(params('queue=payment-due'), 'pulls');
      expect(next.toString()).toBe('tab=exceptions&exception=pulls');
      expect(entryManagementViewId(normalizeEntryManagementCockpitParams(next).state)).toBe(
        'pulls'
      );
    });

    it('preserves the other registration filters when switching queues', () => {
      const next = writeCockpitView(params('trial=t1&search=Poppy'), 'all');
      expect(next.toString()).toBe('trial=t1&search=Poppy&queue=all');
    });
  });
});

describe('widenCockpitFilters', () => {
  it('widens the queue first and keeps trial, class and search', () => {
    const next = widenCockpitFilters(params('trial=t&class=c&search=bob'), {
      queue: 'needs-review',
    });
    expect(next.toString()).toBe('trial=t&class=c&search=bob&queue=all');
  });

  it('only once the queue is all does it drop the scope and search', () => {
    const next = widenCockpitFilters(params('queue=all&trial=t&class=c&search=bob'), {
      queue: 'all',
    });
    expect(next.toString()).toBe('queue=all');
  });
});
