import { describe, expect, it } from 'vitest';
import { findEntriesAwaitingRegistrationNumber } from '../registrationNeeded';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { Dog } from '@/types/dog-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';

const akc = { id: 'r', organization: 'AKC', registrationNumber: 'SR1' } as never;
const ukc = { id: 'u', organization: 'UKC', registrationNumber: 'P1' } as never;

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

// Known answers mirror supabase/tests/entry_requires_dog_registration_test.sql.
describe('findEntriesAwaitingRegistrationNumber', () => {
  it('lists an entry whose dog has no number for the trial registry, with that registry', () => {
    const rows = findEntriesAwaitingRegistrationNumber({
      entries: [entry('held', 'd1'), entry('ok', 'd2')],
      trials,
      dogs: [dog('d1'), dog('d2', { registrations: [akc] })],
    });
    expect(ids(rows)).toEqual(['held']);
    expect(rows[0]).toMatchObject({ registryId: 'AKC', dog: { id: 'd1' } });
  });

  it('reads the registry per trial: an AKC number does not release a UKC trial entry', () => {
    const rows = findEntriesAwaitingRegistrationNumber({
      entries: [entry('a', 'd1', {}, { trialId: 'trial-ukc' })],
      trials: [{ id: 'trial-ukc', registry_id: 'UKC' }],
      dogs: [dog('d1', { registrations: [akc] })],
    });
    expect(ids(rows)).toEqual(['a']);
    expect(rows[0]?.registryId).toBe('UKC');
  });

  it('holds a UKC-only dog in an AKC trial, and releases it once the AKC number exists', () => {
    const held = { entries: [entry('a', 'd1')], trials };
    expect(
      ids(
        findEntriesAwaitingRegistrationNumber({
          ...held,
          dogs: [dog('d1', { registrations: [ukc] })],
        })
      )
    ).toEqual(['a']);
    expect(
      findEntriesAwaitingRegistrationNumber({
        ...held,
        dogs: [dog('d1', { registrations: [ukc, akc] })],
      })
    ).toEqual([]);
  });

  it('treats an unknown trial, dog or registration read as not held', () => {
    const base = { entries: [entry('a', 'd1')] };
    expect(
      findEntriesAwaitingRegistrationNumber({ ...base, trials: [], dogs: [dog('d1')] })
    ).toEqual([]);
    expect(findEntriesAwaitingRegistrationNumber({ ...base, trials, dogs: [] })).toEqual([]);
    expect(
      findEntriesAwaitingRegistrationNumber({
        ...base,
        trials,
        dogs: [dog('d1', { registrationsReadComplete: false })],
      })
    ).toEqual([]);
    expect(
      findEntriesAwaitingRegistrationNumber({
        ...base,
        trials,
        dogs: [dog('d1', { registrations: undefined })],
      })
    ).toEqual([]);
  });

  it.each(['withdrawn', 'scratched', 'absent', 'moved', 'not_accepted'])(
    'leaves a %s entry out: only live entries are held',
    status => {
      expect(
        findEntriesAwaitingRegistrationNumber({
          entries: [entry('a', 'd1', { rawEntryStatus: status })],
          trials,
          dogs: [dog('d1')],
        })
      ).toEqual([]);
    }
  );

  it('keeps the conformation-puppy carve-out', () => {
    expect(
      findEntriesAwaitingRegistrationNumber({
        entries: [entry('a', 'd1', {}, { trialType: 'Conformation', name: 'Puppy 6-9 Months' })],
        trials,
        dogs: [dog('d1')],
      })
    ).toEqual([]);
  });
});
