import { describe, expect, it } from 'vitest';
import { getOwnerAddressPrerequisite, prerequisiteLevelFields } from './ownerAddressPrerequisite';

const noAddress = { id: 'person-1', name: 'Pat Owner' };
const base = { owner: noAddress, isOwnAddress: false, warnOnly: false };

describe('getOwnerAddressPrerequisite (MYK9-1010)', () => {
  it('blocks AKC, and a blank registry is AKC, as on the server', () => {
    expect(getOwnerAddressPrerequisite({ ...base, registryId: 'AKC' }).allowed).toBe(false);
    expect(getOwnerAddressPrerequisite({ ...base, registryId: '' }).allowed).toBe(false);
    expect(getOwnerAddressPrerequisite({ ...base, registryId: null }).allowed).toBe(false);
  });

  it('asks nothing of UKC and ASCA trials', () => {
    for (const registryId of ['UKC', 'ASCA']) {
      expect(getOwnerAddressPrerequisite({ ...base, registryId })).toEqual({
        allowed: true,
        message: null,
      });
    }
  });

  it('names all four parts when the owner has no address at all', () => {
    expect(getOwnerAddressPrerequisite({ ...base, registryId: 'AKC' }).message).toBe(
      "Add the owner's street address, city, state or province and ZIP or postal code to enter AKC classes. AKC prints the owner's address in the catalog."
    );
  });
});

describe('prerequisiteLevelFields', () => {
  const blockedAddress = { allowed: false, message: 'address' };

  it('offers the registration fix first when both are missing', () => {
    expect(
      prerequisiteLevelFields(
        { allowed: false, puppyException: false, message: 'registration' },
        blockedAddress
      )
    ).toEqual({
      isRegistrationBlocked: true,
      registrationGuidance: 'registration',
      registrationFix: 'registration',
    });
  });

  it('offers the address fix once the registration is there', () => {
    expect(
      prerequisiteLevelFields(
        { allowed: true, puppyException: false, message: null },
        blockedAddress
      )
    ).toEqual({
      isRegistrationBlocked: true,
      registrationGuidance: 'address',
      registrationFix: 'owner-address',
    });
  });
});
