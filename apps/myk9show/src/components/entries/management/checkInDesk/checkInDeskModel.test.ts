import { describe, expect, it } from 'vitest';
import type { CheckInStatus } from '@myk9/core';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import {
  applyOptimisticDeskStatuses,
  buildCheckInDeskPeople,
  groupCheckInDeskDogs,
} from './checkInDeskModel';
import type { PeopleRosterClassInfo } from './peopleRoster';

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
  ])('keeps the Pull locked once %s is recorded, saying so', (_, overrides) => {
    const [row] = rowsOf([pulled(overrides)]);
    expect(row!.deskCanUnpull).toBe(false);
    expect(row!.statusLabel).toBe('Pulled · refund decided');
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

  it('is not editable for a waitlisted entry or on another day', () => {
    expect(
      rowsOf([entry('e1', 'class-1', 'checked-in', { entryStatus: EntryStatus.WAITLIST })])[0]!
        .deskStatusEditable
    ).toBe(false);
    const tomorrow = buildCheckInDeskPeople(
      [entry('e1', 'class-1', 'conflict')],
      CLASSES,
      new Date('2026-07-09T16:00:00.000Z')
    )[0]!.classRows[0]!;
    expect(tomorrow.deskStatusEditable).toBe(false);
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

describe('applyOptimisticDeskStatuses', () => {
  const change = (from: CheckInStatus, to: CheckInStatus) => new Map([['e1', { from, to }]]);

  it('returns a copy when nothing is pending', () => {
    const entries = [entry('e1', 'class-1', 'no-status')];
    const shown = applyOptimisticDeskStatuses(entries, new Map());
    expect(shown).toEqual(entries);
    expect(shown).not.toBe(entries);
  });

  it.each(['in-ring', 'pulled', 'conflict'] as const)(
    'gives way once the shared status has moved on from the one written over (%s)',
    moved => {
      const [shown] = applyOptimisticDeskStatuses(
        [entry('e1', 'class-1', moved)],
        change('no-status', 'checked-in')
      );
      expect(shown!.classes[0]!.checkInStatus).toBe(moved);
    }
  );

  it('stamps a check-in time only when checking in', () => {
    const [checkedIn] = applyOptimisticDeskStatuses(
      [entry('e1', 'class-1', 'no-status')],
      change('no-status', 'checked-in')
    );
    expect(checkedIn!.classes[0]).toMatchObject({ checkInStatus: 'checked-in' });
    expect(checkedIn!.classes[0]!.checkInTime).toBeInstanceOf(Date);

    const [conflict] = applyOptimisticDeskStatuses(
      [entry('e1', 'class-1', 'no-status')],
      change('no-status', 'conflict')
    );
    expect(conflict!.classes[0]!.checkInStatus).toBe('conflict');
    expect(conflict!.classes[0]!.checkInTime).toBeUndefined();
  });
});
