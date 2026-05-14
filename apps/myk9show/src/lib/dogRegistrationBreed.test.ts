import { describe, expect, it } from 'vitest';
import { getRegisteredBreedForOrganization, organizationMatches } from './dogRegistrationBreed';

describe('dogRegistrationBreed', () => {
  it('matches organization codes after trimming and case normalization', () => {
    expect(organizationMatches(' akc ', 'AKC')).toBe(true);
  });

  it('matches known full registry names to their codes', () => {
    expect(organizationMatches('American Kennel Club', 'AKC')).toBe(true);
    expect(organizationMatches('UKC', 'United Kennel Club')).toBe(true);
  });

  it('does not match organization prefixes or substrings', () => {
    expect(organizationMatches('UKC', 'UK')).toBe(false);
    expect(organizationMatches('AKC Performance', 'AKC')).toBe(false);
    expect(organizationMatches('NA', 'NASA')).toBe(false);
  });

  it('returns the breed for the matching show organization', () => {
    expect(
      getRegisteredBreedForOrganization(
        [
          { organization: 'UKC', breed: 'Belgian Shepherd Dog' },
          { organization: 'AKC', breed: 'Belgian Tervuren' },
        ],
        'AKC'
      )
    ).toBe('Belgian Tervuren');
  });

  it('returns undefined when there is no exact organization match', () => {
    expect(
      getRegisteredBreedForOrganization([{ organization: 'UKC', breed: 'Belgian Shepherd Dog' }], 'UK')
    ).toBeUndefined();
  });
});
