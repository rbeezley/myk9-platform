import { describe, expect, it } from 'vitest';
import { formatPartList, ownerAddressMissingParts } from './ownerAddress';

const complete = {
  streetAddress: '12 Elm St',
  city: 'Springfield',
  state: 'IL',
  zipCode: '62701',
};

describe('ownerAddressMissingParts (MYK9-1010)', () => {
  it('returns nothing for a complete address', () => {
    expect(ownerAddressMissingParts(complete)).toEqual([]);
  });

  it('names every missing part, in address order', () => {
    expect(ownerAddressMissingParts({})).toEqual([
      'street address',
      'city',
      'state or province',
      'ZIP or postal code',
    ]);
  });

  it('treats blank and whitespace-only values as missing', () => {
    expect(
      ownerAddressMissingParts({ ...complete, streetAddress: '   ', zipCode: '', city: null })
    ).toEqual(['street address', 'city', 'ZIP or postal code']);
  });

  it('requires all four parts: a street address alone is not enough', () => {
    expect(ownerAddressMissingParts({ streetAddress: '12 Elm St' })).toEqual([
      'city',
      'state or province',
      'ZIP or postal code',
    ]);
  });
});

describe('formatPartList', () => {
  it('joins one, two and many parts as prose', () => {
    expect(formatPartList(['city'])).toBe('city');
    expect(formatPartList(['city', 'state'])).toBe('city and state');
    expect(formatPartList(['street address', 'city', 'ZIP or postal code'])).toBe(
      'street address, city and ZIP or postal code'
    );
  });
});
