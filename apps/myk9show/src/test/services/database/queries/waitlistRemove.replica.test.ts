// MYK9-1000: Remove hard-deletes the server row, so the replica row must go too
// or the dog stays in the queue, the class count and the printed report.
import { createDatabaseError } from '@/services/database/databaseError';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReplicatedWaitlistEntry } from '@/services/replication/ReplicatedWaitlistEntriesTable';

const h = vi.hoisted(() => ({
  rows: [] as ReplicatedWaitlistEntry[],
  deleteResult: { data: { id: 'wl-1' } as unknown, error: null as unknown },
}));

vi.mock('@/services/replication/ReplicatedWaitlistEntriesTable', () => ({
  replicatedWaitlistEntriesTable: {
    getByClass: async (classId: string) => h.rows.filter(r => r.classId === classId),
    getAllOrThrow: async () => h.rows,
    delete: async (id: string) => {
      h.rows = h.rows.filter(r => r.id !== id);
    },
  },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: {
    getTrialsByShow: async () => [
      { id: 'trial-1', showId: 'show-1', name: 'T', date: '2026-04-01' },
    ],
  },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: {
    getClassById: async () => ({ id: 'class-1', name: 'Novice A', trialId: 'trial-1' }),
    getClassesByTrial: async () => [{ id: 'class-1', name: 'Novice A', trialId: 'trial-1' }],
  },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { getDogById: async () => ({ id: 'dog-1', callName: 'Rexy' }) },
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { getAllOrThrow: async () => [] },
}));
vi.mock('@/services/database/supabaseClient', () => {
  const chain: Record<string, unknown> = {};
  chain.delete = () => chain;
  chain.eq = () => chain;
  chain.select = () => chain;
  chain.single = () => Promise.resolve(h.deleteResult);
  return { supabase: { from: () => chain }, logQuery: vi.fn(), createDatabaseError };
});

import {
  getWaitlistByClass,
  getClassesWithWaitlistCounts,
  removeFromWaitlist,
} from '@/services/database/waitlists';

const row = (id: string, position: number): ReplicatedWaitlistEntry => ({
  id,
  classId: 'class-1',
  dogId: 'dog-1',
  position,
  status: 'waiting',
});

describe('removeFromWaitlist keeps the replica in step', () => {
  beforeEach(() => {
    h.rows = [row('wl-1', 1), row('wl-2', 2)];
    h.deleteResult = { data: { id: 'wl-1' }, error: null };
  });

  it('drops the removed row from the queue and the class count', async () => {
    const { error } = await removeFromWaitlist('wl-1');
    expect(error).toBeNull();

    const queue = await getWaitlistByClass('class-1');
    expect(queue.data.map(e => e.id)).toEqual(['wl-2']);
    const counts = await getClassesWithWaitlistCounts('show-1');
    expect(counts.data[0]?.waitlist_count).toBe(1);
  });

  it('keeps the row when the server delete fails', async () => {
    h.deleteResult = { data: null, error: { message: 'boom' } };
    const { error } = await removeFromWaitlist('wl-1');
    expect(error).not.toBeNull();
    expect((await getWaitlistByClass('class-1')).data).toHaveLength(2);
  });
});
