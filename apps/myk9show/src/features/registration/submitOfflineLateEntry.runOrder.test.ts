import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pendingByRunOrder } from '@myk9/ringside';
import { toRunQueueEntry } from '@/features/at-show/replicatedRunQueue';
import {
  entryToSupabaseRow,
  type ReplicatedEntry,
} from '@/services/replication/ReplicatedEntriesTable.mapper';
import { submitOfflineLateEntry } from './submitOfflineLateEntry';

const mocks = vi.hoisted(() => ({
  createEntry: vi.fn(),
  existingEntries: [] as Array<Record<string, unknown>>,
  refreshedEntries: null as Array<Record<string, unknown>> | null,
  classRows: [
    { id: 'class-1', trialId: 'trial-1', maxEntries: 20 },
    { id: 'class-2', trialId: 'trial-1', maxEntries: 20 },
  ],
}));

// This show has completed a scoped entries sync on this device (MYK9-761).
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getSyncMetadata: async () => ({ tableName: 'entries', totalRows: 1 }),
  },
}));

// The sync guard the capacity check runs first: on a cold or partial cache it
// fills the replica, so a snapshot taken before it is incomplete.
vi.mock('@/services/database/entries/requireShowEntriesSynced', () => ({
  requireShowEntriesSynced: async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    if (mocks.refreshedEntries) mocks.existingEntries = mocks.refreshedEntries;
  },
}));

vi.mock('@/features/offline-readiness/showStructureScopes', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/offline-readiness/showStructureScopes')>()),
  showStructureCoverage: async () => ({
    show: true,
    trials: true,
    classes: true,
    assignments: true,
  }),
}));

vi.mock('@/services/replication', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/replication')>()),
  replicatedEntriesTable: {
    createEntry: mocks.createEntry,
    getEntriesByShow: async () => mocks.existingEntries,
    getByShowWithStatus: async () => ({ ok: true, rows: mocks.existingEntries, error: null }),
  },
  replicatedDogsTable: { getPendingMutationIdsForRow: vi.fn().mockResolvedValue([]) },
  replicatedDogRegistrationsTable: { getPendingMutationIdsForDog: vi.fn().mockResolvedValue([]) },
  replicatedShowsTable: { getShowById: vi.fn().mockResolvedValue({ id: 'show-1' }) },
  replicatedClassesTable: {
    getAll: vi.fn().mockResolvedValue(mocks.classRows),
    getAllOrThrow: vi.fn().mockResolvedValue(mocks.classRows),
    getAllWithStatus: vi.fn().mockResolvedValue({ ok: true, rows: mocks.classRows, error: null }),
  },
  replicatedTrialsTable: {
    getTrialsByShow: vi.fn().mockResolvedValue([]),
    getByShowWithStatus: vi.fn().mockResolvedValue({
      ok: true,
      rows: [{ id: 'trial-1', date: '2026-10-10', showId: 'show-1' }],
      error: null,
    }),
  },
  replicatedJudgeAssignmentsTable: {
    getByShowId: vi.fn().mockResolvedValue([]),
    getByShowWithStatus: vi.fn().mockResolvedValue({ ok: true, rows: [], error: null }),
  },
  replicatedArmbandsTable: {
    getByShow: vi.fn().mockResolvedValue([{ id: 'a-1', dogId: 'dog-x', armbandNumber: '201' }]),
    upsertAssignedArmband: vi.fn().mockResolvedValue('armband-mutation-1'),
    getPendingMutationIdsForRow: vi.fn().mockResolvedValue([]),
  },
}));

function existing(id: string, classId: string, armband: string, runOrder: number | null) {
  return {
    id,
    showId: 'show-1',
    classId,
    armband,
    runOrder: runOrder ?? undefined,
    entryStatus: 'confirmed',
    entry_status: 'confirmed',
    isScored: false,
  };
}

function lateEntry(selections: Array<{ dogId: string; classId: string }>) {
  return {
    showId: 'show-1',
    paymentMethod: 'check' as const,
    showFeeInfo: { preEntryFee: '30', dayOfShowFee: '35', startDate: '2026-10-10' },
    classes: [
      { id: 'class-1', entryFee: 30 },
      { id: 'class-2', entryFee: 30 },
    ],
    classSelections: selections.map(({ dogId, classId }) => ({
      dogId,
      trialId: 'trial-1',
      selectedClasses: [{ classId }],
    })),
    handlerAssignments: {},
  };
}

function createdRows(): ReplicatedEntry[] {
  return mocks.createEntry.mock.calls.map(call => call[0] as ReplicatedEntry);
}

// MYK9-868 recurrence: a day-of mail-in kept run_order NULL through check-in
// and scoring because the late-entry writer never set one.
describe('submitOfflineLateEntry run order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.refreshedEntries = null;
    mocks.createEntry.mockImplementation(entry => Promise.resolve(entry));
    mocks.existingEntries = [
      existing('e-1', 'class-1', '101', 1),
      existing('e-2', 'class-1', '102', 2),
      existing('e-3', 'class-1', '103', 3),
    ];
  });

  it('appends the entry after the last run order in a class that already has one', async () => {
    await submitOfflineLateEntry(lateEntry([{ dogId: 'dog-1', classId: 'class-1' }]));

    const [created] = createdRows();
    expect(created?.runOrder).toBe(4);
    expect(created && entryToSupabaseRow(created).run_order).toBe(4);

    // The judge's list and the exhibitor's place in line both read this chain.
    const queue = pendingByRunOrder(
      [...(mocks.existingEntries as unknown as ReplicatedEntry[]), created as ReplicatedEntry].map(
        toRunQueueEntry
      )
    );
    expect(queue.map(row => row.id)).toEqual(['e-1', 'e-2', 'e-3', created?.id]);
    expect(queue.at(-1)?.exhibitorOrder).toBe(4);
  });

  it('numbers each added entry in the same class one after the other', async () => {
    await submitOfflineLateEntry(
      lateEntry([
        { dogId: 'dog-1', classId: 'class-1' },
        { dogId: 'dog-2', classId: 'class-1' },
      ])
    );

    expect(createdRows().map(row => row.runOrder)).toEqual([4, 5]);
  });

  it('leaves run order unset where the class has none yet (a preset places it later)', async () => {
    mocks.existingEntries = [existing('e-9', 'class-2', '109', null)];
    await submitOfflineLateEntry(lateEntry([{ dogId: 'dog-1', classId: 'class-2' }]));

    const [created] = createdRows();
    expect(created?.runOrder).toBeUndefined();
    expect(created && entryToSupabaseRow(created).run_order).toBeNull();
  });

  it('allocates from the entries the sync guard refreshed, not a stale snapshot', async () => {
    mocks.existingEntries = [existing('e-1', 'class-1', '101', 1)];
    mocks.refreshedEntries = [
      existing('e-1', 'class-1', '101', 1),
      existing('e-2', 'class-1', '102', 2),
      existing('e-3', 'class-1', '103', 3),
    ];
    await submitOfflineLateEntry(lateEntry([{ dogId: 'dog-1', classId: 'class-1' }]));

    expect(createdRows().map(row => row.runOrder)).toEqual([4]);
  });
});
