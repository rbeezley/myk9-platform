import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase } from '@/test/mocks/supabase';
import { createDayOfEntry } from '../entries';

const replicationMocks = vi.hoisted(() => ({
  getEntriesByShow: vi.fn(),
  getClassById: vi.fn(),
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
});
