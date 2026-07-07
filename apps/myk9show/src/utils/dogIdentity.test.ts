import { describe, expect, it } from 'vitest';
import type { Dog } from '@/types/dog-types';
import {
  findDogByExactRegistrationIdentity,
  findLikelyDuplicateDogCandidate,
  normalizeDogRegistrationNumber,
  normalizeDogRegistrationOrganization,
  registrationIdentitiesMatch,
} from './dogIdentity';

const dog = (overrides: Partial<Dog> = {}): Dog => ({
  id: 'dog-1',
  name: 'CH Acme Fast Dog',
  callName: 'Rocket',
  breed: 'Border Collie',
  sex: 'male',
  ownerId: 'owner-1',
  dateOfBirth: '2021-02-03',
  registrations: [
    {
      id: 'reg-1',
      organization: 'AKC',
      registeredName: 'CH Acme Fast Dog',
      breed: 'Border Collie',
      registrationNumber: 'DN-12345678',
      status: 'Active',
    },
  ],
  ...overrides,
});

describe('dog identity normalization', () => {
  it('normalizes common organization display labels to registry codes', () => {
    expect(normalizeDogRegistrationOrganization('akc (American Kennel Club)')).toBe('AKC');
    expect(normalizeDogRegistrationOrganization(' UKC Nosework ')).toBe('UKC');
  });

  it('normalizes registration numbers by removing case and separators', () => {
    expect(normalizeDogRegistrationNumber(' dn-123 456/78 ')).toBe('DN12345678');
  });

  it('matches equivalent registration identities', () => {
    expect(
      registrationIdentitiesMatch(
        { organization: 'AKC', registrationNumber: 'DN-12345678' },
        { organization: 'akc (American Kennel Club)', registrationNumber: 'dn 12345678' }
      )
    ).toBe(true);
  });
});

describe('dog identity candidates', () => {
  it('finds an exact registration match across formatting variants', () => {
    expect(
      findDogByExactRegistrationIdentity([dog()], {
        organization: 'akc',
        registrationNumber: 'DN12345678',
      })?.id
    ).toBe('dog-1');
  });

  it('suggests a strong cross-organization same-dog candidate', () => {
    const candidate = findLikelyDuplicateDogCandidate([dog()], {
      ownerId: 'owner-1',
      callName: 'Rocket',
      registeredName: 'CH Acme Fast Dog',
      breed: 'Border Collie',
      sex: 'male',
      dateOfBirth: '2021-02-03',
      registrations: [{ organization: 'UKC', registrationNumber: 'U123456' }],
    });

    expect(candidate?.dog.id).toBe('dog-1');
    expect(candidate?.reasons).toContain('same registered name');
  });

  it('does not suggest weak or different-owner matches', () => {
    expect(
      findLikelyDuplicateDogCandidate([dog()], {
        ownerId: 'owner-2',
        callName: 'Rocket',
        registeredName: 'CH Acme Fast Dog',
        breed: 'Border Collie',
        sex: 'male',
        dateOfBirth: '2021-02-03',
      })
    ).toBeNull();

    expect(
      findLikelyDuplicateDogCandidate([dog()], {
        ownerId: 'owner-1',
        callName: 'Other',
        breed: 'Border Collie',
      })
    ).toBeNull();
  });
});
