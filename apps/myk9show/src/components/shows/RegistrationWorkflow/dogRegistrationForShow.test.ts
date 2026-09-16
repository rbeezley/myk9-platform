import { describe, it, expect } from 'vitest';
import { resolveRegistrationForShow } from './dogRegistrationForShow';
import type { Registration } from '@/types/dog-types';

const registration = (overrides: Partial<Registration> = {}): Registration => ({
  id: 'reg-akc',
  organization: 'AKC',
  registeredName: 'Champion Maple',
  breed: 'Golden Retriever',
  registrationNumber: 'SR12345601',
  status: 'Active',
  ...overrides,
});

const akc = registration();
const ukc = registration({ id: 'reg-ukc', organization: 'UKC', registrationNumber: 'P987-654' });
const asca = registration({
  id: 'reg-asca',
  organization: 'ASCA (Australian Shepherd Club of America)',
  registrationNumber: 'E123456',
});

describe('resolveRegistrationForShow', () => {
  it.each([
    ['AKC', akc],
    ['UKC', ukc],
    ['ASCA', asca],
  ])(
    'picks the %s registration for an %s show and de-emphasizes the rest',
    (registry, expected) => {
      const result = resolveRegistrationForShow({ registrations: [akc, ukc, asca] }, registry);

      expect(result.used).toBe(expected);
      expect(result.others).toHaveLength(2);
      expect(result.others).not.toContain(expected);
      expect(result.missingRegistration).toBe(false);
      expect(result.missingRegistrationMessage).toBeNull();
    }
  );

  it('tolerates the live organization drift ("AKC (American Kennel Club)")', () => {
    const drifted = registration({ organization: 'AKC (American Kennel Club)' });
    expect(resolveRegistrationForShow({ registrations: [drifted, ukc] }, 'AKC').used).toBe(drifted);
  });

  it('reports the missing registration, with the fix, when none matches the show registry', () => {
    const result = resolveRegistrationForShow({ registrations: [ukc, asca] }, 'AKC');

    expect(result.used).toBeNull();
    expect(result.others).toEqual([ukc, asca]);
    expect(result.missingRegistration).toBe(true);
    expect(result.missingRegistrationMessage).toBe('Add an AKC registration to enter this show');
  });

  it('says "a UKC" and "an ASCA" — the article follows the initialism, not the letter', () => {
    expect(
      resolveRegistrationForShow({ registrations: [akc] }, 'UKC').missingRegistrationMessage
    ).toBe('Add a UKC registration to enter this show');
    expect(
      resolveRegistrationForShow({ registrations: [akc] }, 'ASCA').missingRegistrationMessage
    ).toBe('Add an ASCA registration to enter this show');
  });

  it('treats a dog with no registrations at all as missing — once the read is COMPLETE', () => {
    const result = resolveRegistrationForShow(
      { registrations: [], registrationsReadComplete: true },
      'AKC'
    );
    expect(result.resolved).toBe(true);
    expect(result.used).toBeNull();
    expect(result.missingRegistration).toBe(true);
  });

  // `mapDatabaseToDog` always emits `registrations: []` when none arrived, and
  // `loadDogRegistrations` returns an empty map with registrationsReadComplete
  // false on a PostgREST error (the registrations replica sync is a no-op). An
  // empty array is therefore NOT evidence of absence when the read failed —
  // offline, every card would otherwise read "Add an AKC registration".
  it('says nothing at all when the registration read did not complete', () => {
    const result = resolveRegistrationForShow(
      { registrations: [], registrationsReadComplete: false },
      'AKC'
    );

    expect(result.resolved).toBe(false);
    expect(result.used).toBeNull();
    expect(result.missingRegistration).toBe(false);
    expect(result.missingRegistrationMessage).toBeNull();
  });

  it('marks nothing even when SOME registrations survived an incomplete read', () => {
    const result = resolveRegistrationForShow(
      { registrations: [akc, ukc], registrationsReadComplete: false },
      'AKC'
    );

    expect(result.resolved).toBe(false);
    expect(result.used).toBeNull();
    expect(result.others).toEqual([akc, ukc]);
    expect(result.missingRegistration).toBe(false);
  });

  it('treats a blank registration number as not usable, and still lists the row', () => {
    const blank = registration({ registrationNumber: '   ' });
    const result = resolveRegistrationForShow(
      { registrations: [blank, ukc], registrationsReadComplete: true },
      'AKC'
    );

    expect(result.used).toBeNull();
    expect(result.others).toEqual([blank, ukc]);
    expect(result.missingRegistration).toBe(true);
  });

  it('fails OPEN when registrations were never loaded on this data path', () => {
    expect(resolveRegistrationForShow({}, 'AKC').missingRegistration).toBe(false);
    expect(resolveRegistrationForShow({ registrations: null }, 'AKC').missingRegistration).toBe(
      false
    );
    expect(resolveRegistrationForShow(undefined, 'AKC').missingRegistration).toBe(false);
  });

  it('an undefined completeness flag is treated as complete (the mapper leaves it unset)', () => {
    expect(resolveRegistrationForShow({ registrations: [ukc] }, 'AKC').missingRegistration).toBe(
      true
    );
  });

  it('fails OPEN when the show registry is not known yet', () => {
    for (const registry of [null, undefined, '   ']) {
      const result = resolveRegistrationForShow({ registrations: [akc, ukc] }, registry);
      expect(result.resolved).toBe(false);
      expect(result.used).toBeNull();
      expect(result.others).toEqual([akc, ukc]);
      expect(result.missingRegistration).toBe(false);
      expect(result.missingRegistrationMessage).toBeNull();
    }
  });

  it('uses the primary/earliest registration when the dog holds two for one registry', () => {
    const older = registration({ id: 'reg-a', createdAt: '2024-01-01T00:00:00Z' });
    const newer = registration({
      id: 'reg-b',
      createdAt: '2025-01-01T00:00:00Z',
      registrationNumber: 'SR99999999',
    });
    const result = resolveRegistrationForShow({ registrations: [newer, older] }, 'AKC');

    expect(result.used).toBe(older);
    expect(result.others).toEqual([newer]);
  });
});
