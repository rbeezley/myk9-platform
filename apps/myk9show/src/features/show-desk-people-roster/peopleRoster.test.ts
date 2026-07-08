import { describe, expect, it } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { buildPeopleRoster, filterPeopleRoster } from './peopleRoster';

function entry(overrides: Partial<EntryManagementEntry> = {}): EntryManagementEntry {
  return {
    id: 'entry-1',
    registrationId: 'reg-1',
    entryNumber: '114',
    showId: 'show-1',
    dogId: 'dog-1',
    dogName: 'Poppy',
    ownerName: 'Alice Martin',
    ownerEmail: 'alice@example.com',
    handlerName: 'Alice Martin',
    handlerId: 'person-1',
    handlerAuthUserId: 'auth-1',
    ownerId: 'person-1',
    ownerAuthUserId: 'auth-1',
    classes: [
      {
        id: 'class-1',
        name: 'Container Novice A',
        number: '1',
        fee: 25,
        status: 'entered',
        checkInStatus: 'no-status',
      },
    ],
    totalFee: 25,
    paidAmount: 25,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date('2026-07-08T09:00:00.000Z'),
    lastUpdated: new Date('2026-07-08T09:00:00.000Z'),
    armbandNumber: '114',
    ...overrides,
  };
}

describe('peopleRoster', () => {
  it('groups entries by exhibitor and includes presence, armband, dog, and class lookup facts', () => {
    const roster = buildPeopleRoster({
      entries: [
        entry(),
        entry({
          id: 'entry-2',
          dogId: 'dog-2',
          dogName: 'Juniper',
          entryNumber: '115',
          armbandNumber: '115',
          classes: [
            {
              id: 'class-2',
              name: 'Interior Novice A',
              number: '2',
              fee: 25,
              status: 'entered',
              checkInStatus: 'checked-in',
            },
          ],
        }),
      ],
      presence: [
        {
          userId: 'auth-1',
          name: 'Alice Martin',
          role: 'exhibitor',
          location: { page: '/shows/show-1' },
          activity: 'viewing',
          ts: 1,
        },
      ],
      classes: [
        { id: 'class-1', name: 'Container Novice A', time: '9:00 AM', trialDate: '2026-07-08' },
      ],
    });

    expect(roster).toHaveLength(1);
    expect(roster[0]).toEqual(
      expect.objectContaining({
        name: 'Alice Martin',
        authUserId: 'auth-1',
        summary: '2 dogs - 2 classes',
        badge: '1 due',
        eligibleCount: 1,
      })
    );
    expect(roster[0]?.presence?.userId).toBe('auth-1');
    expect(roster[0]?.classRows[0]).toEqual(
      expect.objectContaining({
        armband: '114',
        dogName: 'Poppy',
        className: 'Container Novice A',
        time: '9:00 AM',
        eligibleForCheckIn: true,
      })
    );
  });

  it('searches by exhibitor, dog, class, and armband', () => {
    const roster = buildPeopleRoster({
      entries: [
        entry(),
        entry({
          id: 'entry-3',
          registrationId: 'reg-3',
          dogId: 'dog-3',
          dogName: 'Cedar',
          ownerName: 'Bob Chen',
          handlerName: 'Bob Chen',
          ownerId: 'person-2',
          ownerAuthUserId: 'auth-2',
          handlerId: 'person-2',
          handlerAuthUserId: 'auth-2',
          entryNumber: '208',
          armbandNumber: '208',
        }),
      ],
      presence: [],
    });

    expect(filterPeopleRoster(roster, 'bob', 'all')).toHaveLength(1);
    expect(filterPeopleRoster(roster, 'poppy', 'all')[0]?.name).toBe('Alice Martin');
    expect(filterPeopleRoster(roster, '208', 'all')[0]?.name).toBe('Bob Chen');
    expect(filterPeopleRoster(roster, 'missing', 'all')).toHaveLength(0);
  });

  it('filters needs check-in and online views', () => {
    const roster = buildPeopleRoster({
      entries: [
        entry(),
        entry({
          id: 'entry-3',
          registrationId: 'reg-3',
          dogId: 'dog-3',
          dogName: 'Cedar',
          ownerName: 'Bob Chen',
          handlerName: 'Bob Chen',
          ownerId: 'person-2',
          ownerAuthUserId: 'auth-2',
          handlerId: 'person-2',
          handlerAuthUserId: 'auth-2',
          entryNumber: '208',
          armbandNumber: '208',
          classes: [
            {
              id: 'class-3',
              name: 'Exterior Novice A',
              number: '3',
              fee: 25,
              status: 'entered',
              checkInStatus: 'checked-in',
            },
          ],
        }),
      ],
      presence: [
        {
          userId: 'auth-2',
          name: 'Bob Chen',
          role: 'exhibitor',
          location: { page: '/shows/show-1' },
          activity: 'viewing',
          ts: 1,
        },
      ],
    });

    expect(filterPeopleRoster(roster, '', 'needs-check-in').map(person => person.name)).toEqual([
      'Alice Martin',
    ]);
    expect(filterPeopleRoster(roster, '', 'online').map(person => person.name)).toEqual([
      'Bob Chen',
    ]);
  });

  it('marks missing armbands and inactive rows without check-in eligibility', () => {
    const roster = buildPeopleRoster({
      entries: [
        entry({
          armbandNumber: undefined,
          entryNumber: '',
          entryStatus: EntryStatus.WAITLIST,
          classes: [
            {
              id: 'class-1',
              name: 'Container Novice A',
              number: '1',
              fee: 25,
              status: 'entered',
              checkInStatus: 'no-status',
            },
          ],
        }),
      ],
      presence: [],
    });

    expect(roster[0]?.badge).toBe('WL');
    expect(roster[0]?.eligibleCount).toBe(0);
    expect(roster[0]?.classRows[0]).toEqual(
      expect.objectContaining({
        armband: null,
        eligibleForCheckIn: false,
        statusLabel: 'Waitlist',
      })
    );
  });

  it('keeps future-day classes ineligible when a current show day is supplied', () => {
    const roster = buildPeopleRoster({
      entries: [entry()],
      presence: [],
      classes: [
        {
          id: 'class-1',
          name: 'Container Novice A',
          trialDate: '2026-07-09',
        },
      ],
      today: '2026-07-08',
    });

    expect(roster[0]?.eligibleCount).toBe(0);
    expect(roster[0]?.classRows[0]).toEqual(
      expect.objectContaining({
        eligibleForCheckIn: false,
        statusLabel: 'Not today',
      })
    );
  });
});
