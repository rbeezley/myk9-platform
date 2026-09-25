import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { submitOfflineLateEntry } from './submitOfflineLateEntry';

const mocks = vi.hoisted(() => ({
  createEntry: vi.fn(),
  dogPending: vi.fn(),
}));

// This show has completed a scoped entries sync on this device (MYK9-761).
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getSyncMetadata: async () => ({ tableName: 'entries', totalRows: 1 }),
  },
}));

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    createEntry: mocks.createEntry,
    getEntriesByShow: vi.fn().mockResolvedValue([]),
  },
  replicatedDogsTable: { getPendingMutationIdsForRow: mocks.dogPending },
  replicatedDogRegistrationsTable: { getPendingMutationIdsForDog: vi.fn().mockResolvedValue([]) },
  replicatedShowsTable: { getShowById: vi.fn().mockResolvedValue({ id: 'show-1' }) },
  replicatedClassesTable: {
    getAll: vi.fn().mockResolvedValue([{ id: 'class-1', trialId: 'trial-1', maxEntries: 10 }]),
  },
  replicatedTrialsTable: { getTrialsByShow: vi.fn().mockResolvedValue([]) },
  replicatedJudgeAssignmentsTable: { getByShowId: vi.fn().mockResolvedValue([]) },
  replicatedArmbandsTable: {
    getByShow: vi.fn().mockResolvedValue([]),
    upsertAssignedArmband: vi.fn().mockResolvedValue('armband-mutation-1'),
    getPendingMutationIdsForRow: vi.fn().mockResolvedValue([]),
  },
}));

// MYK9-749 (#2348 review): the submission decides "day of show" once, so every
// entry lands in one bucket even across midnight. The FEE must come from that
// same judgement, not from a fresh clock read per entry, or the stored flag and
// the charged fee disagree for an entry keyed at 23:59 show time.
describe('submitOfflineLateEntry across show-time midnight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // 23:59:59 CDT on the eve of the show: a pre-entry.
    vi.setSystemTime(new Date('2026-07-01T04:59:59Z'));
    mocks.createEntry.mockImplementation(entry => Promise.resolve(entry));
    // The clock crosses midnight while the batch is being built.
    mocks.dogPending.mockImplementation(async () => {
      vi.setSystemTime(new Date('2026-07-01T05:00:01Z'));
      return [];
    });
  });

  afterEach(() => vi.useRealTimers());

  it('charges the fee of the bucket it records', async () => {
    await submitOfflineLateEntry({
      showId: 'show-1',
      paymentMethod: 'check',
      showFeeInfo: {
        preEntryFee: '30',
        dayOfShowFee: '35',
        startDate: '2026-07-01T00:00:00+00:00',
        entryCloseDate: '2026-08-01T00:00:00+00:00',
        entryWindowTimezone: 'America/Chicago',
      },
      classes: [{ id: 'class-1', entryFee: 30 }],
      classSelections: [
        { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
      ],
      handlerAssignments: {},
    });

    expect(mocks.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ isDayOfShow: false, entryFee: 30 }),
      expect.anything()
    );
  });
});
