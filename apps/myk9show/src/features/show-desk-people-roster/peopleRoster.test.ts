import { describe, expect, it } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { buildPeopleRoster, filterPeopleRoster, formatTrialIdentity } from './peopleRoster';

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

  // MYK9-632: 'withdrawn' became its own class status instead of folding onto
  // 'scratched'. The roster's terminal set is spelled as class statuses, so a
  // new member that was not added there would put a withdrawn dog back on the
  // show desk's check-in list.
  it('keeps a withdrawn class row ineligible, exactly as a pulled one', () => {
    const roster = buildPeopleRoster({
      entries: [
        entry({
          classes: [
            {
              id: 'class-1',
              name: 'Container Novice A',
              number: '1',
              fee: 25,
              status: 'withdrawn',
              checkInStatus: 'no-status',
            },
            {
              id: 'class-2',
              name: 'Interior Novice A',
              number: '2',
              fee: 25,
              status: 'scratched',
              checkInStatus: 'no-status',
            },
          ],
        }),
      ],
      presence: [],
    });

    expect(roster[0]?.eligibleCount).toBe(0);
    expect(roster[0]?.classRows).toHaveLength(2);
    for (const row of roster[0]?.classRows ?? []) {
      expect(row.eligibleForCheckIn).toBe(false);
    }
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
          timezone: 'America/Chicago',
        },
      ],
      currentDate: new Date('2026-07-08T15:00:00.000Z'),
    });

    expect(roster[0]?.eligibleCount).toBe(0);
    expect(roster[0]?.classRows[0]).toEqual(
      expect.objectContaining({
        eligibleForCheckIn: false,
        statusLabel: 'Not today',
      })
    );
  });

  it('keeps rows ineligible when today is known but class date metadata is missing', () => {
    const roster = buildPeopleRoster({
      entries: [entry()],
      presence: [],
      currentDate: new Date('2026-07-08T15:00:00.000Z'),
    });

    expect(roster[0]?.eligibleCount).toBe(0);
    expect(roster[0]?.classRows[0]).toEqual(
      expect.objectContaining({
        eligibleForCheckIn: false,
        statusLabel: 'Date unavailable',
      })
    );
  });

  it('evaluates current show day per class timezone', () => {
    const roster = buildPeopleRoster({
      entries: [
        entry(),
        entry({
          id: 'entry-2',
          classes: [
            {
              id: 'class-2',
              name: 'Exterior Novice A',
              number: '2',
              fee: 25,
              status: 'entered',
              checkInStatus: 'no-status',
            },
          ],
        }),
      ],
      presence: [],
      classes: [
        {
          id: 'class-1',
          name: 'Container Novice A',
          trialDate: '2026-07-07',
          timezone: 'America/Los_Angeles',
        },
        {
          id: 'class-2',
          name: 'Exterior Novice A',
          trialDate: '2026-07-07',
          timezone: 'America/New_York',
        },
      ],
      currentDate: new Date('2026-07-08T06:30:00.000Z'),
    });

    expect(roster[0]?.eligibleCount).toBe(1);
    expect(roster[0]?.classRows.map(row => [row.className, row.statusLabel])).toEqual([
      ['Container Novice A', 'Not checked in'],
      ['Exterior Novice A', 'Not today'],
    ]);
  });

  it('uses handler identity for show-day rows while keeping owner names searchable', () => {
    const roster = buildPeopleRoster({
      entries: [
        entry({
          handlerName: 'Casey Handler',
          handlerId: 'handler-1',
          handlerAuthUserId: 'auth-handler',
          ownerName: 'Alice Owner',
          ownerId: 'owner-1',
          ownerAuthUserId: 'auth-owner',
        }),
      ],
      presence: [
        {
          userId: 'auth-handler',
          name: 'Casey Handler',
          role: 'exhibitor',
          location: { page: '/shows/show-1' },
          activity: 'viewing',
          ts: 1,
        },
      ],
    });

    expect(roster[0]).toEqual(
      expect.objectContaining({
        id: 'handler-1',
        name: 'Casey Handler',
        authUserId: 'auth-handler',
      })
    );
    expect(roster[0]?.presence?.userId).toBe('auth-handler');
    expect(filterPeopleRoster(roster, 'alice owner', 'all')).toHaveLength(1);
  });

  it('does not message the owner from a handler-labeled row when handler auth is missing', () => {
    const roster = buildPeopleRoster({
      entries: [
        entry({
          handlerName: 'Casey Handler',
          handlerId: 'handler-1',
          handlerAuthUserId: null,
          ownerName: 'Alice Owner',
          ownerId: 'owner-1',
          ownerAuthUserId: 'auth-owner',
        }),
      ],
      presence: [],
    });

    expect(roster[0]).toEqual(
      expect.objectContaining({
        id: 'handler-1',
        name: 'Casey Handler',
        authUserId: null,
      })
    );
  });

  it('ignores placeholder handler names for owner-only rows', () => {
    const roster = buildPeopleRoster({
      entries: [
        entry({
          handlerName: 'Not specified',
          handlerId: null,
          handlerAuthUserId: null,
          ownerName: 'Alice Owner',
          ownerId: 'owner-1',
          ownerAuthUserId: 'auth-owner',
        }),
      ],
      presence: [],
    });

    expect(roster[0]).toEqual(
      expect.objectContaining({
        id: 'owner-1',
        name: 'Alice Owner',
        authUserId: 'auth-owner',
      })
    );
  });

  /**
   * MYK9-825: a UKC dog entered in the same-shaped class ("Vehicle Novice")
   * in two same-day trials rendered as two IDENTICAL rows -- no section, no
   * trial -- so a secretary could not tell which "Check in" checked in which
   * entry. The row must show both the section and the trial.
   */
  it('distinguishes two same-day trials entered by the same dog in the same class shape', () => {
    const roster = buildPeopleRoster({
      entries: [
        entry({
          id: 'entry-trial-1',
          classes: [
            {
              id: 'class-t1',
              name: 'Vehicle Novice',
              number: '1',
              fee: 30,
              status: 'entered',
              checkInStatus: 'no-status',
            },
          ],
        }),
        entry({
          id: 'entry-trial-2',
          classes: [
            {
              id: 'class-t2',
              name: 'Vehicle Novice',
              number: '1',
              fee: 30,
              status: 'entered',
              checkInStatus: 'no-status',
            },
          ],
        }),
      ],
      presence: [],
      classes: [
        {
          id: 'class-t1',
          name: 'Vehicle Novice',
          trialId: 'trial-1',
          element: 'Vehicle',
          level: 'Novice',
          section: 'A',
          ring: 'Trial 1',
        },
        {
          id: 'class-t2',
          name: 'Vehicle Novice',
          trialId: 'trial-2',
          element: 'Vehicle',
          level: 'Novice',
          section: 'B',
          ring: 'Trial 2',
        },
      ],
    });

    expect(roster[0]?.classRows).toHaveLength(2);
    const [row1, row2] = roster[0]!.classRows;
    expect(row1).not.toEqual(row2);
    expect(row1?.className).toBe('Vehicle Novice A');
    expect(row1?.ring).toBe('Trial 1');
    expect(row2?.className).toBe('Vehicle Novice B');
    expect(row2?.ring).toBe('Trial 2');
  });
});

