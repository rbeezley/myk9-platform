/**
 * MYK9-717: the Waitlist Report reads `waitlist_entries` through the same
 * replication-first reads as the Entries → Waitlist tab, never `entries`.
 */
import { createDatabaseError } from '@/services/database/databaseError';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReplicatedWaitlistEntry } from '@/services/replication/ReplicatedWaitlistEntriesTable';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';

const {
  mockWaitlistTable,
  mockTrialsTable,
  mockClassesTable,
  mockDogsTable,
  mockEntriesTable,
  mockLoadHandlerPeople,
} = vi.hoisted(() => ({
  mockWaitlistTable: { getByClass: vi.fn(), getAll: vi.fn() },
  mockTrialsTable: { getTrialsByShow: vi.fn() },
  mockClassesTable: { getClassesByTrial: vi.fn(), getClassById: vi.fn() },
  mockDogsTable: { getDogById: vi.fn() },
  mockEntriesTable: { getAll: vi.fn() },
  mockLoadHandlerPeople: vi.fn(),
}));

vi.mock('@/services/replication/ReplicatedWaitlistEntriesTable', () => ({
  replicatedWaitlistEntriesTable: mockWaitlistTable,
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: mockTrialsTable,
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: mockClassesTable,
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: mockDogsTable,
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: mockEntriesTable,
}));
vi.mock('@/services/database/entries/handlerHydration', () => ({
  loadHandlerPeople: mockLoadHandlerPeople,
}));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
  logQuery: vi.fn(),
  createDatabaseError,
}));

import { getWaitlistReportRows } from '@/services/database/waitlists';

const classes: Record<string, ReplicatedClass> = {
  'class-1': { id: 'class-1', name: 'Container Novice', trialId: 'trial-1', maxEntries: 2 },
  'class-2': { id: 'class-2', name: 'Interior Novice', trialId: 'trial-1', maxEntries: 2 },
};

const dogs: Record<string, ReplicatedDog> = {
  'dog-1': { id: 'dog-1', name: 'Buddy', callName: 'Buddy', breed: 'Lab', ownerId: 'owner-1' },
  'dog-2': { id: 'dog-2', name: 'Rex', callName: 'Rex', breed: 'Beagle', ownerId: 'owner-2' },
};

function waiting(overrides: Partial<ReplicatedWaitlistEntry>): ReplicatedWaitlistEntry {
  return {
    id: 'wl',
    classId: 'class-1',
    dogId: 'dog-1',
    exhibitorId: 'exhib-1',
    position: 1,
    status: 'waiting',
    ...overrides,
  };
}

describe('getWaitlistReportRows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTrialsTable.getTrialsByShow.mockResolvedValue([
      { id: 'trial-1', showId: 'show-1', name: 'Saturday', date: '2026-04-01' },
    ]);
    mockClassesTable.getClassesByTrial.mockResolvedValue(Object.values(classes));
    mockClassesTable.getClassById.mockImplementation(async (id: string) => classes[id] ?? null);
    mockDogsTable.getDogById.mockImplementation(async (id: string) => dogs[id] ?? null);
    mockEntriesTable.getAll.mockResolvedValue([]);
    mockLoadHandlerPeople.mockResolvedValue(
      new Map([
        ['handler-9', { id: 'handler-9', first_name: 'Jane', last_name: 'Mitchell' }],
        ['owner-2', { id: 'owner-2', first_name: 'Bob', last_name: 'Smith' }],
      ])
    );
  });

  it('joins dog, handler and class for every waiting row, in position order', async () => {
    const rows = [
      waiting({ id: 'wl-2', dogId: 'dog-2', position: 2 }),
      waiting({ id: 'wl-1', dogId: 'dog-1', position: 1, handlerId: 'handler-9' }),
      // An offer already went out: the Waitlist tab no longer lists it as waiting.
      waiting({ id: 'wl-x', dogId: 'dog-2', classId: 'class-2', status: 'offered' }),
    ];
    mockWaitlistTable.getAll.mockResolvedValue(rows);
    mockWaitlistTable.getByClass.mockImplementation(async (classId: string) =>
      rows.filter(r => r.classId === classId)
    );

    await expect(getWaitlistReportRows('show-1')).resolves.toEqual([
      { id: 'wl-1', classId: 'class-1', position: 1, callName: 'Buddy', handler: 'Jane Mitchell' },
      // No handler named on the waitlist row: fall back to the dog's owner.
      { id: 'wl-2', classId: 'class-1', position: 2, callName: 'Rex', handler: 'Bob Smith' },
    ]);
    expect([...mockLoadHandlerPeople.mock.calls[0][0]].sort()).toEqual(['handler-9', 'owner-2']);
    // Only the class that has someone waiting is read row-by-row.
    expect(mockWaitlistTable.getByClass).toHaveBeenCalledTimes(1);
    expect(mockWaitlistTable.getByClass).toHaveBeenCalledWith('class-1');
  });

  it('returns no rows and skips the people read when nobody is waiting', async () => {
    mockWaitlistTable.getAll.mockResolvedValue([]);
    await expect(getWaitlistReportRows('show-1')).resolves.toEqual([]);
    expect(mockLoadHandlerPeople).not.toHaveBeenCalled();
  });

  it('rejects instead of reporting an empty waitlist when the read fails', async () => {
    mockWaitlistTable.getAll.mockRejectedValue(new Error('IndexedDB unavailable'));
    await expect(getWaitlistReportRows('show-1')).rejects.toBeTruthy();
  });
});
