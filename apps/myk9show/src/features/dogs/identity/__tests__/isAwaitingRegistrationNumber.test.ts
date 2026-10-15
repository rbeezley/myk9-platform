import { describe, expect, it } from 'vitest';
import {
  isAwaitingRegistrationNumber,
  registrationsFromRead,
  registrationsIfKnown,
} from '../isAwaitingRegistrationNumber';

const live = { entryStatus: 'confirmed' };
const akc = (registration_number: string, organization = 'AKC') => ({
  organization,
  registration_number,
});
const puppyClass = {
  trialType: 'Conformation',
  className: 'Puppy 6-9 Months',
  element: 'Puppy',
  level: 'Puppy',
};

// Known answers mirror supabase/tests/entry_requires_dog_registration_test.sql
// and myk9_1162_held_entries_packet_test.sql: the TS predicate and the SQL rule
// must agree case by case.
describe('isAwaitingRegistrationNumber', () => {
  it('holds an entry whose dog has no registration at all', () => {
    expect(isAwaitingRegistrationNumber(live, 'AKC', [])).toBe(true);
  });

  it('releases an entry once the dog holds a number for the trial registry', () => {
    expect(isAwaitingRegistrationNumber(live, 'AKC', [akc('SR11111111')])).toBe(false);
  });

  it('holds a UKC-only dog in an AKC trial: another registry does not count', () => {
    expect(isAwaitingRegistrationNumber(live, 'AKC', [akc('P111-1111', 'UKC')])).toBe(true);
  });

  it('tolerates organization naming drift', () => {
    expect(
      isAwaitingRegistrationNumber(live, 'AKC', [akc('SR22222222', 'AKC (American Kennel Club)')])
    ).toBe(false);
  });

  it('does not count a whitespace-only number as a number', () => {
    expect(isAwaitingRegistrationNumber(live, 'AKC', [akc('   ')])).toBe(true);
  });

  it('counts any non-blank registration even when a primary one is blank', () => {
    expect(isAwaitingRegistrationNumber(live, 'AKC', [akc(''), akc('SR33333333')])).toBe(false);
  });

  it('reads a blank registry as AKC, as the entry trigger does', () => {
    expect(isAwaitingRegistrationNumber(live, '  ', [akc('SR1')])).toBe(false);
    expect(isAwaitingRegistrationNumber(live, null, [akc('P1', 'UKC')])).toBe(true);
  });

  it('resolves the registry per trial: a UKC trial needs a UKC number', () => {
    expect(isAwaitingRegistrationNumber(live, 'UKC', [akc('SR1')])).toBe(true);
    expect(isAwaitingRegistrationNumber(live, 'UKC', [akc('P1', 'UKC')])).toBe(false);
  });

  it('accepts mapped (camelCase) registrations', () => {
    expect(
      isAwaitingRegistrationNumber(live, 'AKC', [
        { organization: 'AKC', registrationNumber: 'SR44444444' },
      ])
    ).toBe(false);
  });

  it('exempts a conformation puppy class, and only with proof', () => {
    expect(isAwaitingRegistrationNumber(live, 'AKC', [], puppyClass)).toBe(false);
    expect(
      isAwaitingRegistrationNumber(live, 'AKC', [], { ...puppyClass, trialType: 'Scent Work' })
    ).toBe(true);
    expect(
      isAwaitingRegistrationNumber(live, 'AKC', [], {
        ...puppyClass,
        className: 'Open',
        element: 'Open',
        level: 'Open',
      })
    ).toBe(true);
  });

  it('treats unloaded registrations as not held, never as missing', () => {
    expect(isAwaitingRegistrationNumber(live, 'AKC', undefined)).toBe(false);
    expect(isAwaitingRegistrationNumber(live, 'AKC', null)).toBe(false);
  });

  it.each(['withdrawn', 'scratched', 'absent', 'moved', 'not_accepted'])(
    'is not live, so not held, when the entry is %s',
    entryStatus => {
      expect(isAwaitingRegistrationNumber({ entryStatus }, 'AKC', [])).toBe(false);
    }
  );

  it('is not held when the entry is soft-deleted', () => {
    expect(
      isAwaitingRegistrationNumber({ ...live, deleted_at: '2026-10-01T00:00:00Z' }, 'AKC', [])
    ).toBe(false);
  });
});

describe('registrationsIfKnown', () => {
  it('returns the list only when it is known', () => {
    const list = [akc('SR1')];
    expect(registrationsIfKnown({ registrations: list })).toBe(list);
    expect(registrationsIfKnown({ registrations: [] })).toEqual([]);
    expect(registrationsIfKnown({ registrations: list, registrationsReadComplete: true })).toBe(
      list
    );
  });

  it('is unknown for a missing dog, an unloaded list or an incomplete read', () => {
    expect(registrationsIfKnown(undefined)).toBeUndefined();
    expect(registrationsIfKnown(null)).toBeUndefined();
    expect(registrationsIfKnown({})).toBeUndefined();
    expect(registrationsIfKnown({ registrations: null })).toBeUndefined();
    expect(
      registrationsIfKnown({ registrations: [], registrationsReadComplete: false })
    ).toBeUndefined();
  });
});

describe('registrationsFromRead', () => {
  const rows = [akc('SR1')];

  it('answers every dog from a complete read, none meaning none', () => {
    const read = { byDog: new Map([['d1', rows]]), registrationsReadComplete: true };
    expect(registrationsFromRead(read, 'd1')).toBe(rows);
    expect(registrationsFromRead(read, 'd2')).toEqual([]);
  });

  it('answers an incomplete read only for the dogs it returned rows for', () => {
    const read = { byDog: new Map([['d1', rows]]), registrationsReadComplete: false };
    expect(registrationsFromRead(read, 'd1')).toBe(rows);
    expect(registrationsFromRead(read, 'd2')).toBeUndefined();
  });

  it('never reads a missing dog as "none" from an incomplete read, device or server', () => {
    // Dog d1 has rows, d2 has none: only a COMPLETE read can say d2 has none.
    // The offline device read is never reported complete, so d2 is unknown (not
    // held) rather than a registered dog silently dropped from paperwork.
    for (const source of ['device', 'server'] as const) {
      const read = { byDog: new Map([['d1', rows]]), registrationsReadComplete: false, source };
      expect(registrationsFromRead(read, 'd1')).toBe(rows);
      expect(registrationsFromRead(read, 'd2')).toBeUndefined();
    }
    const empty = { byDog: new Map(), registrationsReadComplete: false, source: 'device' as const };
    expect(registrationsFromRead(empty, 'd2')).toBeUndefined();
  });
});