describe('formatTrialIdentity', () => {
  /**
   * MYK9-825: ShowDeskPeopleRoster built `ring` from `trialName || trialNumber`
   * — whichever came first — so two same-day trials sharing a trial NAME
   * (a real, common case: the show wizard's own default names trials
   * "Trial 1", "Trial 2") produced identical, indistinguishable rows.
   */
  it('combines name and number when they differ, so same-named same-day trials stay distinguishable', () => {
    expect(formatTrialIdentity('Saturday A', '1')).toBe('Saturday A (1)');
    expect(formatTrialIdentity('Saturday A', '2')).toBe('Saturday A (2)');
  });

  it('does not repeat the number when the name already reads as that trial', () => {
    // The common case: the wizard's own default trial name IS "Trial N".
    expect(formatTrialIdentity('Trial 1', '1')).toBe('Trial 1');
  });

  /**
   * `trial_number` is free text the show-creation wizard sometimes writes as
   * an already-worded identity, not a bare ordinal (seed-demo.sql's real UKC
   * demo trial — the exact fixture behind MYK9-819's dress rehearsal — has
   * name='UKC Nosework Trial', trial_number='UKC-Nosework'). Prepending the
   * literal word "Trial" to it reproduces the doubled/garbled label
   * `trialLabel.ts` (MYK9-704) was written to prevent ("Trial Trial 1",
   * "Trial Saturday T 2") — that file's rule is "never prefix or combine";
   * this function combines by design, so it must at least never prefix.
   */
  it('never prepends the literal word "Trial" to a number that is already worded text', () => {
    expect(formatTrialIdentity('UKC Nosework Trial', 'UKC-Nosework')).toBe(
      'UKC Nosework Trial (UKC-Nosework)'
    );
  });

  it('falls back to name-only or number-only when the other is missing', () => {
    expect(formatTrialIdentity('Saturday A', '')).toBe('Saturday A');
    expect(formatTrialIdentity('', '2')).toBe('2');
  });

  it('returns null when both are missing', () => {
    expect(formatTrialIdentity('', '')).toBeNull();
    expect(formatTrialIdentity(null, undefined)).toBeNull();
  });
});
