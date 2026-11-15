// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { getRegistry } from '../../../apps/myk9show/src/features/registries/lookup';
import { REGISTRY_EMAIL_LANGUAGE_IDS, registryEmailLanguage } from './registryLanguage';

describe('registryEmailLanguage (MYK9-1999)', () => {
  it.each(REGISTRY_EMAIL_LANGUAGE_IDS)('matches the app registry config for %s', id => {
    const registry = getRegistry(id);
    expect(registryEmailLanguage(id)).toEqual({
      id: registry.id,
      shortName: registry.shortName,
      licenseLanguage: registry.licenseLanguage,
      memberClubLanguage: registry.memberClubLanguage,
    });
  });

  it('never calls a UKC or ASCA club a member club of the American Kennel Club', () => {
    for (const id of ['UKC', 'ASCA']) {
      const language = registryEmailLanguage(id);
      expect(language.memberClubLanguage).not.toContain('American Kennel Club');
      expect(language.licenseLanguage).not.toContain('A.K.C.');
    }
  });

  it('reads a blank or unknown registry as AKC, like getTrialRegistry', () => {
    expect(registryEmailLanguage(null).id).toBe('AKC');
    expect(registryEmailLanguage('  ').id).toBe('AKC');
    expect(registryEmailLanguage(' UKC ').id).toBe('UKC');
  });
});
