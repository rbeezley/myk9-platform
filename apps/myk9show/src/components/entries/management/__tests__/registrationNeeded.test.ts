import { describe, expect, it } from 'vitest';
import { findEntriesAwaitingRegistrationNumber } from '../registrationNeeded';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { Dog } from '@/types/dog-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';

function dog(id: string, extra: Partial<Dog> = {}): Dog {
  return { id, name: id, callName: id, breed: 'Beagle', registrations: [], ...extra } as Dog;
}

function entry(
  id: string,
  dogId: string,
  overrides: Partial<EntryManagementEntry> = {},
  classOverrides: Partial<EntryManagementEntry['classes'][number]> = {}
): EntryManagementEntry {
  return {
    id,
    registrationId: `reg-${id}`,
    entryNumber: id,
    showId: 'show-1',
    dogId,
    dogName: dogId,
    ownerName: 'Owner',
    ownerEmail: '',
    handlerName: 'Handler',
    classes: [
      {
        id,
        classId: 'class-1',
        name: 'Container Novice',
        number: '1',
        fee: 25,
        status: 'entered',
        trialId: 'trial-1',
        ...classOverrides,
      },
    ],
    totalFee: 25,
    paidAmount: 0,
    entryStatus: EntryStatus.ACCEPTED,
    rawEntryStatus: 'confirmed',
    paymentStatus: PaymentStatus.PENDING,
    submittedAt: new Date(2026, 6, 1),
    lastUpdated: new Date(2026, 6, 1),
    ...overrides,
  };
}

const trials = [{ id: 'trial-1', registry_id: 'AKC' }];
const ids = (rows: { entry: { id: string } }[]) => rows.map(row => row.entry.id);

// MYK9-1162: the server decides who is held; the pane only lists and resolves.
describe('findEntriesAwaitingRegistrationNumber', () => {
  const held = { awaitingRegistrationNumber: true };

  it('lists the entries the server marks as held, with the trial registry and the dog', () => {
    const rows = findEntriesAwaitingRegistrationNumber({
      entries: [entry('held', 'd1', held), entry('ok', 'd2')],
      trials,
      dogs: [dog('d1'), dog('d2')],
    });
    expect(ids(rows)).toEqual(['held']);
    expect(rows[0]?.registryId).toBe('AKC');
    expect(rows[0]?.dog?.id).toBe('d1');
  });

  it("never rederives it from the device's registrations", () => {
    // d1 holds no number on this device, but the server has not marked it held.
    const rows = findEntriesAwaitingRegistrationNumber({
      entries: [entry('unflagged', 'd1')],
      trials,
      dogs: [dog('d1')],
    });
    expect(rows).toEqual([]);
  });

  it('still lists a held entry when the dog is not in the roster, without a dog to add to', () => {
    const rows = findEntriesAwaitingRegistrationNumber({
      entries: [entry('held', 'd-missing', held)],
      trials,
      dogs: [],
    });
    expect(ids(rows)).toEqual(['held']);
    expect(rows[0]?.dog).toBeUndefined();
  });

  it("names the registry of the entry's own trial", () => {
    const rows = findEntriesAwaitingRegistrationNumber({
      entries: [entry('held', 'd1', held, { trialId: 'trial-ukc' })],
      trials: [...trials, { id: 'trial-ukc', registry_id: 'UKC' }],
      dogs: [dog('d1')],
    });
    expect(rows[0]?.registryId).toBe('UKC');
  });

  it('leaves out a held entry whose trial is not loaded, and one that is withdrawn', () => {
    const rows = findEntriesAwaitingRegistrationNumber({
      entries: [
        entry('no-trial', 'd1', held, { trialId: 'trial-unknown' }),
        entry('withdrawn', 'd2', { ...held, rawEntryStatus: 'withdrawn' }),
      ],
      trials,
      dogs: [dog('d1'), dog('d2')],
    });
    expect(rows).toEqual([]);
  });
});
