import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGetClassById,
  mockGetTrialById,
  mockLoadDogRegistrations,
  mockGetEntriesByClass,
  mockDogGet,
} = vi.hoisted(() => ({
  mockGetClassById: vi.fn(),
  mockGetTrialById: vi.fn(),
  mockLoadDogRegistrations: vi.fn(),
  mockGetEntriesByClass: vi.fn(),
  mockDogGet: vi.fn(),
}));

vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: { getClassById: mockGetClassById },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { getTrialById: mockGetTrialById },
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { getEntriesByClass: mockGetEntriesByClass },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { get: mockDogGet },
}));
vi.mock('@/services/database/dogs/reads', () => ({
  loadDogRegistrations: mockLoadDogRegistrations,
}));

import { loadEntriesWithDogs } from '../paperScoresheetData';

/**
 * MYK9-90 review round 3, findings 1 and 2.
 *
 * The invariant on printed paperwork is **correct or visibly refused** — never
 * silently blank, never borrowed from another registry.
 */
describe('paper scoresheet breeds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEntriesByClass.mockResolvedValue([
      { id: 'entry-1', classId: 'class-1', dogId: 'dog-1', armband: '14', status: 'accepted' },
    ]);
    // The dog replica and the entry projection both carry a legacy breed. Neither
    // may reach the form when the registry-scoped lookup has an answer.
    mockDogGet.mockResolvedValue({
      id: 'dog-1',
      name: 'Ziva',
      callName: 'Ziva',
      breed: 'Mixed Breed',
    });
    mockGetClassById.mockResolvedValue({
      id: 'class-1',
      name: 'Interior Novice A',
      trialId: 'trial-1',
    });
  });

  it('scopes to the TRIAL registry, not the show organization', async () => {
    // A UKC trial inside a show whose organization is AKC. Round 2 scoped to the
    // show, found no AKC registration, and printed a blank.
    mockGetTrialById.mockResolvedValue({ id: 'trial-1', showId: 'show-1', registryId: 'UKC' });
    mockLoadDogRegistrations.mockResolvedValue({
      byDog: new Map([
        [
          'dog-1',
          [
            {
              id: 'reg-ukc',
              created_at: '2024-01-01T00:00:00Z',
              organization: 'UKC (United Kennel Club)',
              breed: 'Belgian Shepherd Dog',
              registration_number: 'P935-254',
            },
          ],
        ],
      ]),
      serverError: null,
    });

    const [entry] = await loadEntriesWithDogs('class-1');
    expect(entry!.breed).toBe('Belgian Shepherd Dog');
  });

  it('still refuses to borrow across registries', async () => {
    // AKC trial, UKC-only dog. Correct answer is blank, and no fallback may
    // supply 'Mixed Breed' from the dog replica.
    mockGetTrialById.mockResolvedValue({ id: 'trial-1', showId: 'show-1', registryId: 'AKC' });
    mockLoadDogRegistrations.mockResolvedValue({
      byDog: new Map([
        [
          'dog-1',
          [
            {
              id: 'reg-ukc',
              created_at: '2024-01-01T00:00:00Z',
              organization: 'UKC',
              breed: 'Belgian Shepherd Dog',
            },
          ],
        ],
      ]),
      serverError: null,
    });

    const [entry] = await loadEntriesWithDogs('class-1');
    expect(entry!.breed).toBe('');
  });

  it('keeps working offline when the replica can answer', async () => {
    // Server leg failed, replica supplied the rows. Paper scoring must NOT go
    // blank at a venue with a flaky network.
    mockGetTrialById.mockResolvedValue({ id: 'trial-1', showId: 'show-1', registryId: 'AKC' });
    mockLoadDogRegistrations.mockResolvedValue({
      byDog: new Map([
        [
          'dog-1',
          [
            {
              id: 'reg-akc',
              created_at: '2024-01-01T00:00:00Z',
              organization: 'AKC',
              breed: 'Belgian Malinois',
            },
          ],
        ],
      ]),
      serverError: new Error('offline'),
    });

    const [entry] = await loadEntriesWithDogs('class-1');
    expect(entry!.breed).toBe('Belgian Malinois');
  });

  it('REFUSES rather than printing blanks when registrations cannot be read at all', async () => {
    mockGetTrialById.mockResolvedValue({ id: 'trial-1', showId: 'show-1', registryId: 'AKC' });
    mockLoadDogRegistrations.mockResolvedValue({
      byDog: new Map(),
      serverError: new Error('network down'),
    });

    // The page turns this into its blocking error state, so nothing prints.
    await expect(loadEntriesWithDogs('class-1')).rejects.toThrow(
      /could not load dog registrations/i
    );
  });
});
