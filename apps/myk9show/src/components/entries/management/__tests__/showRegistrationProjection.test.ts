import { describe, expect, it } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import {
  buildShowRegistrationPage,
  getScopedShowRegistrationQueueCounts,
  getShowRegistrationQueueCounts,
  getVisiblePageSelectionState,
  paginateShowRegistrations,
  groupEntriesByShowRegistration,
  searchShowRegistrationGroups,
  selectShowRegistrationQueue,
} from '../showRegistrationProjection';

function entry(
  overrides: Partial<EntryManagementEntry> & Pick<EntryManagementEntry, 'id' | 'dogId' | 'dogName'>
): EntryManagementEntry {
  return {
    registrationId: 'registration-1',
    entryNumber: overrides.id,
    showId: 'show-1',
    ownerName: 'Alice Martin',
    ownerEmail: 'alice@example.com',
    handlerName: 'Alice Martin',
    classes: [
      {
        id: overrides.id,
        classId: `class-${overrides.id}`,
        name: 'Container Novice A',
        number: 'CN-A',
        fee: 25,
        status: 'entered',
      },
    ],
    totalFee: 25,
    paidAmount: 0,
    entryStatus: EntryStatus.PENDING,
    paymentStatus: PaymentStatus.PENDING,
    submittedAt: new Date('2026-07-12T13:42:00Z'),
    lastUpdated: new Date('2026-07-12T13:42:00Z'),
    ...overrides,
  };
}

