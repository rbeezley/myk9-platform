import { describe, expect, it } from 'vitest';
import {
  normalizeEntryManagementCockpitParams,
  toggleQueueSelection,
  writeCockpitException,
  writeCockpitFocus,
  writeCockpitQueues,
  writeCockpitScope,
  writeCockpitSearch,
  writeCockpitTab,
  writeCockpitView,
} from '../entryManagementCockpitParams';

function params(value = ''): URLSearchParams {
  return new URLSearchParams(value);
}

describe('normalizeEntryManagementCockpitParams', () => {
  it.each([
    ['', { queues: ['needs-review'], tab: 'registrations', exception: 'move-ups' }, ''],
    [
      'attention=missing_information',
      { queues: ['missing-information'], tab: 'registrations', exception: 'move-ups' },
      'queue=missing-information',
    ],
    [
      'payment=pending&attention=accepted',
      { queues: ['payment-due'], tab: 'registrations', exception: 'move-ups' },
      'queue=payment-due',
    ],
    [
      'entryTab=accepted',
      { queues: ['all'], tab: 'registrations', exception: 'move-ups' },
      'queue=all',
    ],
    [
      'tab=pulls&trial=trial-1&class=class-1',
      { queues: ['needs-review'], tab: 'exceptions', exception: 'pulls' },
      'tab=exceptions&exception=pulls',
    ],
    [
      'tab=waitlist',
      { queues: ['needs-review'], tab: 'exceptions', exception: 'waitlist' },
      'tab=exceptions&exception=waitlist',
    ],
    // MYK9-754: waitlisted dogs live in waitlist_entries, never in an entries
    // status, so a "waitlist" attention link opens the Waitlist sub-tab rather
    // than filtering entry rows that can never match.
    [
      'attention=waitlist',
      { queues: ['needs-review'], tab: 'exceptions', exception: 'waitlist' },
      'tab=exceptions&exception=waitlist',
    ],
    [
      'attention=move-ups',
      { queues: ['needs-review'], tab: 'exceptions', exception: 'move-ups' },
      'tab=exceptions',
    ],
    [
      'tab=exceptions&queue=pulled',
      { queues: ['needs-review'], tab: 'exceptions', exception: 'pulls' },
      'tab=exceptions&exception=pulls',
    ],
    [
      'attention=pulled',
      { queues: ['needs-review'], tab: 'exceptions', exception: 'pulls' },
      'tab=exceptions&exception=pulls',
    ],
    [
      'entryTab=scratches',
      { queues: ['needs-review'], tab: 'exceptions', exception: 'pulls' },
      'tab=exceptions&exception=pulls',
    ],
    [
      'tab=exceptions&exception=waitlist',
      { queues: ['needs-review'], tab: 'exceptions', exception: 'waitlist' },
      'tab=exceptions&exception=waitlist',
    ],
    [
      'attention=pending&person=Poppy',
      { queues: ['needs-review'], tab: 'registrations', exception: 'move-ups', search: 'Poppy' },
      'search=Poppy',
    ],
    [
      'queue=unsupported',
      { queues: ['needs-review'], tab: 'registrations', exception: 'move-ups' },
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
    next = writeCockpitQueues(next, ['payment-due']);
    next = writeCockpitSearch(next, 'Poppy');
    next = writeCockpitFocus(next, 'registration-1');

    expect(next.toString()).toBe(
      'trial=trial-1&class=class-1&queue=payment-due&search=Poppy&registration=registration-1'
    );
    expect(writeCockpitQueues(next, ['needs-review']).has('queue')).toBe(false);
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
    expect(normalized.state).toMatchObject({ trialIds: ['t1'], classIds: ['c1'] });
    expect(normalized.state).not.toHaveProperty('density');
  });

  it('writes scope and canonical exception navigation while clearing incompatible focus', () => {
    const scoped = writeCockpitScope(params('registration=r1'), ['trial-1'], ['class-1']);
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
  describe('writeCockpitView', () => {
    it('routes a registration queue id through the Registrations tab', () => {
      const next = writeCockpitView(params('tab=exceptions&exception=waitlist'), 'payment-due');
      expect(next.toString()).toBe('queue=payment-due');
      expect(normalizeEntryManagementCockpitParams(next).state.queues).toEqual(['payment-due']);
    });

    it('routes an exception id to the Exceptions workspace', () => {
      const next = writeCockpitView(params('queue=payment-due'), 'pulls');
      expect(next.toString()).toBe('tab=exceptions&exception=pulls');
      expect(normalizeEntryManagementCockpitParams(next).state.exception).toBe('pulls');
    });

    it('preserves the other registration filters when switching queues', () => {
      const next = writeCockpitView(params('trial=t1&search=Poppy'), 'all');
      expect(next.toString()).toBe('trial=t1&search=Poppy&queue=all');
    });
  });

  // docs/plan-entries-filter-button.md, settled rules 1, 4, 9 and 12.
  describe('several queues, trials and classes', () => {
    it.each([
      ['queue=payment-due,needs-review', ['needs-review', 'payment-due'], 'queue=needs-review%2Cpayment-due'],
      ['queue=needs-review,needs-review,bogus', ['needs-review'], ''],
      ['queue=payment-due,all', ['all'], 'queue=all'],
      ['queue=bogus&payment=pending', ['payment-due'], 'queue=payment-due'],
    ])('reads "%s" in menu order, All winning', (raw, queues, query) => {
      const normalized = normalizeEntryManagementCockpitParams(params(raw));
      expect(normalized.state.queues).toEqual(queues);
      expect(normalized.params.toString()).toBe(query);
      // Canonical: normalizing again changes nothing, so the replace effect settles.
      expect(normalizeEntryManagementCockpitParams(normalized.params).params.toString()).toBe(query);
    });

    it('reads trial and class lists, and a single value as a list of one', () => {
      const normalized = normalizeEntryManagementCockpitParams(params('trial=t1,t2&class=c1'));
      expect(normalized.state).toMatchObject({ trialIds: ['t1', 't2'], classIds: ['c1'] });
    });

    it('keeps unknown trial and class ids until their lists have loaded, then drops them', () => {
      const raw = params('trial=t1,gone&class=c1,old');
      expect(normalizeEntryManagementCockpitParams(raw).state).toMatchObject({
        trialIds: ['t1', 'gone'],
        classIds: ['c1', 'old'],
      });

      const loaded = normalizeEntryManagementCockpitParams(raw, {
        knownTrialIds: new Set(['t1']),
        knownClassIds: new Set(['c1']),
      });
      expect(loaded.state).toMatchObject({ trialIds: ['t1'], classIds: ['c1'] });
      expect(loaded.params.toString()).toBe('trial=t1&class=c1');
    });

    it('writes trials and classes in one step, and keeps a class with no trial', () => {
      const next = writeCockpitScope(params('trial=t1&class=c1'), [], ['c1', 'c2']);
      expect(next.toString()).toBe('class=c1%2Cc2');
      expect(normalizeEntryManagementCockpitParams(next).state.classIds).toEqual(['c1', 'c2']);
    });

    it('writes the default queue as no param, and an empty list as All', () => {
      expect(writeCockpitQueues(params('queue=all'), ['needs-review']).toString()).toBe('');
      expect(writeCockpitQueues(params(), []).toString()).toBe('queue=all');
    });
  });

  describe('toggleQueueSelection', () => {
    it.each([
      [['needs-review'], 'payment-due', ['needs-review', 'payment-due']],
      [['needs-review', 'payment-due'], 'needs-review', ['payment-due']],
      [['payment-due'], 'payment-due', ['all']],
      [['needs-review', 'payment-due'], 'all', ['all']],
      [['all'], 'missing-information', ['missing-information']],
      [['all'], 'all', ['all']],
    ] as const)('%j toggling %s gives %j', (current, queue, expected) => {
      expect(toggleQueueSelection(current, queue)).toEqual(expected);
    });
  });
});
