// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  OWNER_ADDRESS_REQUIRED_CODE,
  cartOwnerAddressRefusal,
  type OwnerAddressGateLine,
  type OwnerAddressRow,
} from './cartOwnerAddressGate';
import { ownerAddressMissingParts } from '../../../src/features/registration/ownerAddress';

const NO_STREET_OR_ZIP = { street_address: '  ', city: 'Springfield', state: 'IL', zip_code: null };
const COMPLETE = {
  street_address: '12 Elm St',
  city: 'Springfield',
  state: 'IL',
  zip_code: '62701',
};

function line(
  registry: string | null,
  owner: OwnerAddressRow | null,
  overrides: Partial<OwnerAddressGateLine> = {}
): OwnerAddressGateLine {
  return {
    dog_id: 'dog-1',
    entry_id: null,
    dog: { call_name: 'Rex', owner },
    class: { trial: { registry_id: registry } },
    ...overrides,
  };
}

describe('cartOwnerAddressRefusal (MYK9-1010)', () => {
  it('refuses an AKC line whose owner is missing parts, naming the dog and the parts', () => {
    expect(cartOwnerAddressRefusal([line('AKC', NO_STREET_OR_ZIP)])).toEqual({
      code: OWNER_ADDRESS_REQUIRED_CODE,
      error:
        "Add the owner's street address and ZIP or postal code to enter Rex in an AKC trial. AKC prints the owner's address in the marked catalog.",
      dogs: [
        { dog_id: 'dog-1', dog_name: 'Rex', missing: ['street address', 'ZIP or postal code'] },
      ],
    });
  });

  it('treats a blank registry as AKC', () => {
    expect(cartOwnerAddressRefusal([line('  ', NO_STREET_OR_ZIP)])?.code).toBe(
      OWNER_ADDRESS_REQUIRED_CODE
    );
    expect(cartOwnerAddressRefusal([line(null, NO_STREET_OR_ZIP)])?.code).toBe(
      OWNER_ADDRESS_REQUIRED_CODE
    );
  });

  it('lets a UKC cart for the same owner through', () => {
    expect(cartOwnerAddressRefusal([line('UKC', NO_STREET_OR_ZIP)])).toBeNull();
  });

  it('lets an AKC line with a complete address through', () => {
    expect(cartOwnerAddressRefusal([line('AKC', COMPLETE)])).toBeNull();
  });

  it('skips a Finish Payment line: its entry already exists', () => {
    expect(
      cartOwnerAddressRefusal([line('AKC', NO_STREET_OR_ZIP, { entry_id: 'entry-1' })])
    ).toBeNull();
  });

  it('refuses an AKC line whose dog has no owner on file', () => {
    expect(cartOwnerAddressRefusal([line('AKC', null)])).toMatchObject({
      code: OWNER_ADDRESS_REQUIRED_CODE,
      error:
        "Rex has no owner on file. AKC prints the owner's name and address in the marked catalog, so add the owner before entering an AKC trial.",
    });
  });

  it('names each refused dog once, however many classes it is in', () => {
    const refusal = cartOwnerAddressRefusal([
      line('AKC', NO_STREET_OR_ZIP),
      line('AKC', NO_STREET_OR_ZIP),
      line('AKC', null, {
        dog_id: 'dog-2',
        dog: { call_name: 'Mia', owner: { ...COMPLETE, city: '' } },
      }),
    ]);
    expect(refusal?.dogs.map(d => d.dog_name)).toEqual(['Rex', 'Mia']);
  });

  // The server mirrors the client predicate part for part and label for label.
  it('agrees with the client predicate on every part', () => {
    for (const key of ['street_address', 'city', 'state', 'zip_code'] as const) {
      const owner = { ...COMPLETE, [key]: ' ' };
      const refusal = cartOwnerAddressRefusal([line('AKC', owner)]);
      expect(refusal?.dogs[0]?.missing).toEqual(
        ownerAddressMissingParts({
          streetAddress: owner.street_address,
          city: owner.city,
          state: owner.state,
          zipCode: owner.zip_code,
        })
      );
    }
  });
});
