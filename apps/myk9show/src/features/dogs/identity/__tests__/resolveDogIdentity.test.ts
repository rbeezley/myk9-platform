import { describe, expect, it } from 'vitest';
import {
  EMPTY_DOG_IDENTITY,
  normalizeOrganization,
  registrationMatchesOrganization,
  resolveDogIdentity,
  resolveDogIdentityForOrganization,
  type DogRegistrationLike,
} from '../resolveDogIdentity';

const akc: DogRegistrationLike = {
  id: 'reg-akc',
  organization: 'AKC (American Kennel Club)',
  registration_number: 'SR12345678',
  registered_name: 'Maia TeraByte Van Neerland',
  breed: 'Dutch Shepherd',
  variety: 'Brindle',
  is_primary: true,
  created_at: '2026-01-01T00:00:00Z',
};

const ukc: DogRegistrationLike = {
  id: 'reg-ukc',
  organization: 'UKC (United Kennel Club)',
  registration_number: 'P999-111',
  registered_name: 'TeraByte Of Neerland',
  breed: 'Herding Dog',
  variety: null,
  is_primary: false,
  created_at: '2026-03-01T00:00:00Z',
};

describe('normalizeOrganization', () => {
  it('strips the parenthetical long form so AKC drift collapses to one key', () => {
    // The live database holds BOTH spellings; an exact match misses most rows.
    expect(normalizeOrganization('AKC (American Kennel Club)')).toBe('AKC');
    expect(normalizeOrganization('AKC')).toBe('AKC');
    expect(normalizeOrganization('  akc  ')).toBe('AKC');
  });

  it('maps a spelled-out organization onto its abbreviation', () => {
    expect(normalizeOrganization('American Kennel Club')).toBe('AKC');
    expect(normalizeOrganization('United Kennel Club')).toBe('UKC');
  });

  it('returns null for absent or blank input', () => {
    expect(normalizeOrganization(null)).toBeNull();
    expect(normalizeOrganization(undefined)).toBeNull();
    expect(normalizeOrganization('   ')).toBeNull();
  });
});

describe('registrationMatchesOrganization', () => {
  it('matches across naming drift', () => {
    expect(registrationMatchesOrganization(akc, 'AKC')).toBe(true);
    expect(registrationMatchesOrganization(akc, 'American Kennel Club')).toBe(true);
  });

  it('does not match a different organization', () => {
    expect(registrationMatchesOrganization(ukc, 'AKC')).toBe(false);
  });

  it('never matches when no organization is supplied', () => {
    expect(registrationMatchesOrganization(akc, null)).toBe(false);
  });
});

describe('resolveDogIdentityForOrganization', () => {
  it("returns that organization's values", () => {
    const identity = resolveDogIdentityForOrganization([akc, ukc], 'AKC');
    expect(identity.registrationNumber).toBe('SR12345678');
    expect(identity.registeredName).toBe('Maia TeraByte Van Neerland');
    expect(identity.breed).toBe('Dutch Shepherd');
    expect(identity.variety).toBe('Brindle');
  });

  it('returns empty for an organization the dog is not registered with', () => {
    expect(resolveDogIdentityForOrganization([akc, ukc], 'ASCA')).toEqual(EMPTY_DOG_IDENTITY);
  });

  it('NEVER falls back to another organization', () => {
    // A UKC-only dog asked for AKC values must yield nothing — a borrowed
    // registration number on an AKC form is worse than a blank field.
    const identity = resolveDogIdentityForOrganization([ukc], 'AKC');
    expect(identity.registrationNumber).toBeNull();
    expect(identity.breed).toBeNull();
    expect(identity.registeredName).toBeNull();
  });

  it('returns empty for a dog with no registrations', () => {
    expect(resolveDogIdentityForOrganization([], 'AKC')).toEqual(EMPTY_DOG_IDENTITY);
    expect(resolveDogIdentityForOrganization(null, 'AKC')).toEqual(EMPTY_DOG_IDENTITY);
  });

  it('prefers the primary when one organization has two registrations', () => {
    const older: DogRegistrationLike = {
      ...akc,
      id: 'reg-old',
      is_primary: false,
      registration_number: 'OLD-1',
      created_at: '2025-01-01T00:00:00Z',
    };
    expect(resolveDogIdentityForOrganization([older, akc], 'AKC').registrationNumber).toBe(
      'SR12345678'
    );
  });
});

