import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetClassById, mockGetTrialById, mockGetEntriesByClass, mockLoadRegistrations } =
  vi.hoisted(() => ({
    mockGetClassById: vi.fn(),
    mockGetTrialById: vi.fn(),
    mockGetEntriesByClass: vi.fn(),
    mockLoadRegistrations: vi.fn(),
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
  replicatedDogsTable: { get: async (id: string) => ({ id, name: id, callName: id }) },
}));
vi.mock('@/services/replication/ReplicatedArmbandsTable', () => ({
  replicatedArmbandsTable: { getByShow: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@/services/database/dogs/reads', () => ({
  loadDogRegistrations: mockLoadRegistrations,
}));

import { loadEntriesWithDogs } from '../paperScoresheetData';

const entry = (id: string, dogId: string, held: boolean) => ({
  id,
  classId: 'class-1',
  showId: 'show-1',
  dogId,
  armband: id,
  entryStatus: 'confirmed',
  awaitingRegistrationNumber: held,
});
const akc = { organization: 'AKC', registration_number: 'SR1', breed: 'Beagle' };

// MYK9-1162: an entry the server marks as held keeps its place but is not on paper.
describe('paper scoring list leaves out entries awaiting a registration number', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClassById.mockResolvedValue({ id: 'class-1', trialId: 'trial-1' });
    mockGetTrialById.mockResolvedValue({ id: 'trial-1', registryId: 'AKC' });
    mockGetEntriesByClass.mockResolvedValue([
      entry('1', 'dog-reg', false),
      entry('2', 'dog-held', true),
    ]);
  });

  it('omits the held entry and lists the rest', async () => {
    mockLoadRegistrations.mockResolvedValue({
      byDog: new Map([['dog-reg', [akc]]]),
      serverError: null,
      registrationsReadComplete: true,
    });

    expect((await loadEntriesWithDogs('class-1')).map(e => e.entryId)).toEqual(['1']);
  });

  it('offline, a held dog with no breed to verify does not fail the whole class', async () => {
    mockLoadRegistrations.mockResolvedValue({
      byDog: new Map([['dog-reg', [akc]]]),
      serverError: new Error('offline'),
      registrationsReadComplete: false,
    });

    expect((await loadEntriesWithDogs('class-1')).map(e => e.entryId)).toEqual(['1']);
    // The held dog is never asked about at all.
    expect(mockLoadRegistrations).toHaveBeenCalledWith(['dog-reg']);
  });
});
