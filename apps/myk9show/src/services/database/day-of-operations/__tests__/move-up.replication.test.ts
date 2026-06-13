import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase } from '@/test/mocks/supabase';
import { getMoveUpEligibleEntries, getPendingMoveUpRequests } from '../move-up';

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

vi.mock('../entries/lifecycle', () => ({
  markEntryMoved: vi.fn(),
  rollbackEntryMove: vi.fn(),
  denyMoveUpRequest: vi.fn(),
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
    id: 'eligible-1',
    showId: 'show-1',
    classId: 'class-2',
    trialId: 'trial-1',
    dogId: 'dog-2',
    entryStatus: 'checked-in',
    jumpHeight: '16',
    handler: 'Taylor Rivera',
    armband: '8',
    created_at: '2026-06-02T10:00:00.000Z',
  },
  {
    id: 'eligible-2',
    showId: 'show-1',
    classId: 'class-1',
    trialId: 'trial-1',
    dogId: 'dog-1',
    entryStatus: 'confirmed',
    jumpHeight: '12',
    handler: 'Jamie Walker',
    armband: '12',
    created_at: '2026-06-03T10:00:00.000Z',
  },
  {
    id: 'pending-move-1',
    showId: 'show-1',
    classId: 'class-1',
    trialId: 'trial-1',
    dogId: 'dog-1',
    entryStatus: 'move-up-requested',
    jumpHeight: '12',
    specialRequests: 'Move to Open',
    created_at: '2026-06-01T09:00:00.000Z',
    updated_at: '2026-06-01T10:00:00.000Z',
    handler: 'Jamie Walker',
    armband: '12',
  },
  {
    id: 'deleted-entry',
    showId: 'show-1',
    classId: 'class-1',
    dogId: 'dog-1',
    entryStatus: 'confirmed',
    deletedAt: '2026-06-08T10:00:00.000Z',
  },
];

describe('move-up day-of read queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockReset();
    replicationMocks.getEntriesByShow.mockResolvedValue(entries);
    replicationMocks.getClassById.mockImplementation((classId: string) =>
      Promise.resolve({
        id: classId,
        name: classId === 'class-1' ? 'Novice A' : 'Open',
        classNumber: classId === 'class-1' ? '101' : '201',
        trialId: 'trial-1',
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

  it('loads move-up eligible entries from replicated entries/classes/dogs by class id', async () => {
    const result = await getMoveUpEligibleEntries('show-1');

    expect(replicationMocks.getEntriesByShow).toHaveBeenCalledWith('show-1');
    expect(replicationMocks.getClassById).toHaveBeenCalledWith('class-1');
    expect(replicationMocks.getDogById).toHaveBeenCalledWith('dog-1');
    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(result.data.map(entry => entry.id)).toEqual(['eligible-2', 'eligible-1']);
    expect(result.data[0]).toMatchObject({
      id: 'eligible-2',
      class_id: 'class-1',
      dog: { id: 'dog-1', name: 'Rocket Dog', call_name: 'Rocket' },
      class: { id: 'class-1', name: 'Novice A', class_number: '101', trial_id: 'trial-1' },
    });
  });

  it('loads pending move-up requests from the replica oldest first', async () => {
    const result = await getPendingMoveUpRequests('show-1');

    expect(replicationMocks.getEntriesByShow).toHaveBeenCalledWith('show-1');
    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'pending-move-1',
        entry_status: 'move-up-requested',
        special_requests: 'Move to Open',
        created_at: '2026-06-01T09:00:00.000Z',
      }),
    ]);
  });
});
