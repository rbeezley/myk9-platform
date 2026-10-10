import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadClassRegistryForClass: vi.fn(),
  getRegistrationsForDogs: vi.fn(),
  resolveDogIdentityForOrganization: vi.fn(),
}));
vi.mock('./paperScoresheetData', () => ({
  loadClassRegistryForClass: mocks.loadClassRegistryForClass,
}));
vi.mock('@/services/replication/ReplicatedDogRegistrationsTable', () => ({
  replicatedDogRegistrationsTable: { getRegistrationsForDogs: mocks.getRegistrationsForDogs },
}));
vi.mock('@/features/dogs/identity', () => ({
  resolveDogIdentityForOrganization: mocks.resolveDogIdentityForOrganization,
}));

import { resolveLiveScoringBreed } from './liveScoringBreed';

describe('resolveLiveScoringBreed (MYK9-1086, MYK9-90 rule)', () => {
  beforeEach(() => {
    mocks.loadClassRegistryForClass.mockReset();
    mocks.getRegistrationsForDogs.mockReset();
    mocks.resolveDogIdentityForOrganization.mockReset();
  });

  it('returns the breed registered with the class registry, from the local replica', async () => {
    const rows = [{ organization: 'AKC', breed: 'Beagle' }];
    mocks.loadClassRegistryForClass.mockResolvedValue('AKC');
    mocks.getRegistrationsForDogs.mockResolvedValue(rows);
    mocks.resolveDogIdentityForOrganization.mockReturnValue({ breed: 'Beagle' });

    await expect(resolveLiveScoringBreed('class-1', 'dog-1')).resolves.toBe('Beagle');
    expect(mocks.getRegistrationsForDogs).toHaveBeenCalledWith(['dog-1']);
    expect(mocks.resolveDogIdentityForOrganization).toHaveBeenCalledWith(rows, 'AKC');
  });

  it('shows no breed for a dog with no registration for this registry', async () => {
    mocks.loadClassRegistryForClass.mockResolvedValue('AKC');
    mocks.getRegistrationsForDogs.mockResolvedValue([{ organization: 'UKC', breed: 'Beagle' }]);
    mocks.resolveDogIdentityForOrganization.mockReturnValue({ breed: null });

    await expect(resolveLiveScoringBreed('class-1', 'dog-1')).resolves.toBeNull();
  });

  it('shows no breed when the local read fails', async () => {
    mocks.loadClassRegistryForClass.mockResolvedValue('UKC');
    mocks.getRegistrationsForDogs.mockRejectedValue(new Error('IndexedDB closed'));

    await expect(resolveLiveScoringBreed('class-1', 'dog-1')).resolves.toBeNull();
  });

  it('shows no breed when the class registry is not cached', async () => {
    mocks.loadClassRegistryForClass.mockResolvedValue(undefined);

    await expect(resolveLiveScoringBreed('class-1', 'dog-1')).resolves.toBeNull();
    expect(mocks.getRegistrationsForDogs).not.toHaveBeenCalled();
  });
});
