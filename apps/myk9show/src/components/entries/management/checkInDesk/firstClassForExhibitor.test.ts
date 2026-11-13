import { describe, expect, it } from 'vitest';
import type { CheckInStatus } from '@myk9/core';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryClass, EntryManagementEntry } from '@/types/entry-management-types';
import { buildCheckInDeskPeople } from './checkInDeskModel';
import type { PeopleRosterClassInfo } from './peopleRoster';
import { classIdsOnDay, firstClassForExhibitor, firstClassLine } from './firstClassForExhibitor';

// 4 PM UTC on Jul 8 is noon in New York: the desk's day is Jul 8.
const NOW = new Date('2026-07-08T16:00:00.000Z');

const CLASSES: PeopleRosterClassInfo[] = [
  { id: 'cn', name: 'Container Novice A', time: '08:00', trialDate: '2026-07-08' },
  { id: 'in', name: 'Interior Novice A', time: '10:30', trialDate: '2026-07-08' },
  { id: 'ex', name: 'Exterior Novice A', time: '13:00', trialDate: '2026-07-08' },
  { id: 'untimed', name: 'Buried Novice A', trialDate: '2026-07-08' },
  { id: 'tomorrow', name: 'Container Advanced A', time: '07:00', trialDate: '2026-07-09' },
  { id: 'undated', name: 'Handler Discrimination', time: '06:00' },
].map(cls => ({ ...cls, trialId: 'trial-1', ring: 'Ring 1', timezone: 'America/New_York' }));

const DAY = classIdsOnDay(CLASSES, NOW);

function entry(
  id: string,
  classId: string,
  dog: { id: string; name: string },
  overrides: { checkInStatus?: CheckInStatus; status?: EntryClass['status'] } = {},
  entryOverrides: Partial<EntryManagementEntry> = {}
): EntryManagementEntry {
  return {
    id,
    registrationId: 'reg-1',
    entryNumber: '114',
    showId: 'show-1',
    dogId: dog.id,
    dogName: dog.name,
    ownerName: 'Alice Martin',
    ownerEmail: 'alice@example.com',
    handlerName: 'Alice Martin',
    handlerId: 'person-1',
    handlerAuthUserId: 'auth-1',
    ownerId: 'person-1',
    ownerAuthUserId: 'auth-1',
    classes: [
      {
        id,
        classId,
        name: classId,
        number: '1',
        fee: 25,
        status: overrides.status ?? 'entered',
        checkInStatus: overrides.checkInStatus ?? 'no-status',
      },
    ],
    totalFee: 25,
    paidAmount: 25,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: NOW,
    lastUpdated: NOW,
    armbandNumber: '114',
    ...entryOverrides,
  };
}

const POPPY = { id: 'dog-1', name: 'Poppy' };
const COOPER = { id: 'dog-2', name: 'Cooper' };

function rowsOf(entries: EntryManagementEntry[]) {
  const people = buildCheckInDeskPeople(entries, CLASSES, NOW);
  expect(people).toHaveLength(1);
  return people[0]!.classRows;
}

describe('classIdsOnDay', () => {
  it("holds the classes on the desk's day only, not another day's or an undated one", () => {
    expect([...DAY].sort()).toEqual(['cn', 'ex', 'in', 'untimed']);
  });
});

describe('firstClassForExhibitor', () => {
  it("picks the earliest class across all the exhibitor's dogs, whoever is listed first", () => {
    const rows = rowsOf([
      entry('p-in', 'in', POPPY),
      entry('p-ex', 'ex', POPPY),
      entry('c-cn', 'cn', COOPER, {}, { armbandNumber: '115' }),
    ]);

    expect(firstClassForExhibitor(rows, DAY)?.entryId).toBe('c-cn');
    expect(firstClassLine(rows, DAY)).toBe(
      'First class: Container Novice A · Ring 1 · 8:00 AM (Cooper)'
    );
  });

  it("ignores another day's class even when it starts earlier, and an undated one", () => {
    const rows = rowsOf([
      entry('p-tomorrow', 'tomorrow', POPPY),
      entry('p-undated', 'undated', POPPY),
      entry('p-ex', 'ex', POPPY),
    ]);

    expect(firstClassForExhibitor(rows, DAY)?.entryId).toBe('p-ex');
  });

  it.each<[string, Parameters<typeof entry>[3], Partial<EntryManagementEntry>]>([
    ['scored', {}, { isScored: true }],
    ['in the ring', { checkInStatus: 'in-ring' }, {}],
    ['completed', { checkInStatus: 'completed' }, {}],
    ['pulled', { checkInStatus: 'pulled' }, { entryStatus: EntryStatus.SCRATCHED }],
    ['flagged pulled', { checkInStatus: 'pulled' }, {}],
    ['withdrawn', { status: 'withdrawn' }, {}],
    ['absent', { status: 'absent' }, {}],
    ['scratched from the class', { status: 'scratched' }, {}],
  ])('skips a class already %s and answers with the next one', (_label, cls, entryOverrides) => {
    const rows = rowsOf([
      entry('c-cn', 'cn', COOPER, cls, { armbandNumber: '115', ...entryOverrides }),
      entry('p-in', 'in', POPPY),
    ]);

    expect(firstClassLine(rows, DAY)).toBe(
      'First class: Interior Novice A · Ring 1 · 10:30 AM (Poppy)'
    );
  });

  it('still counts a class the dog is checked in to, at the gate for, or in conflict on', () => {
    for (const checkInStatus of ['checked-in', 'at-gate', 'come-to-gate', 'conflict'] as const) {
      const rows = rowsOf([
        entry('p-in', 'in', POPPY),
        entry('p-cn', 'cn', POPPY, { checkInStatus }),
      ]);
      expect(firstClassForExhibitor(rows, DAY)?.entryId).toBe('p-cn');
    }
  });

  it('puts an untimed class after timed ones, and keeps the desk order on a tie', () => {
    const untimedFirst = rowsOf([entry('p-untimed', 'untimed', POPPY), entry('p-ex', 'ex', POPPY)]);
    expect(firstClassForExhibitor(untimedFirst, DAY)?.entryId).toBe('p-ex');

    const tie = rowsOf([
      entry('p-in', 'in', POPPY),
      entry('c-in', 'in', COOPER, {}, { armbandNumber: '115' }),
    ]);
    expect(firstClassForExhibitor(tie, DAY)?.entryId).toBe('p-in');
  });

  it('gives no line when nothing is left to run that day', () => {
    const rows = rowsOf([
      entry('p-cn', 'cn', POPPY, {}, { isScored: true }),
      entry('p-tomorrow', 'tomorrow', POPPY),
    ]);

    expect(firstClassForExhibitor(rows, DAY)).toBeNull();
    expect(firstClassLine(rows, DAY)).toBeNull();
  });
});
