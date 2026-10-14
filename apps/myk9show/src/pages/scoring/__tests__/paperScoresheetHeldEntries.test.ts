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

const entry = (id: string, dogId: string) => ({
  id,
  classId: 'class-1',
  showId: 'show-1',
  dogId,
  armband: id,
  entryStatus: 'confirmed',
});
const akc = (breed = 'Beagle') => ({
  organization: 'AKC',
  registration_number: 'SR1',
  breed,
});

// MYK9-1162: a held entry keeps its capacity place but is not on paper.
describe('paper scoring list leaves out entries awaiting a registration number', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClassById.mockResolvedValue({ id: 'class-1', trialId: 'trial-1' });
    mockGetTrialById.mockResolvedValue({ id: 'trial-1', registryId: 'AKC' });
    mockGetEntriesByClass.mockResolvedValue([entry('1', 'dog-reg'), entry('2', 'dog-held')]);
  });

  it('lists the registered dog and omits the held one, with a verified read', async () => {
    mockLoadRegistrations.mockResolvedValue({
      byDog: new Map([['dog-reg', [akc()]]]),
      serverError: null,
      registrationsReadComplete: true,
    });

    const entries = await loadEntriesWithDogs('class-1');

    expect(entries.map(e => e.entryId)).toEqual(['1']);
  });

  it('holds nothing when no registry is in context: an unverified class is never emptied', async () => {
    mockGetClassById.mockResolvedValue({ id: 'class-1' });
    mockLoadRegistrations.mockResolvedValue({
      byDog: new Map(),
      serverError: null,
      registrationsReadComplete: true,
    });

    const entries = await loadEntriesWithDogs('class-1');

    expect(entries.map(e => e.entryId)).toEqual(['1', '2']);
  });

  it('keeps refusing an unverifiable read rather than printing a partly-verified sheet', async () => {
    mockLoadRegistrations.mockResolvedValue({
      byDog: new Map([['dog-reg', [akc()]]]),
      serverError: new Error('offline'),
      registrationsReadComplete: false,
    });

    await expect(loadEntriesWithDogs('class-1')).rejects.toThrow(/Could not verify registrations/);
  });
});
