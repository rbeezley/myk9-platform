import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase } from '@/test/mocks/supabase';
import { createDayOfEntry, getClassesWithCapacity, searchDogs } from '../entries';

const replicationMocks = vi.hoisted(() => ({
  getEntriesByShow: vi.fn(),
  getClassById: vi.fn(),
  getClassesByTrial: vi.fn(),
  getTrialsByShow: vi.fn(),
  searchReplicatedDogs: vi.fn(),
  createEntry: vi.fn(),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: mockSupabase,
  logQuery: vi.fn(),
  createDatabaseError: (error: unknown) => error,
}));

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    getEntriesByShow: (...args: unknown[]) => replicationMocks.getEntriesByShow(...args),
    createEntry: (...args: unknown[]) => replicationMocks.createEntry(...args),
  },
  replicatedClassesTable: {
    getClassById: (...args: unknown[]) => replicationMocks.getClassById(...args),
    getClassesByTrial: (...args: unknown[]) => replicationMocks.getClassesByTrial(...args),
  },
  replicatedTrialsTable: {
    getTrialsByShow: (...args: unknown[]) => replicationMocks.getTrialsByShow(...args),
  },
  replicatedDogsTable: {
    searchDogs: (...args: unknown[]) => replicationMocks.searchReplicatedDogs(...args),
  },
}));

describe('createDayOfEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockReset();
    replicationMocks.getEntriesByShow.mockResolvedValue([{ id: 'existing-1', armband: '12' }]);
    replicationMocks.getClassById.mockResolvedValue({
      id: 'class-1',
      trialId: 'trial-1',
      entryFee: 45,
    });
    replicationMocks.getTrialsByShow.mockResolvedValue([{ id: 'trial-1' }]);
    replicationMocks.getClassesByTrial.mockResolvedValue([
      { id: 'class-1', name: 'Novice A', trialId: 'trial-1', maxEntries: 2 },
    ]);
    replicationMocks.searchReplicatedDogs.mockResolvedValue([
      {
        id: 'dog-1',
        name: 'Rocket Dog',
        callName: 'Rocket',
        breed: 'Border Collie',
        ownerId: 'person-1',
      },
    ]);
    replicationMocks.createEntry.mockImplementation(entry => Promise.resolve(entry));
  });

  it('queues replicated day-of entries and preserves desk payment method', async () => {
    const result = await createDayOfEntry(
      {
        dogId: 'dog-1',
        showId: 'show-1',
        classIds: ['class-1'],
        handler: 'Jamie Walker',
        paymentMethod: 'check',
      },
      'user-1'
    );

    expect(replicationMocks.getEntriesByShow).toHaveBeenCalledWith('show-1');
    expect(replicationMocks.getClassById).toHaveBeenCalledWith('class-1');
    expect(replicationMocks.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        dogId: 'dog-1',
        showId: 'show-1',
        classId: 'class-1',
        trialId: 'trial-1',
        isDayOfShow: true,
        paymentMethod: 'check',
        paymentStatus: 'paid',
        entryStatus: 'confirmed',
        entryFee: 45,
        armband: '13',
      })
    );
    expect(result.data?.totalFees).toBe(45);
  });

  it('loads class capacity from replicated trials, classes, and show entries', async () => {
    replicationMocks.getEntriesByShow.mockResolvedValue([
      { id: 'entry-1', classId: 'class-1', entryStatus: 'confirmed' },
    ]);

    const result = await getClassesWithCapacity('show-1');

    expect(replicationMocks.getTrialsByShow).toHaveBeenCalledWith('show-1');
    expect(replicationMocks.getClassesByTrial).toHaveBeenCalledWith('trial-1');
    expect(replicationMocks.getEntriesByShow).toHaveBeenCalledWith('show-1');
    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(result.data).toEqual([
      {
        id: 'class-1',
        name: 'Novice A',
        class_number: null,
        max_entries: 2,
        trial_id: 'trial-1',
        accepted_count: 1,
        available_spots: 1,
      },
    ]);
  });

  it('searches day-of entry dogs from the replicated dog table', async () => {
    const result = await searchDogs('Rocket');

    expect(replicationMocks.searchReplicatedDogs).toHaveBeenCalledWith('Rocket');
    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(result.data).toEqual([
      {
        id: 'dog-1',
        name: 'Rocket Dog',
        call_name: 'Rocket',
        breed: 'Border Collie',
        owner: { id: 'person-1', first_name: null, last_name: null },
      },
    ]);
  });
});
