import { describe, expect, it } from 'vitest';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { countFormsByTrialAndClass } from '../entryManagementFilterCounts';
import { groupEntriesByShowRegistration } from '../showRegistrationProjection';

function entry(id: string, registrationId: string, classIds: string[]): EntryManagementEntry {
  return {
    id,
    registrationId,
    entryNumber: id,
    showId: 'show-1',
    dogId: `dog-${id}`,
    dogName: `Dog ${id}`,
    ownerName: 'Exhibitor',
    ownerEmail: 'exhibitor@example.com',
    handlerName: 'Handler',
    classes: classIds.map(classId => ({
      id: `${id}-${classId}`,
      classId,
      name: classId,
      number: '1',
      fee: 25,
      status: 'entered',
    })),
    totalFee: 25,
    paidAmount: 0,
    entryStatus: EntryStatus.PENDING,
    paymentStatus: PaymentStatus.PENDING,
    submittedAt: new Date(2026, 6, 1),
    lastUpdated: new Date(2026, 6, 1),
  };
}

describe('countFormsByTrialAndClass', () => {
  // Form r1 has two dogs in c1 and one in c2 (both trial t1); form r2 has a dog in c3 (trial t2).
  const groups = groupEntriesByShowRegistration([
    entry('e1', 'r1', ['c1', 'c2']),
    entry('e2', 'r1', ['c1']),
    entry('e3', 'r2', ['c3']),
  ]);
  const classTrialById = new Map([
    ['c1', 't1'],
    ['c2', 't1'],
    ['c3', 't2'],
  ]);

  it('counts each form once per class and once per trial, however many entries it has there', () => {
    const counts = countFormsByTrialAndClass(groups, classTrialById);

    expect(Object.fromEntries(counts.byClass)).toEqual({ c1: 1, c2: 1, c3: 1 });
    expect(Object.fromEntries(counts.byTrial ?? [])).toEqual({ t1: 1, t2: 1 });
  });

  it('gives no trial counts while the class-to-trial map is unknown', () => {
    expect(countFormsByTrialAndClass(groups, undefined).byTrial).toBeUndefined();
  });
});