describe('resolveDogIdentity (generic)', () => {
  it('returns the only registration when there is one', () => {
    expect(resolveDogIdentity([ukc]).registrationNumber).toBe('P999-111');
  });

  it('returns the primary when there are several', () => {
    expect(resolveDogIdentity([ukc, akc]).breed).toBe('Dutch Shepherd');
  });

  it('is unchanged by adding a non-primary registration, and stable across calls', () => {
    const before = resolveDogIdentity([akc]);
    const after = resolveDogIdentity([akc, ukc]);
    expect(after).toEqual(before);
    expect(resolveDogIdentity([akc, ukc])).toEqual(after);
    // Row order out of PostgREST is not guaranteed; the answer must not depend on it.
    expect(resolveDogIdentity([ukc, akc])).toEqual(after);
  });

  it('falls back to the earliest-created when nothing is marked primary', () => {
    const a = { ...akc, is_primary: false, created_at: '2026-05-01T00:00:00Z' };
    const b = { ...ukc, is_primary: false, created_at: '2026-02-01T00:00:00Z' };
    expect(resolveDogIdentity([a, b]).registrationNumber).toBe('P999-111');
  });

  it('returns empty — and no substitute breed — for a dog with no registration', () => {
    const identity = resolveDogIdentity([]);
    expect(identity).toEqual(EMPTY_DOG_IDENTITY);
    expect(identity.breed).toBeNull();
  });

  it('treats a whitespace-only stored value as absent', () => {
    const blank: DogRegistrationLike = { ...akc, breed: '   ', registered_name: '' };
    const identity = resolveDogIdentity([blank]);
    expect(identity.breed).toBeNull();
    expect(identity.registeredName).toBeNull();
  });

  // MYK9-90 review finding. `UNIQUE (dog_id, organization)` is an exact-string
  // constraint, so one dog can legitimately hold BOTH `AKC` and
  // `AKC (American Kennel Club)` rows — the drift that exists in production.
  // Both normalize to AKC, so the resolver sees two candidates and the answer
  // must not depend on the order PostgREST happened to return them in.
  it('is deterministic when a dog holds two rows for the same organization', () => {
    const shortSpelling: DogRegistrationLike = {
      id: 'reg-b',
      organization: 'AKC',
      registration_number: 'NEWER-2',
      registered_name: 'Newer Row',
      breed: 'Dutch Shepherd',
      variety: null,
      is_primary: false,
      created_at: '2026-06-01T00:00:00Z',
    };
    const longSpelling: DogRegistrationLike = {
      id: 'reg-a',
      organization: 'AKC (American Kennel Club)',
      registration_number: 'OLDER-1',
      registered_name: 'Older Row',
      breed: 'Dutch Shepherd',
      variety: null,
      is_primary: false,
      created_at: '2026-01-01T00:00:00Z',
    };

    const forward = resolveDogIdentityForOrganization([shortSpelling, longSpelling], 'AKC');
    const reversed = resolveDogIdentityForOrganization([longSpelling, shortSpelling], 'AKC');

    expect(forward).toEqual(reversed);
    // Earliest-created wins, matching what the is_primary backfill will mark.
    expect(forward.registrationNumber).toBe('OLDER-1');
  });

  it('breaks a created_at tie on id rather than on row order', () => {
    const a: DogRegistrationLike = {
      id: 'aaa',
      organization: 'AKC',
      registration_number: 'A',
      created_at: '2026-01-01T00:00:00Z',
    };
    const b: DogRegistrationLike = {
      id: 'bbb',
      organization: 'AKC (American Kennel Club)',
      registration_number: 'B',
      created_at: '2026-01-01T00:00:00Z',
    };
    expect(resolveDogIdentityForOrganization([a, b], 'AKC').registrationNumber).toBe('A');
    expect(resolveDogIdentityForOrganization([b, a], 'AKC').registrationNumber).toBe('A');
  });

  it('does not mutate the caller’s array', () => {
    const rows = [ukc, akc];
    resolveDogIdentity(rows);
    expect(rows[0]).toBe(ukc);
  });
});
