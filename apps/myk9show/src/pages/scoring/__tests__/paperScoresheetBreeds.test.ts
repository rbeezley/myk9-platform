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
    await expect(loadEntriesWithDogs('class-1')).rejects.toThrow(/could not verify registrations/i);
  });

  // MYK9-90 review round 4, finding 1. Refusal used to be gated on
  // `byDog.size === 0` — a per-CLASS test. One cached dog waved the whole class
  // through and every other dog printed an unverified blank.
  describe('refusal is decided per dog, not per class', () => {
    const akcReg = {
      id: 'r1',
      created_at: '2024-01-01T00:00:00Z',
      organization: 'AKC',
      breed: 'Belgian Malinois',
    };

    beforeEach(() => {
      mockGetTrialById.mockResolvedValue({ id: 'trial-1', showId: 'show-1', registryId: 'AKC' });
      mockGetEntriesByClass.mockResolvedValue([
        { id: 'e1', classId: 'class-1', dogId: 'dog-cached', armband: '14', status: 'accepted' },
        { id: 'e2', classId: 'class-1', dogId: 'dog-other', armband: '15', status: 'accepted' },
      ]);
      mockDogGet.mockResolvedValue({ id: 'dog-x', name: 'X', callName: 'X', breed: 'Mixed Breed' });
    });

    it('refuses when ONE dog is cached and another cannot be verified', async () => {
      mockLoadDogRegistrations.mockResolvedValue({
        byDog: new Map([['dog-cached', [akcReg]]]),
        serverError: new Error('network down'),
      });

      await expect(loadEntriesWithDogs('class-1')).rejects.toThrow(/1 of 2 dogs/);
    });

    it('refuses when a cached dog holds only a DIFFERENT registry', async () => {
      // Present in the map, but nothing for AKC. Under a server error that
      // absence is unprovable, so a blank would mean "never checked".
      mockLoadDogRegistrations.mockResolvedValue({
        byDog: new Map([
          ['dog-cached', [akcReg]],
          [
            'dog-other',
            [{ ...akcReg, id: 'r2', organization: 'UKC', breed: 'Belgian Shepherd Dog' }],
          ],
        ]),
        serverError: new Error('network down'),
      });

      await expect(loadEntriesWithDogs('class-1')).rejects.toThrow(
        /could not verify registrations/i
      );
    });

    it('prints when every dog in the class is fully answered offline', async () => {
      mockLoadDogRegistrations.mockResolvedValue({
        byDog: new Map([
          ['dog-cached', [akcReg]],
          ['dog-other', [{ ...akcReg, id: 'r2', breed: 'Golden Retriever' }]],
        ]),
        serverError: new Error('network down'),
      });

      const entries = await loadEntriesWithDogs('class-1');
      expect(entries.map(e => e.breed)).toEqual(['Belgian Malinois', 'Golden Retriever']);
    });

    it('a verified absence still prints blank when the server answered', async () => {
      // No server error: the blank provably means "this dog has no AKC
      // registration", which is the correct render, not a refusal.
      mockLoadDogRegistrations.mockResolvedValue({
        byDog: new Map([
          ['dog-cached', [akcReg]],
          [
            'dog-other',
            [{ ...akcReg, id: 'r2', organization: 'UKC', breed: 'Belgian Shepherd Dog' }],
          ],
        ]),
        serverError: null,
      });

      const entries = await loadEntriesWithDogs('class-1');
      expect(entries.map(e => e.breed)).toEqual(['Belgian Malinois', '']);
    });
  });
});
