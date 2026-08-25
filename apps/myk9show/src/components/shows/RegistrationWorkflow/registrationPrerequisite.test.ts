import { describe, expect, it } from 'vitest';
import { getRegistrationPrerequisite } from './registrationPrerequisite';

const akcRegistration = {
  id: 'reg-1',
  organization: 'AKC (American Kennel Club)',
  registeredName: 'CH Steady Dog',
  breed: 'Beagle',
  registrationNumber: 'AKC123',
  status: 'Active',
};

const baseInput = {
  registrations: [akcRegistration],
  registryId: 'AKC',
  trialType: 'Scent Work',
  className: 'Container Novice',
  element: 'Container',
  level: 'Novice',
};

describe('getRegistrationPrerequisite', () => {
  it('accepts a registration for the trial organization', () => {
    expect(getRegistrationPrerequisite(baseInput)).toEqual({
      allowed: true,
      puppyException: false,
      message: null,
    });
  });

  it('blocks a missing registration', () => {
    expect(getRegistrationPrerequisite({ ...baseInput, registrations: [] })).toMatchObject({
      allowed: false,
      puppyException: false,
    });
  });

  it('does not accept a registration from a different organization', () => {
    expect(getRegistrationPrerequisite({ ...baseInput, registryId: 'UKC' })).toMatchObject({
      allowed: false,
    });
  });

  it('allows a proven conformation puppy class and explains the exception', () => {
    expect(
      getRegistrationPrerequisite({
        ...baseInput,
        registrations: [],
        trialType: 'Conformation',
        className: '6–9 Month Puppy',
        element: null,
        level: 'Puppy',
      })
    ).toEqual({
      allowed: true,
      puppyException: true,
      message: 'Puppy conformation classes may be entered before registration is complete.',
    });
  });

  it('fails closed when class metadata is ambiguous', () => {
    expect(
      getRegistrationPrerequisite({
        registrations: [],
        registryId: null,
        trialType: null,
        className: null,
        element: null,
        level: null,
      })
    ).toMatchObject({ allowed: false, puppyException: false });
  });

  it('does not let an AKC registration satisfy missing registry metadata', () => {
    expect(
      getRegistrationPrerequisite({
        ...baseInput,
        registryId: null,
      })
    ).toMatchObject({ allowed: false, puppyException: false });
  });
});
