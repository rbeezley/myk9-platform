import { describe, expect, it } from 'vitest';
import type { CheckInStatus } from '@myk9/core';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { buildCheckInDeskPeople, groupCheckInDeskDogs } from './checkInDeskModel';
import type { PeopleRosterClassInfo } from './peopleRoster';
import { statusBeforeLatestPull } from './deskStatus';

const NOW = new Date('2026-07-08T16:00:00.000Z');

const CLASSES: PeopleRosterClassInfo[] = [
  { id: 'class-1', name: 'Container Novice A', time: '09:00', trialId: 'trial-1' },
  { id: 'class-2', name: 'Interior Novice A', time: '10:30', trialId: 'trial-1' },
  { id: 'class-3', name: 'Exterior Novice A', time: '13:00', trialId: 'trial-2' },
].map(cls => ({ ...cls, trialDate: '2026-07-08', timezone: 'America/New_York' }));

/** One entry row is one class (EntryClass.id is the entry row id). */
function entry(
  id: string,
  classId: string,
  checkInStatus: CheckInStatus,
  overrides: Partial<EntryManagementEntry> = {}
): EntryManagementEntry {
  return {
    id,
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
      { id, classId, name: classId, number: '1', fee: 25, status: 'entered', checkInStatus },
    ],
    totalFee: 25,
    paidAmount: 25,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: NOW,
    lastUpdated: NOW,
    armbandNumber: '114',
    ...overrides,
  };
}

function rowsOf(entries: EntryManagementEntry[]) {
  return buildCheckInDeskPeople(entries, CLASSES, NOW).flatMap(person => person.classRows);
}

describe('groupCheckInDeskDogs', () => {
  it('gives a dog one card per armband, and leaves Conflict and underway runs out of one tap', () => {
    const [person] = buildCheckInDeskPeople(
      [
        entry('e1', 'class-1', 'no-status'),
        entry('e2', 'class-2', 'conflict'),
        entry('e3', 'class-3', 'at-gate', { armbandNumber: '214' }),
      ],
      CLASSES,
      NOW
    );
    const dogs = groupCheckInDeskDogs(person!);

    expect(dogs.map(dog => [dog.armband, dog.rows.map(row => row.entryId)])).toEqual([
      ['114', ['e1', 'e2']],
      ['214', ['e3']],
    ]);
    expect(dogs[0]!.pendingEntryIds).toEqual(['e1']);
    expect(dogs[1]!.pendingEntryIds).toEqual([]);
  });
});

describe('deskStatusEditable', () => {
  it.each([
    ['no-status', true],
    ['checked-in', true],
    ['conflict', true],
    ['at-gate', true],
    ['come-to-gate', true],
    ['pulled', true],
    ['in-ring', false],
    ['completed', false],
  ] as const)('a %s class on show day is editable: %s', (status, editable) => {
    expect(rowsOf([entry('e1', 'class-1', status)])[0]!.deskStatusEditable).toBe(editable);
  });

  it('keeps a real Pull from the Entries page (scratched) locked, showing Pulled', () => {
    const scratched = entry('e1', 'class-1', 'pulled');
    scratched.classes[0]!.status = 'scratched';
    const [row] = rowsOf([scratched]);
    expect(row!.deskStatusEditable).toBe(false);
    expect(row!.statusLabel).toBe('Pulled');
  });
});

describe('deskCanUnpull (MYK9-1749)', () => {
  const pulled = (overrides: Partial<EntryManagementEntry> = {}) => {
    const scratched = entry('e1', 'class-1', 'pulled', {
      entryStatus: EntryStatus.SCRATCHED,
      ...overrides,
    });
    scratched.classes[0]!.status = 'scratched';
    return scratched;
  };

  it('lets the desk put back a real Pull made today with no refund decided', () => {
    const [row] = rowsOf([pulled()]);
    expect(row!.deskCanUnpull).toBe(true);
    expect(row!.deskStatusEditable).toBe(false);
  });

  it.each([
    ['a refund amount', { refundAmount: 25 }],
    ['a refund date', { refundedAt: '2026-07-08T15:00:00Z' }],
    ['a denied refund decision', { refundDecision: 'denied' as const }],
    ['a refunded payment', { paymentStatus: PaymentStatus.REFUNDED }],
    ['a partial refund', { paymentStatus: PaymentStatus.PARTIAL_REFUND }],
    ['a form-level refund amount', { enrollmentRefundAmount: 30 }],
    ['a form-level refund date', { enrollmentRefundedAt: '2026-07-08T15:00:00Z' }],
    ['a refunded form', { enrollmentPaymentStatus: PaymentStatus.REFUNDED }],
  ])('keeps the Pull locked once %s is recorded, saying so', (_, overrides) => {
    const [row] = rowsOf([pulled(overrides)]);
    expect(row!.deskCanUnpull).toBe(false);
    expect(row!.statusLabel).toBe('Pulled · refund decided, see Entries');
  });

  it('never offers it for a flag-only pull, a scored run or another day', () => {
    expect(rowsOf([entry('e1', 'class-1', 'pulled')])[0]!.deskCanUnpull).toBe(false);
    expect(rowsOf([pulled({ isScored: true })])[0]!.deskCanUnpull).toBe(false);
    const tomorrow = buildCheckInDeskPeople(
      [pulled()],
      CLASSES,
      new Date('2026-07-09T16:00:00.000Z')
    )[0]!.classRows[0]!;
    expect(tomorrow.deskCanUnpull).toBe(false);
  });

  it('is not editable for a waitlisted entry', () => {
    expect(
      rowsOf([entry('e1', 'class-1', 'checked-in', { entryStatus: EntryStatus.WAITLIST })])[0]!
        .deskStatusEditable
    ).toBe(false);
  });

  it('shows a Conflict class as Conflict, not as waiting', () => {
    expect(rowsOf([entry('e1', 'class-1', 'conflict')])[0]!.statusLabel).toBe('Conflict');
  });

  it('is not editable, nor in one tap, once the run is scored', () => {
    const [person] = buildCheckInDeskPeople(
      [
        entry('e1', 'class-1', 'checked-in', { isScored: true, resultStatus: 'qualified' }),
        entry('e2', 'class-2', 'no-status', { isScored: true, resultStatus: 'absent' }),
      ],
      CLASSES,
      NOW
    );
    expect(person!.classRows.map(row => row.deskStatusEditable)).toEqual([false, false]);
    expect(groupCheckInDeskDogs(person!)[0]!.pendingEntryIds).toEqual([]);
  });

  it("stays editable on an unscored entry whose result_status is the default 'pending'", () => {
    expect(
      rowsOf([
        entry('e1', 'class-1', 'checked-in', { isScored: false, resultStatus: 'pending' }),
      ])[0]!.deskStatusEditable
    ).toBe(true);
  });
});