describe('groupEntriesByShowRegistration', () => {
  it('renders one registration group while preserving each child Entry handler', () => {
    const groups = groupEntriesByShowRegistration([
      entry({ id: 'entry-1', dogId: 'dog-1', dogName: 'Poppy' }),
      entry({
        id: 'entry-2',
        dogId: 'dog-2',
        dogName: 'Scout',
        handlerName: 'Jamie Lee',
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      groupKey: 'registration-1',
      exhibitorName: 'Alice Martin',
      exhibitorEmail: 'alice@example.com',
      dogCount: 2,
      entryCount: 2,
    });
    expect(groups[0]?.entries.map(item => [item.dogName, item.handlerName])).toEqual([
      ['Poppy', 'Alice Martin'],
      ['Scout', 'Jamie Lee'],
    ]);
  });

  it('groups registration-less online Entries by payment intent and isolates keyless Entries', () => {
    const groups = groupEntriesByShowRegistration([
      entry({
        id: 'online-1',
        dogId: 'dog-1',
        dogName: 'Poppy',
        registrationId: '',
        stripePaymentIntentId: 'pi-shared',
      }),
      entry({
        id: 'online-2',
        dogId: 'dog-2',
        dogName: 'Scout',
        registrationId: '',
        stripePaymentIntentId: 'pi-shared',
      }),
      entry({
        id: 'mail-1',
        dogId: 'dog-3',
        dogName: 'Bean',
        registrationId: '',
      }),
      entry({
        id: 'mail-2',
        dogId: 'dog-4',
        dogName: 'Juni',
        registrationId: '',
      }),
    ]);

    expect(groups.map(group => [group.groupKey, group.entryCount])).toEqual([
      ['pi:pi-shared', 2],
      ['entry:mail-1', 1],
      ['entry:mail-2', 1],
    ]);
  });

  it('uses the same group predicates for queue counts and oldest-first results', () => {
    const groups = groupEntriesByShowRegistration([
      entry({
        id: 'review-1',
        dogId: 'dog-review',
        dogName: 'Poppy',
        registrationId: 'registration-review',
        submittedAt: new Date('2026-07-10T13:00:00Z'),
      }),
      entry({
        id: 'missing-1',
        dogId: 'dog-missing',
        dogName: 'Scout',
        registrationId: 'registration-mixed',
        entryStatus: EntryStatus.MISSING_INFO,
        rawEntryStatus: EntryStatus.MISSING_INFO,
        submittedAt: new Date('2026-07-11T13:00:00Z'),
      }),
      entry({
        id: 'payment-1',
        dogId: 'dog-payment',
        dogName: 'Scout',
        registrationId: 'registration-mixed',
        entryStatus: EntryStatus.ACCEPTED,
        paymentStatus: PaymentStatus.PENDING,
        submittedAt: new Date('2026-07-11T13:00:00Z'),
      }),
      entry({
        id: 'clear-1',
        dogId: 'dog-clear',
        dogName: 'Bean',
        registrationId: 'registration-clear',
        entryStatus: EntryStatus.ACCEPTED,
        paymentStatus: PaymentStatus.PAID_ONLINE,
        submittedAt: new Date('2026-07-09T13:00:00Z'),
      }),
    ]);

    expect(getShowRegistrationQueueCounts(groups)).toEqual({
      'needs-review': 1,
      'missing-information': 1,
      'payment-due': 1,
      all: 3,
    });
    expect(
      selectShowRegistrationQueue(groups, 'needs-review').map(group => group.groupKey)
    ).toEqual(['registration-review']);
    expect(selectShowRegistrationQueue(groups, 'missing-information')[0]?.groupKey).toBe(
      'registration-mixed'
    );
    expect(selectShowRegistrationQueue(groups, 'payment-due')[0]?.groupKey).toBe(
      'registration-mixed'
    );
    expect(selectShowRegistrationQueue(groups, 'all').map(group => group.groupKey)).toEqual([
      'registration-clear',
      'registration-review',
      'registration-mixed',
    ]);
    expect(
      groups.find(group => group.groupKey === 'registration-mixed')?.recommendedAction
    ).toEqual({
      id: 'resolve-missing-information',
      label: 'Resolve missing information',
      affectedEntryIds: ['missing-1'],
    });
  });

  it('paginates an already-filtered registration result set with an exact range', () => {
    const groups = groupEntriesByShowRegistration(
      Array.from({ length: 51 }, (_, index) =>
        entry({
          id: `entry-${index + 1}`,
          registrationId: `registration-${index + 1}`,
          dogId: `dog-${index + 1}`,
          dogName: `Dog ${index + 1}`,
          submittedAt: new Date(Date.UTC(2026, 6, 1, 12, index)),
        })
      )
    );

    expect(paginateShowRegistrations(groups, 1)).toMatchObject({
      total: 51,
      pageIndex: 1,
      pageCount: 2,
      rangeStart: 51,
      rangeEnd: 51,
    });
    expect(paginateShowRegistrations(groups, 1).items[0]?.groupKey).toBe('registration-51');
  });

  it.each([
    ['Alice', 'entry-search'],
    ['alice@example.com', 'entry-search'],
    ['Poppy', 'entry-search'],
    ['Jamie Lee', 'entry-search'],
    ['208', 'entry-search'],
    ['SW-1048', 'entry-search'],
    ['E-700', 'entry-search'],
    ['Interior Advanced', 'entry-search'],
  ])('finds a registration by "%s" and identifies its matching child Entry', (query, entryId) => {
    const groups = groupEntriesByShowRegistration([
      entry({
        id: entryId,
        dogId: 'dog-search',
        dogName: 'Poppy',
        handlerName: 'Jamie Lee',
        armbandNumber: '208',
        confirmationNumber: 'SW-1048',
        entryNumber: 'E-700',
        classes: [
          {
            id: entryId,
            classId: 'class-interior-advanced',
            name: 'Interior Advanced',
            number: 'IA',
            fee: 25,
            status: 'entered',
          },
        ],
      }),
      entry({
        id: 'entry-other',
        dogId: 'dog-other',
        dogName: 'Bean',
        ownerName: 'Priya Shah',
        ownerEmail: 'priya@example.com',
        handlerName: 'Priya Shah',
        registrationId: 'registration-other',
      }),
    ]);

    const results = searchShowRegistrationGroups(groups, query);

    expect(results).toHaveLength(1);
    expect(results[0]?.group.groupKey).toBe('registration-1');
    expect(results[0]?.matchingEntryIds).toEqual([entryId]);
  });

  it('applies queue and scope before pagination while search uses the whole show', () => {
    const groups = groupEntriesByShowRegistration([
      entry({
        id: 'trial-1-entry',
        registrationId: 'registration-trial-1',
        dogId: 'dog-trial-1',
        dogName: 'Poppy',
        classes: [
          {
            id: 'trial-1-entry',
            classId: 'class-trial-1',
            name: 'Container Novice A',
            number: 'CN-A',
            fee: 25,
            status: 'entered',
          },
        ],
      }),
      entry({
        id: 'trial-2-entry',
        registrationId: 'registration-trial-2',
        dogId: 'dog-trial-2',
        dogName: 'Scout',
        classes: [
          {
            id: 'trial-2-entry',
            classId: 'class-trial-2',
            name: 'Interior Advanced',
            number: 'IA',
            fee: 25,
            status: 'entered',
          },
        ],
      }),
    ]);

    const scoped = buildShowRegistrationPage(groups, {
      queue: 'needs-review',
      trialClassIds: ['class-trial-1'],
      pageIndex: 0,
    });
    const searched = buildShowRegistrationPage(groups, {
      queue: 'needs-review',
      trialClassIds: ['class-trial-1'],
      search: 'Scout',
      pageIndex: 0,
    });

    expect(scoped.page.items.map(group => group.groupKey)).toEqual(['registration-trial-1']);
    expect(searched.page.items.map(group => group.groupKey)).toEqual(['registration-trial-2']);
    expect(searched.matchingEntryIdsByGroup.get('registration-trial-2')).toEqual(['trial-2-entry']);
  });

  it('treats an explicitly selected Trial with no loaded Classes as an empty scope', () => {
    const groups = groupEntriesByShowRegistration([
      entry({ id: 'entry-1', dogId: 'dog-1', dogName: 'Poppy' }),
    ]);

    const scoped = buildShowRegistrationPage(groups, {
      queue: 'all',
      trialClassIds: [],
      pageIndex: 0,
    });

    expect(scoped.page.items).toEqual([]);
    expect(getScopedShowRegistrationQueueCounts(groups, null, [])).toEqual({
      'needs-review': 0,
      'missing-information': 0,
      'payment-due': 0,
      all: 0,
    });
  });

  it('derives select-all state from the visible page, not unseen registrations', () => {
    const groups = groupEntriesByShowRegistration([
      entry({ id: 'entry-1', registrationId: 'registration-1', dogId: 'dog-1', dogName: 'Poppy' }),
      entry({ id: 'entry-2', registrationId: 'registration-2', dogId: 'dog-2', dogName: 'Scout' }),
    ]);

    expect(getVisiblePageSelectionState([groups[0]!], new Set(['registration-2']))).toEqual({
      allSelected: false,
      partiallySelected: false,
    });
    expect(getVisiblePageSelectionState([groups[0]!], new Set(['registration-1']))).toEqual({
      allSelected: true,
      partiallySelected: false,
    });
  });

  it('projects, queues, paginates, and searches 1,000 child Entries locally', () => {
    const entries = Array.from({ length: 1_000 }, (_, index) =>
      entry({
        id: `entry-${index}`,
        registrationId: `registration-${index}`,
        dogId: `dog-${index}`,
        dogName: `Performance Dog ${index}`,
      })
    );
    const startedAt = performance.now();
    const groups = groupEntriesByShowRegistration(entries);
    const page = buildShowRegistrationPage(groups, {
      queue: 'needs-review',
      pageIndex: 0,
    });
    const searched = buildShowRegistrationPage(groups, {
      queue: 'needs-review',
      search: 'Performance Dog 999',
      pageIndex: 0,
    });
    const elapsed = performance.now() - startedAt;

    expect(groups).toHaveLength(1_000);
    expect(page.page.items).toHaveLength(50);
    expect(page.page.total).toBe(1_000);
    expect(searched.page.items.map(group => group.groupKey)).toEqual(['registration-999']);
    expect(elapsed).toBeLessThan(1_000);
  });
});
