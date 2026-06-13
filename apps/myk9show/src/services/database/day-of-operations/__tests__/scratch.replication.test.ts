import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase } from '@/test/mocks/supabase';
import {
  getPendingScratchRequests,
  getScratchableEntries,
  getScratchedEntries,
} from '../scratch';

const replicationMocks = vi.hoisted(() => ({
  getEntriesByShow: vi.fn(),
  getClassById: vi.fn(),
  getDogById: vi.fn(),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: mockSupabase,
  logQuery: vi.fn(),
  createDatabaseError: (error: unknown) => error,
}));

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    getEntriesByShow: (...args: unknown[]) => replicationMocks.getEntriesByShow(...args),
  },
  replicatedClassesTable: {
    getClassById: (...args: unknown[]) => replicationMocks.getClassById(...args),
  },
  replicatedDogsTable: {
    getDogById: (...args: unknown[]) => replicationMocks.getDogById(...args),
  },
}));

const entries = [
  {
    id: 'entry-2',
    showId: 'show-1',
    classId: 'class-1',
    trialId: 'trial-1',
    dogId: 'dog-1',
    entryStatus: 'confirmed',
    runOrder: 2,
    handler: 'Jamie Walker',
    armband: '12',
    entryFee: 45,
    paymentStatus: 'paid',
    specialRequests: null,
    created_at: '2026-06-02T10:00:00.000Z',
    updated_at: '2026-06-04T10:00:00.000Z',
  },
  {
    id: 'entry-1',
    showId: 'show-1',
    classId: 'class-2',
    trialId: 'trial-1',
    dogId: 'dog-2',
    entryStatus: 'checked-in',
    runOrder: 1,
    handler: 'Taylor Rivera',
    armband: '8',
    dogCallName: 'Bright',
    entryFee: 45,
    paymentStatus: 'paid',
    specialRequests: null,
    created_at: '2026-06-01T10:00:00.000Z',
    updated_at: '2026-06-03T10:00:00.000Z',
  },
  {
    id: 'scratch-1',
    showId: 'show-1',
    classId: 'class-1',
    trialId: 'trial-1',
    dogId: 'dog-1',
    entryStatus: 'scratched',
    handler: 'Jamie Walker',
    armband: '12',
    entryFee: 45,
    paymentStatus: 'paid',
    specialRequests: 'Pulled at gate',
    created_at: '2026-06-05T10:00:00.000Z',
    updated_at: '2026-06-07T10:00:00.000Z',
  },
  {
    id: 'pending-scratch-1',
    showId: 'show-1',
    classId: 'class-2',
    trialId: 'trial-1',
    dogId: 'dog-2',
    entryStatus: 'scratch-requested',
    handler: 'Taylor Rivera',
    armband: '8',
    entryFee: 45,
    paymentStatus: 'paid',
    specialRequests: 'Handler conflict',
    created_at: '2026-06-01T09:00:00.000Z',
    updated_at: '2026-06-01T10:00:00.000Z',
  },
  {
    id: 'deleted-entry',
    showId: 'show-1',
    classId: 'class-1',
    dogId: 'dog-1',
    entryStatus: 'confirmed',
    deletedAt: '2026-06-08T10:00:00.000Z',
  },
  {
    id: 'status-only-entry',
    showId: 'show-1',
    classId: 'class-1',
    dogId: 'dog-1',
    status: 'confirmed',
  },
];

describe('scratch day-of read queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockReset();
    replicationMocks.getEntriesByShow.mockResolvedValue(entries);
    replicationMocks.getClassById.mockImplementation((classId: string) =>
      Promise.resolve({
        id: classId,
        name: classId === 'class-1' ? 'Novice A' : 'Open',
        classNumber: classId === 'class-1' ? '101' : '201',
      })
    );
    replicationMocks.getDogById.mockImplementation((dogId: string) =>
      Promise.resolve({
        id: dogId,
        name: dogId === 'dog-1' ? 'Rocket Dog' : 'Bright Dog',
        callName: dogId === 'dog-1' ? 'Rocket' : 'Bright',
      })
    );
  });

  it('loads scratchable entries from replicated entries/classes/dogs in run order', async () => {
    const result = await getScratchableEntries('show-1');

    expect(replicationMocks.getEntriesByShow).toHaveBeenCalledWith('show-1');
    expect(replicationMocks.getClassById).toHaveBeenCalledWith('class-1');
    expect(replicationMocks.getDogById).toHaveBeenCalledWith('dog-1');
    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(result.data.map(entry => entry.id)).toEqual(['entry-1', 'entry-2']);
    expect(result.data[0]).toMatchObject({
      id: 'entry-1',
      class_id: 'class-2',
      dog: { id: 'dog-2', name: 'Bright Dog', call_name: 'Bright' },
      class: { id: 'class-2', name: 'Open', class_number: '201' },
    });
  });

  it('loads scratched entries from the replica with newest updates first', async () => {
    const result = await getScratchedEntries('show-1');

    expect(replicationMocks.getEntriesByShow).toHaveBeenCalledWith('show-1');
    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'scratch-1',
        entry_status: 'scratched',
        special_requests: 'Pulled at gate',
        updated_at: '2026-06-07T10:00:00.000Z',
      }),
    ]);
  });

  it('loads pending scratch requests from the replica oldest first', async () => {
    const result = await getPendingScratchRequests('show-1');

    expect(replicationMocks.getEntriesByShow).toHaveBeenCalledWith('show-1');
    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'pending-scratch-1',
        entry_status: 'scratch-requested',
        special_requests: 'Handler conflict',
        created_at: '2026-06-01T09:00:00.000Z',
      }),
    ]);
  });

  it('does not use call name as the dog full-name fallback when dog lookup misses', async () => {
    replicationMocks.getDogById.mockImplementation((dogId: string) =>
      Promise.resolve(
        dogId === 'dog-2'
          ? null
          : {
              id: dogId,
              name: 'Rocket Dog',
              callName: 'Rocket',
            }
      )
    );

    const result = await getScratchableEntries('show-1');

    expect(result.data[0].dog).toEqual({
      id: 'dog-2',
      name: '',
      call_name: null,
    });
  });

  it('requires canonical entry status fields instead of loose status fallback', async () => {
    const result = await getScratchableEntries('show-1');

    expect(result.data.map(entry => entry.id)).not.toContain('status-only-entry');
  });
});