describe('statusBeforeLatestPull', () => {
  it('reads the status just before the latest Pull, or null when there is none', () => {
    expect(
      statusBeforeLatestPull([
        { previousStatus: 'waitlisted', newStatus: 'scratched' },
        { previousStatus: 'scratched', newStatus: 'confirmed' },
        { previousStatus: 'confirmed', newStatus: 'scratched' },
      ])
    ).toBe('confirmed');
    expect(statusBeforeLatestPull([{ previousStatus: 'submitted', newStatus: 'confirmed' }])).toBe(
      null
    );
  });
});

describe('another day of the show (MYK9-1765)', () => {
  const TOMORROW = new Date('2026-07-09T16:00:00.000Z');
  const onTomorrow = (entries: EntryManagementEntry[]) =>
    buildCheckInDeskPeople(entries, CLASSES, TOMORROW).flatMap(person => person.classRows);

  it.each(['no-status', 'checked-in', 'conflict', 'pulled'] as const)(
    'lets the desk set a %s class on any day, labelled with its day',
    status => {
      const [row] = onTomorrow([entry('e1', 'class-1', status)]);
      expect(row!.deskStatusEditable).toBe(true);
      expect(row!.dayLabel).toBe('Wed Jul 8');
    }
  );

  it('shows no day label on today, and shows the real status on another day', () => {
    expect(rowsOf([entry('e1', 'class-1', 'checked-in')])[0]!.dayLabel).toBeNull();
    const [row] = onTomorrow([entry('e1', 'class-1', 'checked-in')]);
    expect(row!.statusLabel).toBe('Checked-in');
  });

  it('still locks an underway, scored, waitlisted or not-accepted class, saying why', () => {
    const rows = onTomorrow([
      entry('e1', 'class-1', 'in-ring'),
      entry('e2', 'class-2', 'checked-in', { isScored: true, resultStatus: 'qualified' }),
      entry('e3', 'class-3', 'no-status', { entryStatus: EntryStatus.WAITLIST }),
      entry('e4', 'class-1', 'no-status', { entryStatus: EntryStatus.PENDING }),
    ]);
    const byEntry = (id: string) => rows.find(row => row.entryId === id)!;
    const [inRing, scored, waitlist, pending] = ['e1', 'e2', 'e3', 'e4'].map(byEntry);
    expect(inRing!.deskStatusEditable).toBe(false);
    expect(inRing!.lockedReason).toMatch(/ring/i);
    expect(scored!.deskStatusEditable).toBe(false);
    expect(scored!.lockedReason).toMatch(/scored/i);
    expect(waitlist!.deskStatusEditable).toBe(false);
    expect(waitlist!.statusLabel).toBe('Waitlist');
    expect(pending!.deskStatusEditable).toBe(false);
    expect(pending!.statusLabel).toBe('Not accepted');
  });

  it('keeps the dog-level Check in to today: another day is settable but never pending', () => {
    const [person] = buildCheckInDeskPeople(
      [entry('e1', 'class-1', 'no-status')],
      CLASSES,
      TOMORROW
    );
    const [dog] = groupCheckInDeskDogs(person!);
    expect(dog!.rows[0]!.deskStatusEditable).toBe(true);
    expect(dog!.pendingEntryIds).toEqual([]);
    expect(person!.eligibleCount).toBe(0);
  });

  it('formats the day from the trial date alone, in any timezone', () => {
    const classes = [{ ...CLASSES[0]!, trialDate: '2026-12-07', timezone: 'Pacific/Auckland' }];
    const [person] = buildCheckInDeskPeople([entry('e1', 'class-1', 'checked-in')], classes, NOW);
    expect(person!.classRows[0]!.dayLabel).toBe('Mon Dec 7');
  });
});
