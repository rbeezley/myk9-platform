import { describe, it, expect } from 'vitest';
import { buildDogCardRegistryModel, registryAbbreviation } from './dogRegistryModel';

describe('buildDogCardRegistryModel', () => {
  it('names the breed once when every registry agrees', () => {
    const m = buildDogCardRegistryModel([
      { organization: 'AKC', breed: 'Border Collie', registration_number: 'DN63927401' },
      { organization: 'UKC', breed: 'Border Collie', registration_number: 'R268-491' },
      { organization: 'ASCA', breed: 'Border Collie', registration_number: 'E36458' },
    ]);
    expect(m.breed).toBe('Border Collie');
    expect(m.breedVaries).toBe(false);
    expect(m.rows).toEqual([
      { org: 'AKC', breed: 'Border Collie', number: 'DN63927401' },
      { org: 'UKC', breed: 'Border Collie', number: 'R268-491' },
      { org: 'ASCA', breed: 'Border Collie', number: 'E36458' },
    ]);
  });

  it('flags a per-registry breed when registries disagree', () => {
    const m = buildDogCardRegistryModel([
      { organization: 'AKC', breed: 'All-American Dog', registration_number: 'PAL306118' },
      { organization: 'UKC', breed: 'Mixed Breed', registration_number: 'P712-044' },
    ]);
    expect(m.breed).toBeNull();
    expect(m.breedVaries).toBe(true);
    expect(m.rows.map(r => r.breed)).toEqual(['All-American Dog', 'Mixed Breed']);
  });

  it('abbreviates a long organization label to its first word', () => {
    expect(registryAbbreviation('AKC - American Kennel Club')).toBe('AKC');
    expect(registryAbbreviation(undefined)).toBe('');
  });

  it('drops blank rows and duplicate registry+number pairs', () => {
    const m = buildDogCardRegistryModel([
      { organization: 'AKC', breed: 'Beagle', registration_number: 'HP1' },
      { organization: 'AKC', breed: 'Beagle', registration_number: 'HP1' },
      { organization: '', breed: '', registration_number: '' },
      { organization: 'UKC', breed: 'Beagle', registration_number: null },
    ]);
    expect(m.rows).toEqual([
      { org: 'AKC', breed: 'Beagle', number: 'HP1' },
      { org: 'UKC', breed: 'Beagle', number: null },
    ]);
    expect(m.breed).toBe('Beagle');
  });

  it('reads the mapped camelCase registration number too', () => {
    const m = buildDogCardRegistryModel([
      { organization: 'AKC', breed: 'Beagle', registrationNumber: 'HP9' },
    ]);
    expect(m.rows).toEqual([{ org: 'AKC', breed: 'Beagle', number: 'HP9' }]);
  });

  it('returns an empty model with no registrations', () => {
    expect(buildDogCardRegistryModel(undefined)).toEqual({ breed: null, breedVaries: false, rows: [] });
  });
});
