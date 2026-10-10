import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadClassRegistryForClass: vi.fn(),
  loadRegisteredBreedsByDogId: vi.fn(),
}));
vi.mock('./paperScoresheetData', () => mocks);

import { resolveLiveScoringBreed } from './liveScoringBreed';

describe('resolveLiveScoringBreed (MYK9-1086, MYK9-90 rule)', () => {
  beforeEach(() => {
    mocks.loadClassRegistryForClass.mockReset();
    mocks.loadRegisteredBreedsByDogId.mockReset();
  });

  it('returns the breed registered with the class registry', async () => {
    mocks.loadClassRegistryForClass.mockResolvedValue('AKC');
    mocks.loadRegisteredBreedsByDogId.mockResolvedValue(new Map([['dog-1', 'Beagle']]));
    await expect(resolveLiveScoringBreed('class-1', 'dog-1')).resolves.toBe('Beagle');
    expect(mocks.loadRegisteredBreedsByDogId).toHaveBeenCalledWith(['dog-1'], 'AKC');
  });

  it('shows no breed for a dog with no registration for this registry', async () => {
    mocks.loadClassRegistryForClass.mockResolvedValue('AKC');
    mocks.loadRegisteredBreedsByDogId.mockResolvedValue(new Map([['dog-1', null]]));
    await expect(resolveLiveScoringBreed('class-1', 'dog-1')).resolves.toBeNull();
  });

  it('shows no breed when the lookup cannot be confirmed (offline)', async () => {
    mocks.loadClassRegistryForClass.mockResolvedValue('UKC');
    mocks.loadRegisteredBreedsByDogId.mockRejectedValue(new Error('Could not verify'));
    await expect(resolveLiveScoringBreed('class-1', 'dog-1')).resolves.toBeNull();
  });

  it('shows no breed when the class registry is not cached', async () => {
    mocks.loadClassRegistryForClass.mockResolvedValue(undefined);
    await expect(resolveLiveScoringBreed('class-1', 'dog-1')).resolves.toBeNull();
    expect(mocks.loadRegisteredBreedsByDogId).not.toHaveBeenCalled();
  });
});
